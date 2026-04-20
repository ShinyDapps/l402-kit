# l402kit — Go SDK

L402 (HTTP 402 + Lightning Network) middleware for Go.

## Install

```bash
go get github.com/shinydapps/l402-kit/go
```

## Usage

```go
package main

import (
    "fmt"
    "net/http"

    l402kit "github.com/shinydapps/l402-kit/go"
)

func main() {
    mux := http.NewServeMux()

    mux.Handle("/api/data", l402kit.Middleware(l402kit.Options{
        PriceSats:             10,
        OwnerLightningAddress: "you@blink.sv",
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
