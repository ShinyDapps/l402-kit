package l402kit

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
)

// replayStore is an in-memory set of seen preimage hashes.
// For multi-instance deployments, replace with Redis or a shared DB.
var replayStore = struct {
	mu   sync.Mutex
	seen map[string]struct{}
}{seen: make(map[string]struct{})}

// CheckAndMarkPreimage returns true if the preimage has NOT been seen before,
// and atomically marks it as used. Returns false if it was already used.
func CheckAndMarkPreimage(preimage string) bool {
	h := sha256.Sum256([]byte(preimage))
	key := hex.EncodeToString(h[:])

	replayStore.mu.Lock()
	defer replayStore.mu.Unlock()

	if _, exists := replayStore.seen[key]; exists {
		return false
	}
	replayStore.seen[key] = struct{}{}
	return true
}
