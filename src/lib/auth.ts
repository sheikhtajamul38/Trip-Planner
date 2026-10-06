import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export { hashPassword, verifyPassword } from "./passwords";

/**
 * Deliberately small auth for V1: a signed cookie for agency staff and the
 * platform admin. Tourists don't log in — their trip lives at an unguessable URL.
 */

export type Session = { kind: "admin" } | { kind: "agency"; agencyId: string; userId: string };

const COOKIE = "ktp_session";
const MAX_AGE = 60 * 60 * 24 * 14;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return s || "dev-only-session-secret";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function encodeSession(session: Session): string {
  const body = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as Session & { exp: number };
    if (data.exp < Date.now()) return null;
    if (data.kind === "admin") return { kind: "admin" };
    if (data.kind === "agency") return { kind: "agency", agencyId: data.agencyId, userId: data.userId };
  } catch {
    // fall through
  }
  return null;
}

export async function getSession(): Promise<Session | null> {
  return decodeSession((await cookies()).get(COOKIE)?.value);
}

export async function setSession(session: Session) {
  (await cookies()).set(COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function requireAdmin() {
  const s = await getSession();
  if (s?.kind !== "admin") redirect("/admin/login");
  return s;
}

export async function requireAgency() {
  const s = await getSession();
  if (s?.kind !== "agency") redirect("/agency/login");
  return s;
}

export function checkAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return process.env.NODE_ENV !== "production" && password === "admin";
  const a = crypto.createHash("sha256").update(password).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
