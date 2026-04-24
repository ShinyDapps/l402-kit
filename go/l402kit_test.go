package l402kit_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	l402kit "github.com/shinydapps/l402-kit/go"
)

// ─── helpers ──────────────────────────────────────────────────────────────────

func freshPreimage(t *testing.T) string {
	t.Helper()
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return hex.EncodeToString(b)
}

func makeToken(t *testing.T, expOffsetMs int64) string {
	t.Helper()
	preimageHex := freshPreimage(t)
	preimageBytes, _ := hex.DecodeString(preimageHex)
	hash := sha256.Sum256(preimageBytes)
	hashHex := hex.EncodeToString(hash[:])
	exp := time.Now().UnixMilli() + expOffsetMs
	payload, _ := json.Marshal(map[string]any{"hash": hashHex, "exp": exp})
	macaroon := base64.StdEncoding.EncodeToString(payload)
	return macaroon + ":" + preimageHex
}

func makeTokenFromPreimage(t *testing.T, preimageHex string, expOffsetMs int64) string {
	t.Helper()
	preimageBytes, _ := hex.DecodeString(preimageHex)
	hash := sha256.Sum256(preimageBytes)
	hashHex := hex.EncodeToString(hash[:])
	exp := time.Now().UnixMilli() + expOffsetMs
	payload, _ := json.Marshal(map[string]any{"hash": hashHex, "exp": exp})
	macaroon := base64.StdEncoding.EncodeToString(payload)
	return macaroon + ":" + preimageHex
}

// ─── ParseToken ───────────────────────────────────────────────────────────────

func TestParseToken_Valid(t *testing.T) {
	tok, err := l402kit.ParseToken("abc123:def456")
	if err != nil {
		t.Fatal(err)
	}
	if tok.Macaroon != "abc123" || tok.Preimage != "def456" {
		t.Errorf("unexpected parse: %+v", tok)
	}
}

func TestParseToken_SplitsOnLastColon(t *testing.T) {
	tok, err := l402kit.ParseToken("abc:def:ghi")
	if err != nil {
		t.Fatal(err)
	}
	if tok.Macaroon != "abc:def" || tok.Preimage != "ghi" {
		t.Errorf("unexpected parse: %+v", tok)
	}
}

func TestParseToken_Base64WithColons(t *testing.T) {
	tok, err := l402kit.ParseToken("a:b:c:d:preimage")
	if err != nil {
		t.Fatal(err)
	}
	if tok.Preimage != "preimage" {
		t.Errorf("expected preimage='preimage', got %q", tok.Preimage)
	}
}

func TestParseToken_NoColon(t *testing.T) {
	_, err := l402kit.ParseToken("nodivider")
	if err == nil {
		t.Fatal("expected error for missing colon")
	}
}

func TestParseToken_EmptyString(t *testing.T) {
	_, err := l402kit.ParseToken("")
	if err == nil {
		t.Fatal("expected error for empty string")
	}
}

func TestParseToken_ReturnsBothParts(t *testing.T) {
	tok, err := l402kit.ParseToken("eyJoYXNocg==:abc123def456")
	if err != nil {
		t.Fatal(err)
	}
	if tok.Macaroon == "" || tok.Preimage == "" {
		t.Error("both parts should be non-empty")
	}
}

// ─── VerifyToken ──────────────────────────────────────────────────────────────

func TestVerifyToken_ValidToken(t *testing.T) {
	token := makeToken(t, 3_600_000)
	ok, err := l402kit.VerifyToken(token)
	if err != nil || !ok {
		t.Errorf("expected valid token, got ok=%v err=%v", ok, err)
	}
}

func TestVerifyToken_ValidToken_FarFuture(t *testing.T) {
	token := makeToken(t, 365*24*3_600_000)
	ok, err := l402kit.VerifyToken(token)
	if err != nil || !ok {
		t.Errorf("expected far-future token to be valid, got ok=%v err=%v", ok, err)
	}
}

func TestVerifyToken_ExpiredToken(t *testing.T) {
	token := makeToken(t, -1000)
	ok, _ := l402kit.VerifyToken(token)
	if ok {
		t.Error("expected expired token to be invalid")
	}
}

func TestVerifyToken_ExpiredByOneHour(t *testing.T) {
	token := makeToken(t, -3_600_000)
	ok, _ := l402kit.VerifyToken(token)
	if ok {
		t.Error("expected token expired 1h ago to be invalid")
	}
}

