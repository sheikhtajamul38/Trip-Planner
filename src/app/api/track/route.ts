import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hit } from "@/lib/ratelimit";

/**
 * First-party funnel beacons for the steps that don't otherwise write a row.
 * Stores a random visitor id only — no IP, no user agent.
 */
const ALLOWED = new Set(["visit", "planner_started"]);

export async function POST(req: Request) {
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  if (!name || !ALLOWED.has(name)) return NextResponse.json({ error: "unknown event" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if ((await hit(`track:ip:${ip}`, 3600)) > 300) return new NextResponse(null, { status: 429 });

  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)ktp_vid=([\w-]{16,64})/)?.[1];
  const visitor = cookie ?? crypto.randomUUID();
  // One row per visitor per event per day is enough for a funnel.
  await query(
    `insert into analytics_events (name, visitor_id)
     select $1, $2 where not exists (
       select 1 from analytics_events where name = $1 and visitor_id = $2 and created_at > now() - interval '1 day')`,
    [name, visitor],
  );
  const res = new NextResponse(null, { status: 204 });
  if (!cookie) {
    res.cookies.set("ktp_vid", visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
