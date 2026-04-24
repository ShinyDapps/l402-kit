package l402kit

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// WebhookEvent is the payload POSTed to your webhook URL after a payment.
type WebhookEvent struct {
	ID      string           `json:"id"`
	Type    string           `json:"type"`
	Created int64            `json:"created"`
	Data    WebhookEventData `json:"data"`
}

// WebhookEventData contains the payment details.
type WebhookEventData struct {
	Endpoint    string `json:"endpoint"`
	AmountSats  int    `json:"amountSats"`
	Preimage    string `json:"preimage"`
	PaymentHash string `json:"paymentHash"`
}

// BuildSignatureHeader returns the l402-signature header value for a payload.
// Format: "t=<unix_ts>,v1=<hmac_hex>" — identical to Stripe's scheme.
func BuildSignatureHeader(secret string, timestamp int64, body string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("%d.%s", timestamp, body)))
	return fmt.Sprintf("t=%d,v1=%s", timestamp, hex.EncodeToString(mac.Sum(nil)))
}

// VerifyWebhook verifies the l402-signature header and returns the parsed event.
// Returns an error if the signature is invalid or the timestamp is stale.
//
//	body := string(rawBodyBytes)
//	event, err := l402kit.VerifyWebhook(os.Getenv("L402_WEBHOOK_SECRET"), body, r.Header.Get("l402-signature"))
//	if err != nil {
//	    http.Error(w, "invalid webhook", http.StatusUnauthorized)
//	    return
//	}
func VerifyWebhook(secret, rawBody, signatureHeader string, toleranceSecs ...int) (WebhookEvent, error) {
	tol := 300
	if len(toleranceSecs) > 0 {
		tol = toleranceSecs[0]
	}

	if signatureHeader == "" {
		return WebhookEvent{}, fmt.Errorf("l402: missing l402-signature header")
	}

	parts := map[string]string{}
	for _, chunk := range strings.Split(signatureHeader, ",") {
		if eq := strings.IndexByte(chunk, '='); eq != -1 {
			parts[chunk[:eq]] = chunk[eq+1:]
		}
	}

	tsStr, ok := parts["t"]
	if !ok {
		return WebhookEvent{}, fmt.Errorf("l402: invalid l402-signature: missing timestamp")
	}
	ts, err := strconv.ParseInt(tsStr, 10, 64)
	if err != nil || ts == 0 {
		return WebhookEvent{}, fmt.Errorf("l402: invalid l402-signature: bad timestamp")
	}

	now := time.Now().Unix()
	if drift := math.Abs(float64(now - ts)); drift > float64(tol) {
		return WebhookEvent{}, fmt.Errorf("l402: webhook timestamp too old (%.0fs drift)", drift)
	}

	v1, ok := parts["v1"]
	if !ok {
		return WebhookEvent{}, fmt.Errorf("l402: invalid l402-signature: missing v1")
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("%d.%s", ts, rawBody)))
	expected := hex.EncodeToString(mac.Sum(nil))

	// Constant-time comparison
	expectedBytes, _ := hex.DecodeString(expected)
	receivedBytes, _ := hex.DecodeString(v1)
	if len(expectedBytes) != len(receivedBytes) || !hmac.Equal(expectedBytes, receivedBytes) {
		return WebhookEvent{}, fmt.Errorf("l402: webhook signature mismatch")
	}

	var event WebhookEvent
	if err := json.Unmarshal([]byte(rawBody), &event); err != nil {
		return WebhookEvent{}, fmt.Errorf("l402: webhook body is not valid JSON")
	}
	return event, nil
}
