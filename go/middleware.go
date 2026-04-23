package l402kit

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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

	// Lightning is your Lightning provider — required.
	// Use NewBlinkProvider, NewAlbyProvider, NewBtcPayProvider, or NewManagedProvider.
	Lightning LightningProvider

	// OnPayment is an optional callback called after a valid payment is verified.
	OnPayment func(token L402Token, amountSats int)

	// Deprecated: use Lightning: NewManagedProvider(address) instead.
	OwnerLightningAddress string
}

// Middleware returns an http.Handler that enforces L402 payment before calling next.
//
//	blink := l402kit.NewBlinkProvider(os.Getenv("BLINK_API_KEY"), os.Getenv("BLINK_WALLET_ID"))
//	mux.Handle("/api/data", l402kit.Middleware(l402kit.Options{
//	    PriceSats: 10,
//	    Lightning: blink,
//	}, myHandler))
func Middleware(opts Options, next http.Handler) http.Handler {
	if opts.Lightning == nil {
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

				if opts.OnPayment != nil {
					opts.OnPayment(t, opts.PriceSats)
				}

				next.ServeHTTP(w, r)
				return
			}
		}

		// No valid token — create invoice and return 402
		inv, err := opts.Lightning.CreateInvoice(r.Context(), opts.PriceSats)
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
