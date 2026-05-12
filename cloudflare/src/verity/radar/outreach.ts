import type { Env } from "../../worker";
import type { Lead } from "./types";
import { infer } from "../providers/inference";

export function outreachKey(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  }
  return `verity_radar:outreach:${Math.abs(h).toString(36)}`;
}

export interface OutreachDraft {
  url: string;
  title: string;
  draft: string;
  persona: string;
  framework?: string;
  signal: string;
  generatedAt: string;
}

export async function draftOutreach(lead: Lead, env: Env): Promise<string | null> {
  const frameworkLine = lead.framework
    ? `The developer is using ${lead.framework}. Reference it specifically.`
    : "No specific framework detected.";

  const personaGuidance = lead.persona === "agent"
    ? "This is likely an AI agent or bot developer. Emphasize: API-to-API integration, zero human friction, machine-readable 402 responses, budget controls, autonomous payment."
    : "This is a human developer. Emphasize: 3-line integration, instant monetization, no payment processor setup, Lightning-native.";

  const prompt = `You are writing a GitHub comment on behalf of the l402-kit open-source project. A developer posted an issue asking about API monetization.

Issue URL: ${lead.url}
Issue title: ${lead.title}
Snippet: ${lead.snippet}

${frameworkLine}
${personaGuidance}

Write a helpful, non-spammy GitHub comment (max 120 words) that:
1. Acknowledges their specific problem
2. Introduces l402-kit as a solution in one sentence
3. Shows a minimal code snippet relevant to their framework if possible
4. Links to https://l402kit.com for more info

Return ONLY the comment text, ready to post. No preamble.`;

  return infer(prompt, env, {
    system: "You are a helpful open-source contributor writing a genuine, concise GitHub comment.",
    maxTokens: 300,
  });
}

export async function storeDraft(lead: Lead, draft: string, env: Env): Promise<void> {
  const record: OutreachDraft = {
    url:         lead.url,
    title:       lead.title,
    draft,
    persona:     lead.persona,
    framework:   lead.framework,
    signal:      lead.signal,
    generatedAt: new Date().toISOString(),
  };
  await env.demo_preimages.put(
    outreachKey(lead.url),
    JSON.stringify(record),
    { expirationTtl: 48 * 3_600 },
  );
}

export async function getDraft(url: string, env: Env): Promise<OutreachDraft | null> {
  const raw = await env.demo_preimages.get(outreachKey(url));
  if (!raw) return null;
  return JSON.parse(raw) as OutreachDraft;
}
