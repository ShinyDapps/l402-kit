package l402kit

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// L402CloudEvent — CloudEvents 1.0 envelope for L402 behavioral events.
// Mirrors TS src/types/events.ts.
type L402CloudEvent struct {
	SpecVersion     string         `json:"specversion"`
	Type            string         `json:"type"`
	Source          string         `json:"source"`
	ID              string         `json:"id"`
	Time            string         `json:"time"`
	Subject         string         `json:"subject"`
	DataContentType string         `json:"datacontenttype"`
	Data            L402EventData  `json:"data"`
}

// L402EventData — payload for an L402 behavioral event.
type L402EventData struct {
	AgentID    string        `json:"agent_id,omitempty"`
	SessionID  string        `json:"session_id"`
	RequestID  string        `json:"request_id"`
	Endpoint   string        `json:"endpoint"`
	EventType  string        `json:"event_type"`
	Network    *LawNNetwork  `json:"network,omitempty"`
	Payment    *LawNPayment  `json:"payment,omitempty"`
	Behavior   *LawNBehavior `json:"behavior,omitempty"`
	Timing     *LawNTiming   `json:"timing,omitempty"`
	Risk       *LawNRisk     `json:"risk,omitempty"`
}

type LawNNetwork struct {
	Provider  string `json:"provider,omitempty"`
	Transport string `json:"transport"`
	Region    string `json:"region,omitempty"`
}

type LawNPayment struct {
	AmountSats   int64  `json:"amount_sats"`
	InvoiceHash  string `json:"invoice_hash,omitempty"`
	PreimageHash string `json:"preimage_hash,omitempty"`
	Settled      *bool  `json:"settled,omitempty"`
	LatencyMs    *int64 `json:"latency_ms,omitempty"`
}

type LawNBehavior struct {
	RetryCount         *int  `json:"retry_count,omitempty"`
	BudgetRemaining    *int  `json:"budget_remaining,omitempty"`
	BudgetExhausted    *bool `json:"budget_exhausted,omitempty"`
	CaveatViolations   *int  `json:"caveat_violations,omitempty"`
	ProofReuseAttempt  *bool `json:"proof_reuse_attempt,omitempty"`
}

type LawNTiming struct {
	ClientSentAt        *int64 `json:"client_sent_at,omitempty"`
	InvoiceReceivedAt   *int64 `json:"invoice_received_at,omitempty"`
	PaymentCompletedAt  *int64 `json:"payment_completed_at,omitempty"`
}

type LawNRisk struct {
	Severity   *float64 `json:"severity,omitempty"`
	TrustScore *float64 `json:"trust_score,omitempty"`
	DriftScore *float64 `json:"drift_score,omitempty"`
}

// CreateLawNAdapter returns a fire-and-forget function that forwards
// L402CloudEvent to a LAW-N ingest endpoint signed with HMAC-SHA256.
//
// Port of TS src/integrations/law-n-adapter.ts. Contract:
//   - POST JSON over HTTPS
//   - Header X-LAW-N-Signature: sha256=<hex digest>
//   - Header X-LAW-N-Request-Id: random hex per call
//   - Spawns a goroutine — caller does NOT wait for delivery
//   - Network errors are swallowed (behavioral writes must never block payments)
//   - Configurable timeout
//
// Example:
//
//	onEvent := l402kit.CreateLawNAdapter(
//	    "https://law-n.sageworks.ai/ingest/events",
//	    os.Getenv("LAWN_SECRET"),
//	    5*time.Second,
//	)
//	// Wire onEvent into your L402 middleware's event hook
func CreateLawNAdapter(endpoint, secret string, timeout time.Duration) func(L402CloudEvent) {
	secretBytes := []byte(secret)
	client := &http.Client{Timeout: timeout}

	return func(event L402CloudEvent) {
		body, err := json.Marshal(event)
		if err != nil {
			return
		}
		mac := hmac.New(sha256.New, secretBytes)
		mac.Write(body)
		sig := hex.EncodeToString(mac.Sum(nil))

		ridBytes := make([]byte, 8)
		if _, err := rand.Read(ridBytes); err != nil {
			return
		}
		requestID := hex.EncodeToString(ridBytes)

		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), timeout)
			defer cancel()
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
			if err != nil {
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-LAW-N-Signature", fmt.Sprintf("sha256=%s", sig))
			req.Header.Set("X-LAW-N-Request-Id", requestID)
			resp, err := client.Do(req)
			if err != nil {
				return
			}
			resp.Body.Close()
		}()
	}
}
