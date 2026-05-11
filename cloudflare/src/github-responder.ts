import type { Env } from "./worker";

const KV_REPOS_KEY = "outbound:repos";

interface RepoEntry {
  owner: string;
  repo: string;
  issue_number: number;
  issue_url: string;
  type?: string;
}

// ─── GitHub API ───────────────────────────────────────────────────────────────

function ghHeaders(env: Env) {
  return {
    Authorization: `Bearer ${env.GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "VERITY-responder/1.0",
  };
}

async function getNewComments(
  owner: string, repo: string, issueNumber: number, env: Env
): Promise<{ id: number; body: string; user: string }[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { headers: ghHeaders(env), signal: AbortSignal.timeout(8_000) }
  );
  if (!res.ok) return [];
  const comments = await res.json() as { id: number; body: string; user: { login: string } }[];

  // Filter: not from us, not already replied to
  const unseen: { id: number; body: string; user: string }[] = [];
  for (const c of comments) {
    if (c.user.login === "shinydapps") continue; // skip our own comments
    const seen = await env.demo_preimages.get(`outbound:seen:${c.id}`);
    if (!seen) unseen.push({ id: c.id, body: c.body, user: c.user.login });
  }
  return unseen;
}

async function postComment(
  owner: string, repo: string, issueNumber: number, body: string, env: Env
): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: { ...ghHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  return res.ok;
}

async function closeIssue(
  owner: string, repo: string, issueNumber: number, env: Env
): Promise<void> {
  await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      method: "PATCH",
      headers: { ...ghHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify({ state: "closed" }),
      signal: AbortSignal.timeout(8_000),
    }
  );
}

// ─── Haiku response generation ────────────────────────────────────────────────

async function generateResponse(
  comment: string, user: string, issueType: string, env: Env
): Promise<{ reply: string; action: "respond" | "close" | "interested" }> {
  const prompt = `You are VERITY, an autonomous AI agent that opened a GitHub issue offering l402-kit Bitcoin Lightning integration.

A user named "${user}" replied to your issue with this comment:
"""
${comment}
"""

Issue type: ${issueType === "agent-client" ? "offering VERITY's paid services (search, scrape, summarize) to their AI agent project" : "offering l402-kit middleware integration for their API"}

Analyze the comment and respond appropriately. Rules:
- If they say not interested / spam / close / remove: reply politely, apologize for the interruption, say VERITY won't contact again. Set action=close.
- If they ask a technical question: answer precisely with code if needed. Set action=respond.
- If they express interest or ask how to proceed: explain the next concrete step and offer help. Set action=interested.
- If they ask about pricing: give exact numbers (integration=10,000 sats≈$6, search=100 sats/call, etc). Set action=respond.
- If unclear or positive reaction: engage helpfully. Set action=respond.

Your reply must:
- Be concise (max 150 words)
- Sound like an autonomous AI agent (you are VERITY, not a human)
- End with: *— VERITY, autonomous agent | [l402kit.com](https://l402kit.com)*
- NOT repeat the full pitch from the original issue

Return JSON only: {"reply": "...", "action": "respond|close|interested"}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: "You are VERITY, an autonomous AI agent. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) return { reply: "", action: "respond" };
  const data = await res.json() as { content?: { type: string; text: string }[] };
  const text = data.content?.find(b => b.type === "text")?.text ?? "{}";

  try {
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
    return { reply: parsed.reply ?? "", action: parsed.action ?? "respond" };
  } catch {
    return { reply: "", action: "respond" };
  }
}

// ─── email alert ──────────────────────────────────────────────────────────────

async function sendReplyAlert(
  owner: string, repo: string, issueUrl: string,
  user: string, comment: string, reply: string, action: string, env: Env
): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  const actionEmoji = action === "close" ? "🚪" : action === "interested" ? "🔥" : "💬";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: "VERITY <verity@l402kit.com>",
      to: "thiagoyoshiaki@gmail.com",
      subject: `${actionEmoji} VERITY respondeu: ${owner}/${repo}`,
      html: `
        <div style="font-family:monospace;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#F7931A">${actionEmoji} VERITY respondeu autonomamente</h2>
          <p><b>Repo:</b> <a href="${issueUrl}">${owner}/${repo}</a></p>
          <p><b>Usuário:</b> @${user}</p>
          <p><b>Ação:</b> ${action}</p>
          <hr style="border-color:#333">
          <p><b>Comentário deles:</b></p>
          <blockquote style="border-left:3px solid #888;padding-left:12px;color:#aaa">${comment.slice(0, 300)}</blockquote>
          <p><b>Resposta da VERITY:</b></p>
          <blockquote style="border-left:3px solid #F7931A;padding-left:12px">${reply.replace(/\n/g, "<br>")}</blockquote>
          <hr style="border-color:#333">
          <p style="color:#888;font-size:12px">VERITY · <a href="https://l402kit.com/api/verity" style="color:#F7931A">l402kit.com/api/verity</a></p>
        </div>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

// ─── main ─────────────────────────────────────────────────────────────────────

export async function runGithubResponder(env: Env): Promise<void> {
  if (!env.GITHUB_PAT || !env.ANTHROPIC_API_KEY) return;

  const raw = await env.demo_preimages.get(KV_REPOS_KEY);
  if (!raw) return;

  let repos: RepoEntry[];
  try { repos = JSON.parse(raw); } catch { return; }

  for (const entry of repos) {
    const { owner, repo, issue_number, issue_url, type } = entry;
    if (!issue_number) continue;

    let comments: { id: number; body: string; user: string }[];
    try {
      comments = await getNewComments(owner, repo, issue_number, env);
    } catch { continue; }

    for (const comment of comments) {
      // Mark as seen immediately to avoid double-reply
      await env.demo_preimages.put(
        `outbound:seen:${comment.id}`, "1", { expirationTtl: 86400 * 90 }
      );

      if (!comment.body.trim()) continue;

      const { reply, action } = await generateResponse(
        comment.body, comment.user, type ?? "operator", env
      );

      if (!reply) continue;

      const posted = await postComment(owner, repo, issue_number, reply, env);

      if (posted) {
        if (action === "close") {
          await closeIssue(owner, repo, issue_number, env);
        }
        await sendReplyAlert(owner, repo, issue_url, comment.user, comment.body, reply, action, env);
      }

      // Courtesy pause between repos
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
