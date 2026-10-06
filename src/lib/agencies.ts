import { validateNewPassword } from "./accounts";
import { hashPassword } from "./passwords";
import { getDb, one, query } from "./db";
import { type DestinationId, isDestinationId } from "./destinations";
import { logEvent, normalisePhone } from "./trips";
import { type AgencyRow, type CommissionModel, WorkflowError } from "./types";

export interface AgencyInput {
  name: string;
  description: string;
  phone: string;
  email?: string;
  coverage: string[];
  minBudget: number;
  maxBudget: number | null;
  commissionModel: CommissionModel;
  commissionRate: number;
}

function cleanInput(input: AgencyInput) {
  const phone = normalisePhone(input.phone);
  if (!input.name.trim()) throw new WorkflowError("Agency name is required.");
  if (!phone) throw new WorkflowError("Enter a valid phone number.");
  const coverage = input.coverage.filter(isDestinationId) as DestinationId[];
  if (!coverage.length) throw new WorkflowError("Pick at least one destination the agency covers.");
  return { ...input, phone, coverage, name: input.name.trim(), description: input.description.trim() };
}

/** Admin onboards an agency together with its first login. */
export async function createAgency(input: AgencyInput, login: { name: string; accessCode: string }): Promise<string> {
  const a = cleanInput(input);
  validateNewPassword(login.accessCode);
  const db = await getDb();
  return db.tx(async (q) => {
    const [agency] = await q.query<{ id: string }>(
      `insert into agencies (name, description, phone, email, coverage, min_budget, max_budget, commission_model, commission_rate)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [a.name, a.description, a.phone, a.email?.trim() || null, a.coverage, a.minBudget, a.maxBudget, a.commissionModel, a.commissionRate],
    );
    const existing = await q.query<{ id: string; role: string }>(`select id, role from users where phone = $1`, [a.phone]);
    if (existing[0] && existing[0].role === "tourist") {
      throw new WorkflowError("That phone number belongs to a tourist account.");
    }
    const [user] = existing[0]
      ? await q.query<{ id: string }>(`update users set password_hash = $2 where id = $1 returning id`, [existing[0].id, hashPassword(login.accessCode)])
      : await q.query<{ id: string }>(
          `insert into users (name, phone, email, role, password_hash) values ($1, $2, $3, 'agency_admin', $4) returning id`,
          [login.name.trim() || a.name, a.phone, a.email?.trim() || null, hashPassword(login.accessCode)],
        );
    await q.query(`insert into agency_users (agency_id, user_id, role) values ($1, $2, 'agency_admin')`, [agency.id, user.id]);
    await logEvent(q, "agency", agency.id, "created", "admin");
    return agency.id;
  });
}

export async function updateAgency(id: string, input: AgencyInput) {
  const a = cleanInput(input);
  await query(
    `update agencies set name = $2, description = $3, phone = $4, email = $5, coverage = $6, min_budget = $7, max_budget = $8,
       commission_model = $9, commission_rate = $10 where id = $1`,
    [id, a.name, a.description, a.phone, a.email?.trim() || null, a.coverage, a.minBudget, a.maxBudget, a.commissionModel, a.commissionRate],
  );
  await logEvent(await getDb(), "agency", id, "updated", "admin");
}

export async function setVerification(id: string, status: AgencyRow["verification_status"], verifiedItems: string[]) {
  await query(`update agencies set verification_status = $2, verified_items = $3 where id = $1`, [
    id,
    status,
    verifiedItems.map((s) => s.trim()).filter(Boolean),
  ]);
  await logEvent(await getDb(), "agency", id, "verification_changed", "admin", { status, verifiedItems });
}

export async function setAgencyActive(id: string, active: boolean) {
  await query(`update agencies set active = $2 where id = $1`, [id, active]);
}

export async function getAgency(id: string) {
  return one<AgencyRow>(`select * from agencies where id = $1`, [id]);
}

export async function listAgencies() {
  return query<AgencyRow>(`select * from agencies order by created_at`);
}
