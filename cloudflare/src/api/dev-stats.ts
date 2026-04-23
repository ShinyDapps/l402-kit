import type { Env } from "../worker";

export async function handleDevStats(_req: Request, env: Env): Promise<Response> {
  const [starsRes, npmRes] = await Promise.allSettled([
    fetch("https://api.github.com/repos/ShinyDapps/l402-kit", {
      headers: { "User-Agent": "l402kit-worker" },
    }),
    fetch("https://api.npmjs.org/downloads/point/last-week/l402-kit"),
  ]);

  const stars = starsRes.status === "fulfilled" && starsRes.value.ok
    ? ((await starsRes.value.json()) as { stargazers_count: number }).stargazers_count
    : null;

  const npm = npmRes.status === "fulfilled" && npmRes.value.ok
    ? ((await npmRes.value.json()) as { downloads: number }).downloads
    : null;

  return new Response(JSON.stringify({ stars, npm }), {
    headers: { "Content-Type": "application/json" },
  });
}