func TestVerifyToken_WrongPreimage(t *testing.T) {
	token := makeToken(t, 3_600_000)
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

func TestVerifyToken_AllZerosPreimage(t *testing.T) {
	// Build macaroon for a real preimage but submit all-zeros preimage
	realPreimage := freshPreimage(t)
	realBytes, _ := hex.DecodeString(realPreimage)
	hash := sha256.Sum256(realBytes)
	exp := time.Now().UnixMilli() + 3_600_000
	payload, _ := json.Marshal(map[string]any{"hash": hex.EncodeToString(hash[:]), "exp": exp})
	mac := base64.StdEncoding.EncodeToString(payload)
	zeros := strings.Repeat("0", 64)
	ok, _ := l402kit.VerifyToken(mac + ":" + zeros)
	if ok {
		t.Error("expected all-zeros preimage to be invalid")
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

func TestVerifyToken_EmptyString(t *testing.T) {
	ok, _ := l402kit.VerifyToken("")
	if ok {
		t.Error("expected empty string to be invalid")
	}
}

func TestVerifyToken_MissingHashField(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"exp": time.Now().UnixMilli() + 3_600_000})
	mac := base64.StdEncoding.EncodeToString(payload)
	ok, _ := l402kit.VerifyToken(mac + ":" + strings.Repeat("a", 64))
	if ok {
		t.Error("expected token with missing hash to be invalid")
	}
}

func TestVerifyToken_MissingExpField(t *testing.T) {
	preimage := freshPreimage(t)
	preimageBytes, _ := hex.DecodeString(preimage)
	hash := sha256.Sum256(preimageBytes)
	payload, _ := json.Marshal(map[string]any{"hash": hex.EncodeToString(hash[:])})
	mac := base64.StdEncoding.EncodeToString(payload)
	ok, _ := l402kit.VerifyToken(mac + ":" + preimage)
	if ok {
		t.Error("expected token with missing exp to be invalid")
	}
}

func TestVerifyToken_Concurrent(t *testing.T) {
	tokens := make([]string, 20)
	for i := range tokens {
		tokens[i] = makeToken(t, 3_600_000)
	}
	var wg sync.WaitGroup
	results := make([]bool, len(tokens))
	for i, tok := range tokens {
		wg.Add(1)
		go func(idx int, token string) {
			defer wg.Done()
			ok, _ := l402kit.VerifyToken(token)
			results[idx] = ok
		}(i, tok)
	}
	wg.Wait()
	for i, ok := range results {
		if !ok {
			t.Errorf("token[%d] should be valid", i)
		}
	}
}

// ─── CheckAndMarkPreimage (replay protection) ─────────────────────────────────

func TestReplay_FirstUseAllowed(t *testing.T) {
	preimage := freshPreimage(t)
	if !l402kit.CheckAndMarkPreimage(preimage) {
		t.Error("first use should be allowed")
	}
}

func TestReplay_SecondUseBlocked(t *testing.T) {
	preimage := freshPreimage(t)
	l402kit.CheckAndMarkPreimage(preimage)
	if l402kit.CheckAndMarkPreimage(preimage) {
		t.Error("second use should be blocked")
	}
}

func TestReplay_ThirdUseAlsoBlocked(t *testing.T) {
	preimage := freshPreimage(t)
	l402kit.CheckAndMarkPreimage(preimage)
	l402kit.CheckAndMarkPreimage(preimage)
	if l402kit.CheckAndMarkPreimage(preimage) {
		t.Error("third use should also be blocked")
	}
}

func TestReplay_DifferentPreimagesAreIndependent(t *testing.T) {
	p1, p2 := freshPreimage(t), freshPreimage(t)
	if !l402kit.CheckAndMarkPreimage(p1) {
		t.Error("p1 first use should be allowed")
	}
	if !l402kit.CheckAndMarkPreimage(p2) {
		t.Error("p2 first use should be allowed")
	}
	if l402kit.CheckAndMarkPreimage(p1) {
		t.Error("p1 second use should be blocked")
	}
}

func TestReplay_ConcurrentSamePreimage_ExactlyOneSucceeds(t *testing.T) {
	preimage := freshPreimage(t)
	const N = 50
	results := make([]bool, N)
	var wg sync.WaitGroup
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = l402kit.CheckAndMarkPreimage(preimage)
		}(i)
	}
	wg.Wait()
	trueCount := 0
	for _, r := range results {
		if r {
			trueCount++
		}
	}
	if trueCount != 1 {
		t.Errorf("expected exactly 1 success in concurrent replay, got %d", trueCount)
	}
}

func TestReplay_100UniquePreimagesAllSucceed(t *testing.T) {
	for i := 0; i < 100; i++ {
		if !l402kit.CheckAndMarkPreimage(freshPreimage(t)) {
			t.Errorf("preimage %d should succeed on first use", i)
		}
	}
}

