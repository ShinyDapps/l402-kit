package l402kit

import "errors"

// ErrInvalidTokenFormat is returned when an L402 token cannot be parsed.
var ErrInvalidTokenFormat = errors.New("invalid L402 token format: expected macaroon:preimage")

// ErrNoProvider is returned when neither OwnerLightningAddress nor a custom
// LightningProvider is configured.
var ErrNoProvider = errors.New("l402kit: no Lightning provider configured — set OwnerLightningAddress or Lightning")
