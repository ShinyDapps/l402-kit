package l402kit

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"
)

// MaxTokenLen rejects oversized tokens before parsing (DoS guard). Parity with TS SDK.
const MaxTokenLen = 4096

// MaxExpMs caps how far in the future a token may claim to expire. Mirrors
// the TS SDK's 2-hour MAX_EXP_MS — prevents forged tokens with absurd `exp`.
const MaxExpMs = int64(2 * 60 * 60 * 1000)

// L402Token holds the parsed components of an L402 authorization token.
type L402Token struct {
	Macaroon string
	Preimage string
}

// macaroonPayload is the decoded JSON inside the base64 macaroon.
type macaroonPayload struct {
	Hash string `json:"hash"`
	Exp  int64  `json:"exp"` // milliseconds since epoch
}

// ParseToken splits an L402 token string of the form "macaroon:preimage".
func ParseToken(token string) (L402Token, error) {
	idx := strings.LastIndex(token, ":")
	if idx == -1 {
		return L402Token{}, ErrInvalidTokenFormat
	}
	return L402Token{
		Macaroon: token[:idx],
		Preimage: token[idx+1:],
	}, nil
}

// VerifyToken performs real cryptographic verification:
//  1. Token length within MaxTokenLen (DoS guard).
//  2. Preimage must be 32 bytes (64 hex chars).
//  3. Token must not be expired AND must expire within MaxExpMs from now.
//  4. SHA256(preimage) must equal the paymentHash stored in the macaroon
//     (constant-time compare via crypto/subtle).
func VerifyToken(token string) (bool, error) {
	if len(token) > MaxTokenLen {
		return false, nil
	}

	t, err := ParseToken(token)
	if err != nil {
		return false, nil
	}

	// Preimage must be 64 hex chars (32 bytes)
	if len(t.Preimage) != 64 {
		return false, nil
	}
	preimageBytes, err := hex.DecodeString(t.Preimage)
	if err != nil {
		return false, nil
	}

	// Decode macaroon (base64 → JSON)
	raw, err := base64.StdEncoding.DecodeString(t.Macaroon)
	if err != nil {
		// Try URL-safe base64 as fallback
		raw, err = base64.URLEncoding.DecodeString(t.Macaroon)
		if err != nil {
			return false, nil
		}
	}

	var payload macaroonPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return false, nil
	}

	if payload.Hash == "" || payload.Exp == 0 {
		return false, nil
	}

	nowMs := time.Now().UnixMilli()
	if nowMs > payload.Exp {
		return false, nil
	}
	// Forward-cap: reject tokens with exp more than 2h in the future
	if payload.Exp > nowMs+MaxExpMs {
		return false, nil
	}

	// Core Lightning security: SHA256(preimage) must equal paymentHash
	digest := sha256.Sum256(preimageBytes)
	digestHex := hex.EncodeToString(digest[:])

	// Constant-time compare to defeat hash-prefix side-channel attacks
	if len(digestHex) != len(payload.Hash) {
		return false, nil
	}
	return subtle.ConstantTimeCompare([]byte(digestHex), []byte(payload.Hash)) == 1, nil
}
