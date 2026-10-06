import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { one } from "./db";
import { TRIP_COOKIE_TTL, signPayload, tripCookieName, tripToken, verifyPayload, verifyTripToken } from "./tokens";
import { WorkflowError } from "./types";

export { hashPassword, verifyPassword } from "./passwords";

/**
 * Sessions are signed cookies carrying the user's id and `session_version`.
 * Every protected request re-checks the user in the database, so changing a
 * password, deactivating an agency or removing an admin revokes sessions at once.
 *
 * Tourists don't have accounts: a trip is unlocked by a signed per-trip cookie,
 * set in the browser that created it or by a magic link sent to their WhatsApp.
 */

export type Session = { kind: "admin"; userId: string; v: number } | { kind: "agency"; agencyId: string; userId: string; v: number };

const COOKIE = "ktp_session";
const MAX_AGE = 60 * 60 * 24 * 7;

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

export function encodeSession(session: Session): string {
  return signPayload(session, MAX_AGE);
}

export function decodeSession(token: string | undefined): Session | null {
  const data = verifyPayload<Session>(token);
  if (!data) return null;
  if (data.kind === "admin" && typeof data.userId === "string") return { kind: "admin", userId: data.userId, v: data.v };
  if (data.kind === "agency" && typeof data.agencyId === "string" && typeof data.userId === "string") {
    return { kind: "agency", agencyId: data.agencyId, userId: data.userId, v: data.v };
  }
  return null;
}

/** Signature check plus a live database check that the account is still allowed in. */
export async function getSession(): Promise<Session | null> {
  const s = decodeSession((await cookies()).get(COOKIE)?.value);
  if (!s) return null;
  if (s.kind === "admin") {
    const ok = await one(`select 1 from users where id = $1 and role = 'platform_admin' and session_version = $2`, [s.userId, s.v]);
    return ok ? s : null;
  }
  const ok = await one(
    `select 1 from users u join agency_users au on au.user_id = u.id join agencies a on a.id = au.agency_id
      where u.id = $1 and au.agency_id = $2 and u.session_version = $3 and a.active`,
    [s.userId, s.agencyId, s.v],
  );
  return ok ? s : null;
}

export async function setSession(session: Session) {
  (await cookies()).set(COOKIE, encodeSession(session), cookieOptions(MAX_AGE));
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

// --------------------------------------------------------------------------- tourist trip access

export async function grantTripAccess(tripId: string) {
  (await cookies()).set(tripCookieName(tripId), tripToken(tripId, "cookie"), cookieOptions(TRIP_COOKIE_TTL));
}

export async function hasTripAccess(tripId: string): Promise<boolean> {
  const token = (await cookies()).get(tripCookieName(tripId))?.value;
  if (verifyTripToken(token, tripId, "cookie")) return true;
  return (await getSession())?.kind === "admin";
}

/** Every tourist mutation calls this: the trip id in a bound server action is client-controlled. */
export async function requireTripAccess(tripId: string) {
  if (!(await hasTripAccess(tripId))) throw new WorkflowError("You don't have access to this trip. Open it from the link we sent you on WhatsApp.");
}
