import express from "express";
import { l402, BlinkProvider } from "../../src";

const app = express();

const lightning = new BlinkProvider(
  process.env.BLINK_API_KEY!,
  process.env.BLINK_WALLET_ID!,
);

app.get("/", (_req, res) => {
  res.json({ message: "Welcome! Hit /premium to see L402 in action." });
});

app.get(
  "/premium",
  l402({ priceSats: 100, lightning }),
  (_req, res) => {
    res.json({ data: "You paid 100 sats. Here is your exclusive data." });
  }
);

app.listen(3000, () => {
  console.log("L402 example running on http://localhost:3000");
});
