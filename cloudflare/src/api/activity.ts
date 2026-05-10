import type { Env } from "../worker";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
  });
}

function sb(path: string, env: Env): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    },
  });
}

interface AgentEventRow {
  id: string;
  event_type: string;
  agent_id: string | null;
  endpoint: string | null;
  amount_sats: number | null;
  created_at: string;
}

interface AgentCountRow {
  agent_id: string | null;
  count: string; // PostgREST returns aggregate as string
}

export async function handleActivity(_req: Request, env: Env): Promise<Response> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // Run all queries in parallel
    const [eventsRes, recentRes, topAgentsRes] = await Promise.all([
      // Aggregate stats: total events, unique agents, total sats settled
      sb(
        `/agent_events?created_at=gte.${encodeURIComponent(since)}&select=agent_id,event_type,amount_sats,settled`,
        env,
      ),
      // Last 20 events
      sb(
        `/agent_events?created_at=gte.${encodeURIComponent(since)}&select=id,event_type,agent_id,endpoint,amount_sats,created_at&order=created_at.desc&limit=20`,
        env,
      ),
      // Top 5 agents by event count
      sb(
        `/agent_events?created_at=gte.${encodeURIComponent(since)}&select=agent_id&agent_id=not.is.null&order=agent_id.asc`,
        env,
      ),
    ]);

    const allEvents = eventsRes.ok
      ? ((await eventsRes.json()) as { agent_id: string | null; event_type: string; amount_sats: number | null; settled: boolean | null }[])
      : [];

    const recentEvents = recentRes.ok
      ? ((await recentRes.json()) as AgentEventRow[])
      : [];

    const agentRows = topAgentsRes.ok
      ? ((await topAgentsRes.json()) as { agent_id: string }[])
      : [];

    // Compute stats from allEvents
    const uniqueAgentSet = new Set<string>();
    let totalSats = 0;

    for (const row of allEvents) {
      if (row.agent_id) uniqueAgentSet.add(row.agent_id);
      if (row.event_type === "l402.payment.settled" && row.settled === true && row.amount_sats) {
        totalSats += row.amount_sats;
      }
    }

    // Top 5 agents
    const agentCountMap = new Map<string, number>();
    for (const row of agentRows) {
      if (row.agent_id) {
        agentCountMap.set(row.agent_id, (agentCountMap.get(row.agent_id) ?? 0) + 1);
      }
    }
    const topAgents = Array.from(agentCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([agent_id, event_count]) => ({ agent_id, event_count }));

    return json({
      total_events: allEvents.length,
      unique_agents: uniqueAgentSet.size,
      total_sats: totalSats,
      recent_events: recentEvents,
      top_agents: topAgents,
    });
  } catch {
    return json({
      total_events: 0,
      unique_agents: 0,
      total_sats: 0,
      recent_events: [],
      top_agents: [],
    });
  }
}
