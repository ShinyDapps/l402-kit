package l402kit

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

// Invoice represents a Lightning payment request created by a provider.
type Invoice struct {
	PaymentRequest string
	PaymentHash    string
	Macaroon       string
	AmountSats     int
}

// LightningProvider is the interface for creating Lightning invoices.
// Implement this to plug in any Lightning backend.
type LightningProvider interface {
	CreateInvoice(ctx context.Context, amountSats int) (Invoice, error)
}

// Options configures the L402 middleware.
type Options struct {
	// PriceSats is the cost per API call in satoshis.
	PriceSats int

	// OwnerLightningAddress enables zero-config managed mode.
	// Example: "you@yourdomain.com"
	// The ShinyDapps backend creates invoices and you receive 99.7% of each payment.
	OwnerLightningAddress string

	// Lightning allows plugging in a custom Lightning provider (advanced use).
	Lightning LightningProvider

	// OnPayment is an optional callback called after a valid payment is verified.
	OnPayment func(token L402Token, amountSats int)
}

const shinydappsAPI = "https://l402kit.com"

// managedProvider uses the ShinyDapps backend to create invoices (zero-config mode).
type managedProvider struct {
	ownerAddress string
}

func (m *managedProvider) CreateInvoice(ctx context.Context, amountSats int) (Invoice, error) {
	body, _ := json.Marshal(map[string]any{"amountSats": amountSats})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, shinydappsAPI+"/api/invoice", bytes.NewReader(body))
	if err != nil {
		return Invoice{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Invoice{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return Invoice{}, fmt.Errorf("shinydapps invoice API returned %d", resp.StatusCode)
	}

	var data struct {
		PaymentRequest string `json:"paymentRequest"`
		PaymentHash    string `json:"paymentHash"`
		Macaroon       string `json:"macaroon"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return Invoice{}, err
	}
	return Invoice{
		PaymentRequest: data.PaymentRequest,
		PaymentHash:    data.PaymentHash,
		Macaroon:       data.Macaroon,
		AmountSats:     amountSats,
	}, nil
}

func (m *managedProvider) sendSplit(ctx context.Context, amountSats int) {
	body, _ := json.Marshal(map[string]any{
		"amountSats":   amountSats,
		"ownerAddress": m.ownerAddress,
	})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, shinydappsAPI+"/api/split", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-split-secret", os.Getenv("SPLIT_SECRET"))
	http.DefaultClient.Do(req) //nolint:errcheck â€” fire and forget
}

// Middleware returns an http.Handler that enforces L402 payment before calling next.
//
//	mux.Handle("/api/data", l402kit.Middleware(l402kit.Options{
//	    PriceSats:             10,
//	    OwnerLightningAddress: "you@yourdomain.com",
//	}, myHandler))
func Middleware(opts Options, next http.Handler) http.Handler {
	var provider LightningProvider
	var managed *managedProvider

	if opts.Lightning != nil {
		provider = opts.Lightning
	} else if opts.OwnerLightningAddress != "" {
		managed = &managedProvider{ownerAddress: opts.OwnerLightningAddress}
		provider = managed
	} else {
		panic(ErrNoProvider)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")

		if len(auth) > 5 && auth[:5] == "L402 " {
			token := auth[5:]
			valid, _ := VerifyToken(token)

			if valid {
				t, _ := ParseToken(token)

				if !CheckAndMarkPreimage(t.Preimage) {
					writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Token already used"})
					return
				}

				if managed != nil {
					go managed.sendSplit(r.Context(), opts.PriceSats)
				}
				if opts.OnPayment != nil {
					opts.OnPayment(t, opts.PriceSats)
				}

				next.ServeHTTP(w, r)
				return
			}
		}

		// No valid token â€” create invoice and return 402
		inv, err := provider.CreateInvoice(r.Context(), opts.PriceSats)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		w.Header().Set("WWW-Authenticate", fmt.Sprintf(
			`L402 macaroon="%s", invoice="%s"`,
			inv.Macaroon, inv.PaymentRequest,
		))
		writeJSON(w, http.StatusPaymentRequired, map[string]any{
			"error":     "Payment Required",
			"priceSats": opts.PriceSats,
			"invoice":   inv.PaymentRequest,
			"macaroon":  inv.Macaroon,
		})
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}
