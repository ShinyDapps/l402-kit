# l402kit — Go SDK

**Add Bitcoin Lightning pay-per-call to any Go API. 3 lines of code.**

[![Go Reference](https://pkg.go.dev/badge/github.com/ShinyDapps/l402-kit/go.svg)](https://pkg.go.dev/github.com/ShinyDapps/l402-kit/go)
[![Go Report Card](https://goreportcard.com/badge/github.com/ShinyDapps/l402-kit/go)](https://goreportcard.com/report/github.com/ShinyDapps/l402-kit/go)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ShinyDapps/l402-kit/blob/main/LICENSE)

L402 (HTTP 402 + Lightning Network) middleware for Go. Works with `net/http`, Chi, Gin.

📖 **Docs:** [l402kit.com/docs/sdk/go](https://l402kit.com/docs/sdk/go)

## Install

```bash
go get github.com/ShinyDapps/l402-kit/go@v1.0.2
```

## Usage

```go
package main

import (
    "fmt"
    "net/http"

    l402kit "github.com/ShinyDapps/l402-kit/go"
)

func main() {
    mux := http.NewServeMux()

    mux.Handle("/api/data", l402kit.Middleware(l402kit.Options{
        PriceSats:             10,
        OwnerLightningAddress: "you@yourdomain.com",
    }, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, `{"message": "paid access"}`)
    })))

    http.ListenAndServe(":8080", mux)
}
```

## How it works

1. Request hits `/api/data` without a valid token → server responds `402 Payment Required` with a Lightning invoice
2. Client pays the invoice → receives a preimage
3. Client retries with `Authorization: L402 <macaroon>:<preimage>`
4. Middleware verifies `SHA256(preimage) == paymentHash` and grants access

## Options

| Field | Type | Description |
|---|---|---|
| `PriceSats` | `int` | Price per call in satoshis |
| `OwnerLightningAddress` | `string` | Your Lightning Address (zero-config mode) |
| `Lightning` | `LightningProvider` | Custom provider (advanced) |
| `OnPayment` | `func(L402Token, int)` | Called after each verified payment |

## Custom provider

```go
type MyProvider struct{}

func (p *MyProvider) CreateInvoice(ctx context.Context, sats int) (l402kit.Invoice, error) {
    // Call your own Lightning node or API
    return l402kit.Invoice{...}, nil
}

mux.Handle("/api/data", l402kit.Middleware(l402kit.Options{
    PriceSats: 10,
    Lightning: &MyProvider{},
}, handler))
```

## Run tests

```bash
go test ./...
```
