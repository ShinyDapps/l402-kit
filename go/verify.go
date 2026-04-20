package l402kit

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"
)

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
//  1. Preimage must be 32 bytes (64 hex chars).
//  2. Token must not be expired.
//  3. SHA256(preimage) must equal the paymentHash stored in the macaroon.
func VerifyToken(token string) (bool, error) {
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

	// Check expiry
	if time.Now().UnixMilli() > payload.Exp {
		return false, nil
	}

	// Core Lightning security: SHA256(preimage) must equal paymentHash
	digest := sha256.Sum256(preimageBytes)
	digestHex := hex.EncodeToString(digest[:])

	return digestHex == payload.Hash, nil
}
