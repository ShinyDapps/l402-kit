// Package l402kit provides L402 (HTTP 402 + Lightning Network) middleware for Go.
// Compatible with net/http and any framework that wraps it (Chi, Gorilla, etc.)
//
// Usage:
//
//	mux := http.NewServeMux()
//	mux.Handle("/api/data", l402kit.Middleware(l402kit.Options{
//	    PriceSats:             10,
//	    OwnerLightningAddress: "you@yourdomain.com",
//	}, myHandler))
package l402kit
