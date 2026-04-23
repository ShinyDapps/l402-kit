package l402kit

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// BlinkProvider creates Lightning invoices via the Blink (blink.sv) GraphQL API.
// Get credentials at dashboard.blink.sv.
type BlinkProvider struct {
	apiKey   string
	walletID string
}

// NewBlinkProvider returns a BlinkProvider ready to use with Middleware.
func NewBlinkProvider(apiKey, walletID string) *BlinkProvider {
	return &BlinkProvider{apiKey: apiKey, walletID: walletID}
}

func (b *BlinkProvider) CreateInvoice(ctx context.Context, amountSats int) (Invoice, error) {
	body := fmt.Sprintf(
		`{"query":"mutation { lnInvoiceCreate(input: { walletId: \"%s\", amount: %d }) { invoice { paymentRequest paymentHash } errors { message } } }"}`,
		b.walletID, amountSats,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.blink.sv/graphql", bytes.NewBufferString(body))
	if err != nil {
		return Invoice{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-KEY", b.apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Invoice{}, fmt.Errorf("blink: %w", err)
	}
	defer resp.Body.Close()

	var gql struct {
		Data struct {
			LnInvoiceCreate struct {
				Invoice struct {
					PaymentRequest string `json:"paymentRequest"`
					PaymentHash    string `json:"paymentHash"`
				} `json:"invoice"`
				Errors []struct {
					Message string `json:"message"`
				} `json:"errors"`
			} `json:"lnInvoiceCreate"`
		} `json:"data"`
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return Invoice{}, err
	}
	if err := json.Unmarshal(raw, &gql); err != nil {
		return Invoice{}, fmt.Errorf("blink: %w", err)
	}
	r := gql.Data.LnInvoiceCreate
	if len(r.Errors) > 0 {
		return Invoice{}, fmt.Errorf("blink: %s", r.Errors[0].Message)
	}

	exp := time.Now().Add(time.Hour).UnixMilli()
	mac, err := newMacaroon(r.Invoice.PaymentHash, exp)
	if err != nil {
		return Invoice{}, err
	}
	return Invoice{
		PaymentRequest: r.Invoice.PaymentRequest,
		PaymentHash:    r.Invoice.PaymentHash,
		Macaroon:       mac,
		AmountSats:     amountSats,
	}, nil
}

func newMacaroon(paymentHash string, expMs int64) (string, error) {
	data, err := json.Marshal(map[string]any{"hash": paymentHash, "exp": expMs})
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}
