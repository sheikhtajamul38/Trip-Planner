import crypto from "node:crypto";

/**
 * HMAC-signed tokens shared by sessions and trip magic links. No Next.js
 * dependencies so workflow code (and tests) can mint links for notifications.
 */

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!s || s.length < 32)) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production");
  }
  return s || "dev-only-session-secret";
}

function mac(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function signPayload(payload: object, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifyPayload<T extends object>(token: string | undefined | null): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = mac(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
    return typeof data.exp === "number" && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------- trip access

export const TRIP_LINK_TTL = 60 * 60 * 24 * 14; // magic links sent on WhatsApp
export const TRIP_COOKIE_TTL = 60 * 60 * 24 * 180; // the browser that holds the trip

export type TripTokenPurpose = "link" | "cookie";

export function tripToken(tripId: string, purpose: TripTokenPurpose): string {
  return signPayload({ trip: tripId, p: purpose }, purpose === "link" ? TRIP_LINK_TTL : TRIP_COOKIE_TTL);
}

export function verifyTripToken(token: string | undefined | null, tripId: string, purpose: TripTokenPurpose): boolean {
  const data = verifyPayload<{ trip: string; p: string }>(token);
  return !!data && data.trip === tripId && data.p === purpose;
}

const TRIP_PAGES = ["", "/quotes", "/booking"] as const;
export type TripPage = (typeof TRIP_PAGES)[number];

export function isTripPage(v: string): v is TripPage {
  return (TRIP_PAGES as readonly string[]).includes(v);
}

/** Path of a magic link that unlocks the trip in whichever browser opens it. */
export function tripMagicPath(tripId: string, page: TripPage = ""): string {
  return `/trip/${tripId}/access?t=${tripToken(tripId, "link")}${page ? `&next=${page.slice(1)}` : ""}`;
}

export function tripCookieName(tripId: string): string {
  return `ktp_trip_${tripId.replaceAll("-", "")}`;
}
