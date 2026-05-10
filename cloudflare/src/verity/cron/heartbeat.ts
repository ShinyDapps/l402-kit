import type { Env } from "../../worker";
import { adjustAllPrices, getAllPrices } from "../pricing";

export async function runVerityHeartbeat(env: Env): Promise<void> {
  try {
    const changes = await adjustAllPrices(env);
    if (Object.keys(changes).length > 0) {
      console.log("[VERITY] price adjustments:", JSON.stringify(changes));
    }

    const prices = await getAllPrices(env);
    console.log("[VERITY] heartbeat — current prices:", JSON.stringify(prices));
  } catch (e) {
    console.error("[VERITY] heartbeat error:", String(e));
  }
}
