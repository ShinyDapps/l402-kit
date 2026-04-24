package l402kit

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// BlinkProvider creates Lightning invoices via the Blink (blink.sv) GraphQL API.
// Get credentials at dashboard.blink.sv.
type BlinkProvider struct {
	apiKey   string
	walletID string
	baseURL  string // overridable for tests; defaults to production Blink API
}

// NewBlinkProvider returns a BlinkProvider ready to use with Middleware.
func NewBlinkProvider(apiKey, walletID string) *BlinkProvider {
	return &BlinkProvider{apiKey: apiKey, walletID: walletID, baseURL: "https://api.blink.sv/graphql"}
}

// SetBaseURL overrides the Blink API endpoint. Intended for tests only.
func (b *BlinkProvider) SetBaseURL(url string) { b.baseURL = url }

func (b *BlinkProvider) CreateInvoice(ctx context.Context, amountSats int) (Invoice, error) {
	body := fmt.Sprintf(
		`{"query":"mutation { lnInvoiceCreate(input: { walletId: \"%s\", amount: %d }) { invoice { paymentRequest paymentHash } errors { message } } }"}`,
		b.walletID, amountSats,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.baseURL, bytes.NewBufferString(body))
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
	if resp.StatusCode != http.StatusOK {
		return Invoice{}, fmt.Errorf("blink: HTTP %d", resp.StatusCode)
	}

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

// ── OpenNodeProvider ──────────────────────────────────────────────────────────

// OpenNodeProvider creates invoices via OpenNode. Free sandbox available.
// Get API key: app.opennode.com → API Keys
type OpenNodeProvider struct {
	apiKey  string
	baseURL string
}

// NewOpenNodeProvider returns a production OpenNode provider.
// Pass testMode=true to use dev-api.opennode.com (sandbox).
func NewOpenNodeProvider(apiKey string, testMode bool) *OpenNodeProvider {
	base := "https://api.opennode.com"
	if testMode {
		base = "https://dev-api.opennode.com"
	}
	return &OpenNodeProvider{apiKey: apiKey, baseURL: base}
}

func (p *OpenNodeProvider) CreateInvoice(ctx context.Context, amountSats int) (Invoice, error) {
	body, _ := json.Marshal(map[string]any{
		"amount":      amountSats,
		"description": "L402 API access",
		"currency":    "SATS",
		"auto_settle": false,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/v1/charges", bytes.NewReader(body))
	if err != nil {
		return Invoice{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", p.apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Invoice{}, fmt.Errorf("opennode: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return Invoice{}, fmt.Errorf("opennode: HTTP %d", resp.StatusCode)
	}

	var result struct {
		Data struct {
			ID               string `json:"id"`
			LightningInvoice struct {
				Payreq string `json:"payreq"`
			} `json:"lightning_invoice"`
		} `json:"data"`
	}
	raw, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(raw, &result); err != nil {
		return Invoice{}, fmt.Errorf("opennode: %w", err)
	}

	exp := time.Now().Add(time.Hour).UnixMilli()
	mac, err := newMacaroon(result.Data.ID, exp)
	if err != nil {
		return Invoice{}, err
	}
	return Invoice{
		PaymentRequest: result.Data.LightningInvoice.Payreq,
		PaymentHash:    result.Data.ID,
		Macaroon:       mac,
		AmountSats:     amountSats,
	}, nil
}

// ── LNbitsProvider ────────────────────────────────────────────────────────────

// LNbitsProvider creates invoices via a LNbits instance (self-hosted or legend.lnbits.com).
// Get key: your-lnbits.com → API info → Invoice/read key
type LNbitsProvider struct {
	apiKey  string
	baseURL string
}

// NewLNbitsProvider returns an LNbitsProvider. baseURL defaults to legend.lnbits.com.
func NewLNbitsProvider(apiKey, baseURL string) *LNbitsProvider {
	if baseURL == "" {
		baseURL = "https://legend.lnbits.com"
	}
	return &LNbitsProvider{apiKey: apiKey, baseURL: strings.TrimRight(baseURL, "/")}
}

func (p *LNbitsProvider) CreateInvoice(ctx context.Context, amountSats int) (Invoice, error) {
	body, _ := json.Marshal(map[string]any{
		"out":    false,
		"amount": amountSats,
		"memo":   "L402 API access",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/api/v1/payments", bytes.NewReader(body))
	if err != nil {
		return Invoice{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-Key", p.apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Invoice{}, fmt.Errorf("lnbits: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return Invoice{}, fmt.Errorf("lnbits: HTTP %d", resp.StatusCode)
	}

	var result struct {
		PaymentRequest string `json:"payment_request"`
		PaymentHash    string `json:"payment_hash"`
	}
	raw, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(raw, &result); err != nil {
		return Invoice{}, fmt.Errorf("lnbits: %w", err)
	}

	exp := time.Now().Add(time.Hour).UnixMilli()
	mac, err := newMacaroon(result.PaymentHash, exp)
	if err != nil {
		return Invoice{}, err
	}
	return Invoice{
		PaymentRequest: result.PaymentRequest,
		PaymentHash:    result.PaymentHash,
		Macaroon:       mac,
		AmountSats:     amountSats,
	}, nil
}

// ── AlbyProvider ─────────────────────────────────────────────────────────────

// AlbyProvider creates invoices via an Alby Hub instance.
// Setup: hub.getalby.com → Settings → Access Tokens (scope: invoices:create)
type AlbyProvider struct {
	accessToken string
	hubURL      string
}

// NewAlbyProvider returns an AlbyProvider.
// hubURL example: "https://your-name.getalby.com"
func NewAlbyProvider(accessToken, hubURL string) *AlbyProvider {
	return &AlbyProvider{
		accessToken: accessToken,
		hubURL:      strings.TrimRight(hubURL, "/"),
	}
}

func (p *AlbyProvider) CreateInvoice(ctx context.Context, amountSats int) (Invoice, error) {
	body, _ := json.Marshal(map[string]any{
		"amount":      amountSats * 1000, // Alby uses millisatoshis
		"description": "L402 API access",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.hubURL+"/api/invoices", bytes.NewReader(body))
	if err != nil {
		return Invoice{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Invoice{}, fmt.Errorf("alby: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return Invoice{}, fmt.Errorf("alby: HTTP %d", resp.StatusCode)
	}

	var result struct {
		PaymentHash    string `json:"payment_hash"`
		PaymentRequest string `json:"payment_request"`
	}
	raw, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(raw, &result); err != nil {
		return Invoice{}, fmt.Errorf("alby: %w", err)
	}
	if result.PaymentHash == "" || result.PaymentRequest == "" {
		return Invoice{}, fmt.Errorf("alby: unexpected response format")
	}

	exp := time.Now().Add(time.Hour).UnixMilli()
	mac, err := newMacaroon(result.PaymentHash, exp)
	if err != nil {
		return Invoice{}, err
	}
	return Invoice{
		PaymentRequest: result.PaymentRequest,
		PaymentHash:    result.PaymentHash,
		Macaroon:       mac,
		AmountSats:     amountSats,
	}, nil
}

// ── BTCPayProvider ────────────────────────────────────────────────────────────

// BTCPayProvider creates invoices via a BTCPay Server instance.
// Setup: Store → Lightning → Settings → Account → API Keys
// Required scope: btcpay.store.cancreatelightninginvoice
type BTCPayProvider struct {
	serverURL string
	apiKey    string
	storeID   string
}

// NewBTCPayProvider returns a BTCPayProvider.
// serverURL example: "https://btcpay.yourdomain.com"
func NewBTCPayProvider(serverURL, apiKey, storeID string) *BTCPayProvider {
	return &BTCPayProvider{
		serverURL: strings.TrimRight(serverURL, "/"),
		apiKey:    apiKey,
		storeID:   storeID,
	}
}

func (p *BTCPayProvider) CreateInvoice(ctx context.Context, amountSats int) (Invoice, error) {
	endpoint := fmt.Sprintf("%s/api/v1/stores/%s/lightning/BTC/invoices", p.serverURL, p.storeID)
	body, _ := json.Marshal(map[string]any{
		"amount":      fmt.Sprintf("%d", amountSats*1000), // BTCPay uses msats as string
		"description": "L402 API access",
		"expiry":      3600,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return Invoice{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "token "+p.apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Invoice{}, fmt.Errorf("btcpay: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return Invoice{}, fmt.Errorf("btcpay: HTTP %d", resp.StatusCode)
	}

	var result struct {
		BOLT11      string `json:"BOLT11"`
		PaymentHash string `json:"paymentHash"`
	}
	raw, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(raw, &result); err != nil {
		return Invoice{}, fmt.Errorf("btcpay: %w", err)
	}
	if result.BOLT11 == "" || result.PaymentHash == "" {
		return Invoice{}, fmt.Errorf("btcpay: unexpected response format")
	}

	exp := time.Now().Add(time.Hour).UnixMilli()
	mac, err := newMacaroon(result.PaymentHash, exp)
	if err != nil {
		return Invoice{}, err
	}
	return Invoice{
		PaymentRequest: result.BOLT11,
		PaymentHash:    result.PaymentHash,
		Macaroon:       mac,
		AmountSats:     amountSats,
	}, nil
}

// ── ManagedProvider ───────────────────────────────────────────────────────────

const shinydappsAPI = "https://l402kit.com"

// ManagedProvider creates invoices via the l402kit.com hosted service.
// Zero infrastructure needed — invoices and splits handled server-side.
// Fee: 0.3% per payment (99.7% goes to your Lightning Address).
//
// For sovereign mode (0% fee) use BlinkProvider, AlbyProvider, etc.
type ManagedProvider struct {
	ownerAddress string
	apiURL       string
}

// NewManagedProvider returns a ManagedProvider that routes payments to ownerAddress.
//
//	provider := l402kit.NewManagedProvider("you@blink.sv")
func NewManagedProvider(ownerAddress string) *ManagedProvider {
	apiURL := os.Getenv("SHINYDAPPS_API_URL")
	if apiURL == "" {
		apiURL = shinydappsAPI
	}
	return &ManagedProvider{ownerAddress: ownerAddress, apiURL: apiURL}
}

func (p *ManagedProvider) CreateInvoice(ctx context.Context, amountSats int) (Invoice, error) {
	body, _ := json.Marshal(map[string]any{
		"amountSats":   amountSats,
		"ownerAddress": p.ownerAddress,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL+"/api/invoice", bytes.NewReader(body))
	if err != nil {
		return Invoice{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Invoice{}, fmt.Errorf("managed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Invoice{}, fmt.Errorf("managed: HTTP %d", resp.StatusCode)
	}

	var result struct {
		PaymentRequest string `json:"paymentRequest"`
		PaymentHash    string `json:"paymentHash"`
		Macaroon       string `json:"macaroon"`
	}
	raw, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(raw, &result); err != nil {
		return Invoice{}, fmt.Errorf("managed: %w", err)
	}
	return Invoice{
		PaymentRequest: result.PaymentRequest,
		PaymentHash:    result.PaymentHash,
		Macaroon:       result.Macaroon,
		AmountSats:     amountSats,
	}, nil
}
