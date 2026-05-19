package l402kit_test

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	l402kit "github.com/ShinyDapps/l402-kit/go"
)

// ─── Fake LAW-N server ───────────────────────────────────────────────────────

type capturedReq struct {
	Path    string
	Headers http.Header
	Body    []byte
}

type capture struct {
	mu    sync.Mutex
	items []capturedReq
	done  chan struct{}
}

func newCapture() *capture { return &capture{done: make(chan struct{}, 16)} }

func (c *capture) append(req capturedReq) {
	c.mu.Lock()
	c.items = append(c.items, req)
	c.mu.Unlock()
	select {
	case c.done <- struct{}{}:
	default:
	}
}

func (c *capture) waitFor(n int, timeout time.Duration) bool {
	deadline := time.After(timeout)
	for {
		c.mu.Lock()
		if len(c.items) >= n {
			c.mu.Unlock()
			return true
		}
		c.mu.Unlock()
		select {
		case <-c.done:
		case <-deadline:
			return false
		}
	}
}

func startFakeLawN(t *testing.T) (*httptest.Server, *capture) {
	t.Helper()
	cap := newCapture()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		cap.append(capturedReq{Path: r.URL.Path, Headers: r.Header.Clone(), Body: body})
		w.WriteHeader(http.StatusAccepted)
	}))
	return server, cap
}

func sampleEvent() l402kit.L402CloudEvent {
	return l402kit.L402CloudEvent{
		SpecVersion:     "1.0",
		Type:            "l402.payment.settled",
		Source:          "l402-kit",
		ID:              "abc123",
		Time:            "2026-05-19T12:00:00Z",
		Subject:         "agent-payment-flow",
		DataContentType: "application/json",
		Data: l402kit.L402EventData{
			SessionID: "sess-1",
			RequestID: "req-1",
			Endpoint:  "https://api.example.com/data",
			EventType: "settled",
			Payment:   &l402kit.LawNPayment{AmountSats: 100},
		},
	}
}

// ─── Tests ───────────────────────────────────────────────────────────────────

func TestLawNAdapter_PostsWithHMACSignature(t *testing.T) {
	server, cap := startFakeLawN(t)
	defer server.Close()

	adapter := l402kit.CreateLawNAdapter(server.URL+"/ingest/events", "topsecret", 2*time.Second)
	adapter(sampleEvent())

	if !cap.waitFor(1, 5*time.Second) {
		t.Fatal("expected adapter to POST within 5s")
	}

	req := cap.items[0]
	if req.Path != "/ingest/events" {
		t.Errorf("path = %q, want /ingest/events", req.Path)
	}
	if got := req.Headers.Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	if req.Headers.Get("X-LAW-N-Signature") == "" {
		t.Error("missing X-LAW-N-Signature")
	}
	if req.Headers.Get("X-LAW-N-Request-Id") == "" {
		t.Error("missing X-LAW-N-Request-Id")
	}

	// Verify signature
	mac := hmac.New(sha256.New, []byte("topsecret"))
	mac.Write(req.Body)
	expected := fmt.Sprintf("sha256=%s", hex.EncodeToString(mac.Sum(nil)))
	if got := req.Headers.Get("X-LAW-N-Signature"); got != expected {
		t.Errorf("signature mismatch:\n  got %s\n  want %s", got, expected)
	}
}

func TestLawNAdapter_SwallowsNetworkErrors(t *testing.T) {
	// Unreachable endpoint — must not block or panic
	adapter := l402kit.CreateLawNAdapter("http://127.0.0.1:1/never", "x", 100*time.Millisecond)
	adapter(sampleEvent())
	time.Sleep(300 * time.Millisecond)
	// If we got here without panic, pass
}

func TestLawNAdapter_UniqueRequestIDsPerCall(t *testing.T) {
	server, cap := startFakeLawN(t)
	defer server.Close()

	adapter := l402kit.CreateLawNAdapter(server.URL, "s", 2*time.Second)
	adapter(sampleEvent())
	adapter(sampleEvent())

	if !cap.waitFor(2, 5*time.Second) {
		t.Fatal("expected 2 POSTs")
	}
	id1 := cap.items[0].Headers.Get("X-LAW-N-Request-Id")
	id2 := cap.items[1].Headers.Get("X-LAW-N-Request-Id")
	if id1 == id2 {
		t.Errorf("request IDs collided: %s", id1)
	}
}
