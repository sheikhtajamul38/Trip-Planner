import { headers } from "next/headers";
import { query } from "./db";
import { WorkflowError } from "./types";

/**
 * Fixed-window rate limiting stored in Postgres, so limits hold across
 * serverless instances. One atomic upsert per check.
 */
export async function hit(key: string, windowSeconds: number): Promise<number> {
  const [row] = await query<{ count: number }>(
    `insert into rate_limits (key, window_start, count) values ($1, now(), 1)
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2) then now() else rate_limits.window_start end
     returning count`,
    [key, windowSeconds],
  );
  return row.count;
}

export async function limit(key: string, max: number, windowSeconds: number, message = "Too many requests. Please wait a few minutes and try again.") {
  if ((await hit(key, windowSeconds)) > max) throw new WorkflowError(message);
}

/** Best-effort client IP. Vercel and most proxies set x-forwarded-for; the first entry is the client. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export const LIMITS = {
  planTrip: { max: 15, window: 3600 },
  extract: { max: 30, window: 3600 },
  askPerTrip: { max: 40, window: 3600 },
  askPerIp: { max: 80, window: 3600 },
  editPerTrip: { max: 20, window: 3600 },
  requestQuotes: { max: 5, window: 3600 },
  tripWrite: { max: 30, window: 3600 },
  loginPerIp: { max: 20, window: 900 },
  loginPerAccount: { max: 8, window: 900 },
  recoverPerIp: { max: 5, window: 3600 },
  recoverPerPhone: { max: 3, window: 3600 },
} as const;

export async function limitByIp(name: keyof typeof LIMITS, message?: string) {
  const l = LIMITS[name];
  await limit(`${name}:ip:${await clientIp()}`, l.max, l.window, message);
}

/** Old windows are useless; call occasionally (e.g. from the admin dashboard). */
export async function pruneRateLimits() {
  await query(`delete from rate_limits where window_start < now() - interval '1 day'`);
}
