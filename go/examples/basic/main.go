package main

import (
	"fmt"
	"log"
	"net/http"

	l402kit "github.com/shinydapps/l402-kit/go"
)

func main() {
	mux := http.NewServeMux()

	// Protected endpoint — costs 10 sats per call
	mux.Handle("/api/data", l402kit.Middleware(l402kit.Options{
		PriceSats:             10,
		OwnerLightningAddress: "you@blink.sv",
		OnPayment: func(token l402kit.L402Token, sats int) {
			fmt.Printf("Payment received: %d sats\n", sats)
		},
	}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, `{"message": "Access granted!", "data": "your premium content"}`)
	})))

	// Health check — free
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, `{"status": "ok"}`)
	})

	log.Println("Server running on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
