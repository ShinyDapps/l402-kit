import type { Env } from "../../worker";
import type { Lead, QueueKey } from "./types";

export function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export async function seenBefore(url: string, env: Env): Promise<boolean> {
  return (await env.demo_preimages.get(`verity_radar:seen:${hashUrl(url)}`)) !== null;
}

export async function markSeen(url: string, env: Env): Promise<void> {
  await env.demo_preimages.put(
    `verity_radar:seen:${hashUrl(url)}`,
    "1",
    { expirationTtl: 604_800 }, // 7 days
  );
}

export async function dequeueAll(key: QueueKey, env: Env): Promise<Lead[]> {
  const raw = await env.demo_preimages.get(key);
  if (!raw) return [];
  const all: Lead[] = JSON.parse(raw);
  return all.filter(l => l.expiresAt > Date.now());
}

export async function enqueue(key: QueueKey, lead: Lead, env: Env): Promise<void> {
  const active = await dequeueAll(key, env);
  active.push(lead);
  await env.demo_preimages.put(key, JSON.stringify(active), { expirationTtl: 172_800 }); // 48h
}
