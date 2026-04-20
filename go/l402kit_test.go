package l402kit_test

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	l402kit "github.com/shinydapps/l402-kit/go"
)

// helpers

func makeToken(t *testing.T, expOffsetMs int64) string {
	t.Helper()

	// Generate random 32-byte preimage
	preimageBytes := make([]byte, 32)
	if _, err := rand.Read(preimageBytes); err != nil {
		t.Fatal(err)
	}
	preimage := hex.EncodeToString(preimageBytes)

	// paymentHash = SHA256(preimage)
	hash := sha256.Sum256(preimageBytes)
	hashHex := hex.EncodeToString(hash[:])

	exp := time.Now().UnixMilli() + expOffsetMs

	payload, _ := json.Marshal(map[string]any{"hash": hashHex, "exp": exp})
	macaroon := base64.StdEncoding.EncodeToString(payload)

	return macaroon + ":" + preimage
}

// --- ParseToken ---

func TestParseToken_Valid(t *testing.T) {
	tok, err := l402kit.ParseToken("abc123:def456")
	if err != nil {
		t.Fatal(err)
	}
	if tok.Macaroon != "abc123" || tok.Preimage != "def456" {
		t.Errorf("unexpected parse: %+v", tok)
	}
}

func TestParseToken_NoColon(t *testing.T) {
	_, err := l402kit.ParseToken("nodivider")
	if err == nil {
		t.Fatal("expected error for missing colon")
	}
}

// --- VerifyToken ---

func TestVerifyToken_ValidToken(t *testing.T) {
	token := makeToken(t, 3_600_000) // expires in 1 hour
	ok, err := l402kit.VerifyToken(token)
	if err != nil || !ok {
		t.Errorf("expected valid token, got ok=%v err=%v", ok, err)
	}
}

func TestVerifyToken_ExpiredToken(t *testing.T) {
	token := makeToken(t, -1000) // expired 1 second ago
	ok, _ := l402kit.VerifyToken(token)
	if ok {
		t.Error("expected expired token to be invalid")
	}
}

func TestVerifyToken_WrongPreimage(t *testing.T) {
	token := makeToken(t, 3_600_000)
	// Corrupt the preimage (flip last hex char)
	parts := []rune(token)
	if parts[len(parts)-1] == 'a' {
		parts[len(parts)-1] = 'b'
	} else {
		parts[len(parts)-1] = 'a'
	}
	ok, _ := l402kit.VerifyToken(string(parts))
	if ok {
		t.Error("expected tampered token to be invalid")
	}
}

func TestVerifyToken_ShortPreimage(t *testing.T) {
	ok, _ := l402kit.VerifyToken("somemacaroon:abc")
	if ok {
		t.Error("expected short preimage to be invalid")
	}
}

func TestVerifyToken_Garbage(t *testing.T) {
	ok, _ := l402kit.VerifyToken("notavalidtoken")
	if ok {
		t.Error("expected garbage to be invalid")
	}
}

// --- CheckAndMarkPreimage (replay protection) ---

func TestReplay_FirstUseAllowed(t *testing.T) {
	preimage := hex.EncodeToString(make([]byte, 32))
	// Use a unique preimage per test to avoid cross-test pollution
	preimage = preimage[:63] + "1"
	ok := l402kit.CheckAndMarkPreimage(preimage)
	if !ok {
		t.Error("first use should be allowed")
	}
}

func TestReplay_SecondUseBlocked(t *testing.T) {
	preimage := hex.EncodeToString(make([]byte, 32))
	preimage = preimage[:63] + "2"
	l402kit.CheckAndMarkPreimage(preimage)
	ok := l402kit.CheckAndMarkPreimage(preimage)
	if ok {
		t.Error("second use should be blocked")
	}
}

// --- Middleware ---

// mockProvider returns a predictable invoice for testing.
type mockProvider struct {
	token string
}

func (m *mockProvider) CreateInvoice(_ context.Context, _ int) (l402kit.Invoice, error) {
	return l402kit.Invoice{
		PaymentRequest: "lnbc10n1...",
		PaymentHash:    "mockhash",
		Macaroon:       "mockmacaroon",
		AmountSats:     10,
	}, nil
}

func TestMiddleware_NoToken_Returns402(t *testing.T) {
	handler := l402kit.Middleware(l402kit.Options{
		PriceSats: 10,
		Lightning: &mockProvider{},
	}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402, got %d", rec.Code)
	}
	if rec.Header().Get("WWW-Authenticate") == "" {
		t.Error("expected WWW-Authenticate header")
	}
}

func TestMiddleware_ValidToken_Passes(t *testing.T) {
	token := makeToken(t, 3_600_000)

	// Use a unique preimage so replay protection doesn't block it
	called := false
	handler := l402kit.Middleware(l402kit.Options{
		PriceSats: 10,
		Lightning: &mockProvider{},
		OnPayment: func(_ l402kit.L402Token, _ int) { called = true },
	}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	req.Header.Set("Authorization", "L402 "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if !called {
		t.Error("OnPayment callback should have been called")
	}
}

func TestMiddleware_ReplayedToken_Returns401(t *testing.T) {
	token := makeToken(t, 3_600_000)
	handler := l402kit.Middleware(l402kit.Options{
		PriceSats: 10,
		Lightning: &mockProvider{},
	}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	makeReq := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
		req.Header.Set("Authorization", "L402 "+token)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	first := makeReq()
	if first.Code != http.StatusOK {
		t.Errorf("first request: expected 200, got %d", first.Code)
	}
	second := makeReq()
	if second.Code != http.StatusUnauthorized {
		t.Errorf("replay: expected 401, got %d", second.Code)
	}
}
