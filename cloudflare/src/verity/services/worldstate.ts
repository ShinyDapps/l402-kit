import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall } from "../pricing";

const SERVICE = "worldstate";

export async function handleVerityWorldState(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    await recordCall(SERVICE, env);

    const now = new Date();
    const cf = (req as Request & { cf?: CloudflareRequestCF }).cf;

    const lat = cf?.latitude ? parseFloat(String(cf.latitude)) : null;
    const lon = cf?.longitude ? parseFloat(String(cf.longitude)) : null;

    const [weather] = await Promise.allSettled([
      lat && lon ? fetchWeather(lat, lon) : Promise.resolve(null),
    ]);

    return json({
      agent: "VERITY",
      service: SERVICE,
      time: {
        utc: now.toISOString(),
        unix: Math.floor(Date.now() / 1000),
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        day: now.getUTCDate(),
        hour: now.getUTCHours(),
        minute: now.getUTCMinutes(),
        second: now.getUTCSeconds(),
        weekday: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][now.getUTCDay()],
      },
      location: {
        latitude: lat,
        longitude: lon,
        city: cf?.city ?? null,
        region: cf?.region ?? null,
        country: cf?.country ?? null,
        timezone: cf?.timezone ?? null,
        continent: cf?.continent ?? null,
      },
      weather: weather.status === "fulfilled" ? weather.value : null,
      paid_with: "⚡ Lightning L402",
    });
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}

async function fetchWeather(lat: number, lon: number): Promise<unknown> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,windspeed_10m,weathercode,relativehumidity_2m&timezone=auto`;
  const r = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!r.ok) return null;
  const d = await r.json() as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      windspeed_10m: number;
      weathercode: number;
      relativehumidity_2m: number;
    };
    timezone: string;
    timezone_abbreviation: string;
  };
  return {
    temperature_c: d.current.temperature_2m,
    feels_like_c: d.current.apparent_temperature,
    humidity_pct: d.current.relativehumidity_2m,
    wind_kmh: d.current.windspeed_10m,
    condition: wmoCode(d.current.weathercode),
    local_timezone: d.timezone,
    tz_abbr: d.timezone_abbreviation,
  };
}

function wmoCode(code: number): string {
  if (code === 0) return "clear sky";
  if (code <= 3) return "partly cloudy";
  if (code <= 9) return "fog";
  if (code <= 19) return "drizzle";
  if (code <= 29) return "rain";
  if (code <= 39) return "snow";
  if (code <= 49) return "freezing rain";
  if (code <= 59) return "drizzle";
  if (code <= 69) return "rain";
  if (code <= 79) return "snow";
  if (code <= 84) return "rain showers";
  if (code <= 94) return "thunderstorm";
  return "thunderstorm with hail";
}
