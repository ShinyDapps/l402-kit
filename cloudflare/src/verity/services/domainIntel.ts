import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall, recordSuccess } from "../pricing";

const SERVICE = "domainIntel";

export async function handleVerityDomainIntel(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    const url = new URL(req.url);
    let domain = url.searchParams.get("domain");
    if (!domain && req.method === "POST") {
      const body = await req.json().catch(() => ({})) as { domain?: string };
      domain = body.domain ?? null;
    }
    if (!domain) return json({ error: "Missing domain parameter" }, 400);

    domain = domain.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();

    await recordCall(SERVICE, env);
    await recordSuccess(SERVICE, env);

    const [whois, dns, certs] = await Promise.allSettled([
      fetchRdap(domain),
      fetchDns(domain),
      fetchCerts(domain),
    ]);

    return json({
      agent: "VERITY",
      service: SERVICE,
      domain,
      whois: whois.status === "fulfilled" ? whois.value : null,
      dns: dns.status === "fulfilled" ? dns.value : null,
      certificates: certs.status === "fulfilled" ? certs.value : [],
      paid_with: "⚡ Lightning L402",
    });
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}

async function fetchRdap(domain: string): Promise<unknown> {
  const r = await fetch(`https://rdap.org/domain/${domain}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!r.ok) return null;
  const data = await r.json() as Record<string, unknown>;
  return {
    registrar: extractEntity(data, "registrar"),
    registrant: extractEntity(data, "registrant"),
    registered: data.events ? findEvent(data.events as { eventAction: string; eventDate: string }[], "registration") : null,
    expires: data.events ? findEvent(data.events as { eventAction: string; eventDate: string }[], "expiration") : null,
    status: data.status ?? [],
    nameservers: Array.isArray(data.nameservers)
      ? (data.nameservers as { ldhName: string }[]).map(n => n.ldhName)
      : [],
  };
}

async function fetchDns(domain: string): Promise<unknown> {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A`, {
    headers: { Accept: "application/dns-json" },
    signal: AbortSignal.timeout(4_000),
  });
  if (!r.ok) return null;
  const data = await r.json() as { Answer?: { name: string; type: number; TTL: number; data: string }[] };
  return {
    a_records: (data.Answer ?? []).filter(r => r.type === 1).map(r => r.data),
    ttl: data.Answer?.[0]?.TTL ?? null,
  };
}

async function fetchCerts(domain: string): Promise<unknown[]> {
  const r = await fetch(
    `https://crt.sh/?q=${domain}&output=json`,
    { signal: AbortSignal.timeout(8_000) },
  );
  if (!r.ok) return [];
  const data = await r.json() as { id: number; not_before: string; not_after: string; name_value: string; issuer_name: string }[];
  return data.slice(0, 5).map(c => ({
    issued: c.not_before,
    expires: c.not_after,
    domains: c.name_value.split("\n"),
    issuer: c.issuer_name,
  }));
}

function extractEntity(data: Record<string, unknown>, role: string): string | null {
  const entities = data.entities as { roles?: string[]; vcardArray?: unknown[] }[] | undefined;
  if (!entities) return null;
  const entity = entities.find(e => e.roles?.includes(role));
  if (!entity?.vcardArray) return null;
  const vcard = entity.vcardArray as [string, unknown[][]];
  const fn = (vcard[1] ?? []).find(([type]) => type === "fn");
  return fn ? String(fn[3]) : null;
}

function findEvent(events: { eventAction: string; eventDate: string }[], action: string): string | null {
  return events.find(e => e.eventAction === action)?.eventDate ?? null;
}