// ─── Middleware ────────────────────────────────────────────────────────────────

type mockProvider struct{}

func (m *mockProvider) CreateInvoice(_ context.Context, _ int) (l402kit.Invoice, error) {
	return l402kit.Invoice{
		PaymentRequest: "lnbc10n1...",
		PaymentHash:    "mockhash",
		Macaroon:       "mockmacaroon",
		AmountSats:     10,
	}, nil
}

func makeHandler(priceSats int) http.Handler {
	return l402kit.Middleware(l402kit.Options{
		PriceSats: priceSats,
		Lightning: &mockProvider{},
	}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
}

func TestMiddleware_NoToken_Returns402(t *testing.T) {
	handler := makeHandler(10)
	req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402, got %d", rec.Code)
	}
}

func TestMiddleware_NoToken_HasWWWAuthenticate(t *testing.T) {
	handler := makeHandler(10)
	req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Header().Get("WWW-Authenticate") == "" {
		t.Error("expected WWW-Authenticate header")
	}
}

func TestMiddleware_EmptyAuth_Returns402(t *testing.T) {
	handler := makeHandler(10)
	req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	req.Header.Set("Authorization", "")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402, got %d", rec.Code)
	}
}

func TestMiddleware_BearerScheme_Returns402(t *testing.T) {
	handler := makeHandler(10)
	token := makeToken(t, 3_600_000)
	req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402 for Bearer scheme, got %d", rec.Code)
	}
}

func TestMiddleware_GarbageToken_Returns402(t *testing.T) {
	handler := makeHandler(10)
	req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	req.Header.Set("Authorization", "L402 garbage!!!123")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402, got %d", rec.Code)
	}
}

