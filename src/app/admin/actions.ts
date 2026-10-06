"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/app/actions";
import { type AgencyInput, createAgency, setAgencyActive, setVerification, updateAgency } from "@/lib/agencies";
import { adminLogin, resetAgencyCode } from "@/lib/accounts";
import { clearSession, requireAdmin, setSession } from "@/lib/auth";
import { LIMITS, limit, limitByIp } from "@/lib/ratelimit";
import { query } from "@/lib/db";
import { addCredits, assignLead, expireLead, cancelBooking, completeTrip, recordPayment, setPaymentStatus } from "@/lib/marketplace";
import { logEvent } from "@/lib/trips";
import { getDb } from "@/lib/db";
import { type CommissionModel, WorkflowError } from "@/lib/types";

/** Admin forms are plain posts: business errors come back as ?error= on the page they came from. */
async function run(back: string, fn: () => Promise<unknown>) {
  await requireAdmin();
  try {
    await fn();
  } catch (err) {
    if (err instanceof WorkflowError) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(err.message)}`);
    throw err;
  }
  revalidatePath(back.split("?")[0]);
  redirect(back);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function adminLoginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = str(form, "email").toLowerCase();
  try {
    await limitByIp("loginPerIp");
    await limit(`login:admin:${email}`, LIMITS.loginPerAccount.max, LIMITS.loginPerAccount.window);
  } catch (err) {
    if (err instanceof WorkflowError) return { error: err.message, values: { email } };
    throw err;
  }
  const res = await adminLogin(email, str(form, "password"));
  if (!res) return { error: "Wrong email or password.", values: { email } };
  await setSession({ kind: "admin", ...res });
  redirect("/admin");
}

export async function adminLogoutAction() {
  await clearSession();
  redirect("/admin/login");
}

function agencyInput(form: FormData): AgencyInput {
  const max = str(form, "maxBudget");
  return {
    name: str(form, "name"),
    description: str(form, "description"),
    phone: str(form, "phone"),
    email: str(form, "email"),
    coverage: form.getAll("coverage").map(String),
    minBudget: Number(str(form, "minBudget") || 0),
    maxBudget: max ? Number(max) : null,
    commissionModel: (str(form, "commissionModel") || "FREE") as CommissionModel,
    commissionRate: Number(str(form, "commissionRate") || 0),
  };
}

export async function createAgencyAction(form: FormData) {
  let id = "";
  await requireAdmin();
  try {
    id = await createAgency(agencyInput(form), { name: str(form, "contactName"), accessCode: str(form, "accessCode") });
  } catch (err) {
    if (err instanceof WorkflowError) redirect(`/admin/agencies?error=${encodeURIComponent(err.message)}`);
    throw err;
  }
  redirect(`/admin/agencies/${id}`);
}

export async function updateAgencyAction(id: string, form: FormData) {
  await run(`/admin/agencies/${id}`, () => updateAgency(id, agencyInput(form)));
}

export async function verificationAction(id: string, form: FormData) {
  const status = str(form, "status") as "PENDING" | "VERIFIED" | "SUSPENDED";
  await run(`/admin/agencies/${id}`, () => setVerification(id, status, str(form, "verifiedItems").split("\n")));
}

export async function toggleActiveAction(id: string, active: boolean) {
  await run(`/admin/agencies/${id}`, () => setAgencyActive(id, active));
}

export async function creditsAction(id: string, form: FormData) {
  await run(`/admin/agencies/${id}`, () => addCredits(id, Number(str(form, "credits")), str(form, "reason")));
}

export async function assignLeadAction(tripId: string, back: string, form: FormData) {
  await run(back, () => assignLead(tripId, str(form, "agencyId")));
}

export async function paymentStatusAction(paymentId: string, status: "VERIFIED" | "FAILED", back: string) {
  await run(back, () => setPaymentStatus(paymentId, status, "admin"));
}

export async function adminRecordPaymentAction(bookingId: string, back: string, form: FormData) {
  await run(back, () =>
    recordPayment(bookingId, {
      amount: Number(str(form, "amount")),
      type: (str(form, "type") || "DEPOSIT") as "DEPOSIT" | "BALANCE" | "REFUND",
      reference: str(form, "reference"),
      recordedBy: "admin",
      verified: true,
    }),
  );
}

export async function resolveIssueAction(issueId: string, back: string) {
  await run(back, async () => {
    await query(`update issues set status = 'RESOLVED' where id = $1`, [issueId]);
    await logEvent(await getDb(), "issue", issueId, "resolved", "admin");
  });
}

export async function notificationSentAction(id: string) {
  await run("/admin", () => query(`update notifications set status = 'SENT', sent_at = now() where id = $1`, [id]));
}

export async function forceCompleteAction(tripId: string) {
  await run(`/admin/trips/${tripId}`, () => completeTrip(tripId, "admin", { force: true }));
}

export async function cancelBookingAction(bookingId: string, tripId: string, form: FormData) {
  await run(`/admin/trips/${tripId}`, () => cancelBooking(bookingId, str(form, "reason")));
}

export async function resetAgencyCodeAction(id: string, form: FormData) {
  await run(`/admin/agencies/${id}`, () => resetAgencyCode(id, str(form, "code")));
}

export async function expireLeadAction(leadId: string) {
  await run("/admin", () => expireLead(leadId, "missed response target"));
}
