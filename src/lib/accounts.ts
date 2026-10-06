import crypto from "node:crypto";
import { getDb, one, query } from "./db";
import { hashPassword, verifyPassword } from "./passwords";
import { logEvent, normalisePhone } from "./trips";
import { WorkflowError } from "./types";

export const MIN_PASSWORD = 10;

// Verifying against a dummy hash when the account doesn't exist keeps login timing uniform.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString("hex"));

export function validateNewPassword(pw: string) {
  if (pw.length < MIN_PASSWORD) throw new WorkflowError(`Use at least ${MIN_PASSWORD} characters.`);
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|password)/i.test(pw)) throw new WorkflowError("That password is too easy to guess.");
}

export function generatePassword(): string {
  return crypto.randomBytes(12).toString("base64url");
}

export async function createAdmin(email: string, name: string, password: string): Promise<string> {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new WorkflowError("Enter a valid email.");
  validateNewPassword(password);
  const existing = await one<{ id: string }>(`select id from users where lower(email) = $1 and role = 'platform_admin'`, [e]);
  if (existing) {
    await query(`update users set password_hash = $2, session_version = session_version + 1 where id = $1`, [existing.id, hashPassword(password)]);
    return existing.id;
  }
  const [row] = await query<{ id: string }>(
    `insert into users (name, email, role, password_hash) values ($1, $2, 'platform_admin', $3) returning id`,
    [name.trim() || e, e, hashPassword(password)],
  );
  return row.id;
}

export async function adminLogin(email: string, password: string): Promise<{ userId: string; v: number } | null> {
  const row = await one<{ id: string; password_hash: string | null; session_version: number }>(
    `select id, password_hash, session_version from users where lower(email) = $1 and role = 'platform_admin'`,
    [email.trim().toLowerCase()],
  );
  const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  return row && ok ? { userId: row.id, v: row.session_version } : null;
}

export async function agencyLogin(phoneRaw: string, accessCode: string): Promise<{ agencyId: string; userId: string; v: number } | null> {
  const phone = normalisePhone(phoneRaw);
  const row = phone
    ? await one<{ user_id: string; agency_id: string; password_hash: string | null; active: boolean; session_version: number }>(
        `select u.id as user_id, au.agency_id, u.password_hash, a.active, u.session_version
           from users u join agency_users au on au.user_id = u.id join agencies a on a.id = au.agency_id
          where u.phone = $1 order by au.role limit 1`,
        [phone],
      )
    : null;
  const ok = verifyPassword(accessCode, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok || !row.active) return null;
  return { agencyId: row.agency_id, userId: row.user_id, v: row.session_version };
}

/** Changing the access code signs out every other device. Returns the new session version. */
export async function changePassword(userId: string, current: string, next: string): Promise<number> {
  const row = await one<{ password_hash: string | null }>(`select password_hash from users where id = $1`, [userId]);
  if (!row || !verifyPassword(current, row.password_hash)) throw new WorkflowError("Your current access code is wrong.");
  validateNewPassword(next);
  const [updated] = await query<{ session_version: number }>(
    `update users set password_hash = $2, session_version = session_version + 1 where id = $1 returning session_version`,
    [userId, hashPassword(next)],
  );
  await logEvent(await getDb(), "user", userId, "password_changed", `user:${userId}`);
  return updated.session_version;
}

/** Admin resets an agency login, e.g. when an operator forgets their code. */
export async function resetAgencyCode(agencyId: string, code: string) {
  validateNewPassword(code);
  const rows = await query(
    `update users set password_hash = $2, session_version = session_version + 1
      where id in (select user_id from agency_users where agency_id = $1) returning id`,
    [agencyId, hashPassword(code)],
  );
  if (!rows.length) throw new WorkflowError("This agency has no login.");
  await logEvent(await getDb(), "agency", agencyId, "access_code_reset", "admin");
}