func TestMiddleware_ValidToken_Returns200(t *testing.T) {
	handler := l402kit.Middleware(l402kit.Options{
		PriceSats: 10,
		Lightning: &mockProvider{},
		OnPayment: func(_ l402kit.L402Token, _ int) {},
	}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	token := makeToken(t, 3_600_000)
	req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	req.Header.Set("Authorization", "L402 "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
}

func TestMiddleware_OnPayment_Called(t *testing.T) {
	called := false
	handler := l402kit.Middleware(l402kit.Options{
		PriceSats: 10,
		Lightning: &mockProvider{},
		OnPayment: func(_ l402kit.L402Token, _ int) { called = true },
	}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	token := makeToken(t, 3_600_000)
	req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	req.Header.Set("Authorization", "L402 "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if !called {
		t.Error("OnPayment callback should have been called")
	}
}

func TestMiddleware_ExpiredToken_Returns402(t *testing.T) {
	handler := makeHandler(10)
	token := makeToken(t, -1000)
	req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	req.Header.Set("Authorization", "L402 "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402 for expired token, got %d", rec.Code)
	}
}

func TestMiddleware_ReplayedToken_Returns401(t *testing.T) {
	token := makeToken(t, 3_600_000)
	handler := makeHandler(10)

	makeReq := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/data", nil)
		req.Header.Set("Authorization", "L402 "+token)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	if first := makeReq(); first.Code != http.StatusOK {
		t.Errorf("first request: expected 200, got %d", first.Code)
	}
	if second := makeReq(); second.Code != http.StatusUnauthorized {
		t.Errorf("replay: expected 401, got %d", second.Code)
	}
}

func TestMiddleware_POST_Returns402_WithoutToken(t *testing.T) {
	handler := l402kit.Middleware(l402kit.Options{
		PriceSats: 10,
		Lightning: &mockProvider{},
	}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/data", bytes.NewBufferString(`{"data":"test"}`))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402 on POST without token, got %d", rec.Code)
	}
}

func TestMiddleware_POST_Returns200_WithValidToken(t *testing.T) {
	token := makeToken(t, 3_600_000)
	handler := l402kit.Middleware(l402kit.Options{
		PriceSats: 10,
		Lightning: &mockProvider{},
	}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/data", bytes.NewBufferString(`{"data":"test"}`))
	req.Header.Set("Authorization", "L402 "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 on POST with valid token, got %d", rec.Code)
	}
}

// ─── BlinkProvider ────────────────────────────────────────────────────────────

func blinkServer(t *testing.T, resp interface{}, status int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestBlinkProvider_CreateInvoice_Success(t *testing.T) {
	payload := map[string]interface{}{
		"data": map[string]interface{}{
			"lnInvoiceCreate": map[string]interface{}{
				"invoice": map[string]interface{}{
					"paymentRequest": "lnbc10n1...",
					"paymentHash":    strings.Repeat("a", 64),
				},
				"errors": []interface{}{},
			},
		},
	}
	srv := blinkServer(t, payload, http.StatusOK)

	p := l402kit.NewBlinkProvider("test_key", "wallet_id")
	p.SetBaseURL(srv.URL)

	inv, err := p.CreateInvoice(context.Background(), 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if inv.PaymentRequest != "lnbc10n1..." {
		t.Errorf("expected payment request 'lnbc10n1...', got %q", inv.PaymentRequest)
	}
	if inv.AmountSats != 10 {
		t.Errorf("expected amount 10, got %d", inv.AmountSats)
	}
}

func TestBlinkProvider_CreateInvoice_BlinkError(t *testing.T) {
	payload := map[string]interface{}{
		"data": map[string]interface{}{
			"lnInvoiceCreate": map[string]interface{}{
				"invoice": nil,
				"errors":  []interface{}{map[string]interface{}{"message": "Insufficient balance"}},
			},
		},
	}
	srv := blinkServer(t, payload, http.StatusOK)

	p := l402kit.NewBlinkProvider("test_key", "wallet_id")
	p.SetBaseURL(srv.URL)

	_, err := p.CreateInvoice(context.Background(), 10)
	if err == nil {
		t.Fatal("expected error for blink API error, got nil")
	}
	if !strings.Contains(err.Error(), "Insufficient balance") {
		t.Errorf("expected 'Insufficient balance' in error, got %q", err.Error())
	}
}

func TestBlinkProvider_CreateInvoice_HTTPError(t *testing.T) {
	srv := blinkServer(t, map[string]interface{}{}, http.StatusServiceUnavailable)

	p := l402kit.NewBlinkProvider("test_key", "wallet_id")
	p.SetBaseURL(srv.URL)

	_, err := p.CreateInvoice(context.Background(), 10)
	if err == nil {
		t.Fatal("expected error on HTTP 503, got nil")
	}
}

func TestBlinkProvider_CreateInvoice_ContextCancelled(t *testing.T) {
	// Server that delays response longer than the cancelled context
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	t.Cleanup(srv.Close)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // immediately cancel

	p := l402kit.NewBlinkProvider("test_key", "wallet_id")
	p.SetBaseURL(srv.URL)

	_, err := p.CreateInvoice(ctx, 10)
	if err == nil {
		t.Fatal("expected error for cancelled context, got nil")
	}
}

func TestBlinkProvider_CreateInvoice_MacaroonEncoded(t *testing.T) {
	hash := strings.Repeat("b", 64)
	payload := map[string]interface{}{
		"data": map[string]interface{}{
			"lnInvoiceCreate": map[string]interface{}{
				"invoice": map[string]interface{}{
					"paymentRequest": "lnbc1...",
					"paymentHash":    hash,
				},
				"errors": []interface{}{},
			},
		},
	}
	srv := blinkServer(t, payload, http.StatusOK)

	p := l402kit.NewBlinkProvider("test_key", "wallet_id")
	p.SetBaseURL(srv.URL)

	inv, err := p.CreateInvoice(context.Background(), 21)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Macaroon must be valid base64 containing hash and exp fields
	raw, err := base64.StdEncoding.DecodeString(inv.Macaroon)
	if err != nil {
		t.Fatalf("macaroon is not valid base64: %v", err)
	}
	var mac map[string]interface{}
	if err := json.Unmarshal(raw, &mac); err != nil {
		t.Fatalf("macaroon is not valid JSON: %v", err)
	}
	if mac["hash"] != hash {
		t.Errorf("macaroon hash mismatch: want %q, got %q", hash, mac["hash"])
	}
	if _, ok := mac["exp"]; !ok {
		t.Error("macaroon missing 'exp' field")
	}
}

func TestBlinkProvider_SendsAPIKeyHeader(t *testing.T) {
	var capturedKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedKey = r.Header.Get("X-API-KEY")
		payload := map[string]interface{}{
			"data": map[string]interface{}{
				"lnInvoiceCreate": map[string]interface{}{
					"invoice": map[string]interface{}{
						"paymentRequest": "lnbc1...", "paymentHash": strings.Repeat("c", 64),
					},
					"errors": []interface{}{},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(payload)
	}))
	t.Cleanup(srv.Close)

	p := l402kit.NewBlinkProvider("my_api_key", "wallet_id")
	p.SetBaseURL(srv.URL)

	_, err := p.CreateInvoice(context.Background(), 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if capturedKey != "my_api_key" {
		t.Errorf("expected X-API-KEY header 'my_api_key', got %q", capturedKey)
	}
}
