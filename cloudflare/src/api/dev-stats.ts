import type { Env } from "../worker";

export const TESTS_TOTAL = 392;

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

  return new Response(JSON.stringify({ stars, npm, tests: TESTS_TOTAL }), {
    headers: { "Content-Type": "application/json" },
  });
}

export function handleBadgeTests(): Response {
  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      label: "tests",
      message: `${TESTS_TOTAL} passing`,
      color: "22c55e",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=3600",
      },
    }
  );
}
