"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/app/actions";
import { agencyLogin, changePassword } from "@/lib/accounts";
import { LIMITS, limit, limitByIp } from "@/lib/ratelimit";
import type { QuoteDetails } from "@/lib/ai";
import { clearSession, requireAgency, setSession } from "@/lib/auth";
import { acceptLead, declineLead, recordPayment, sendQuote } from "@/lib/marketplace";
import { one } from "@/lib/db";
import { WorkflowError } from "@/lib/types";

async function attempt(fn: () => Promise<void | string>): Promise<ActionState> {
  try {
    const ok = await fn();
    return ok ? { ok } : {};
  } catch (err) {
    if (err instanceof WorkflowError) return { error: err.message };
    throw err;
  }
}

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const phone = String(form.get("phone") ?? "");
  const limited = await attempt(async () => {
    await limitByIp("loginPerIp");
    await limit(`login:agency:${phone.replace(/\D/g, "").slice(-10)}`, LIMITS.loginPerAccount.max, LIMITS.loginPerAccount.window);
  });
  if (limited?.error) return { ...limited, values: { phone } };
  const res = await agencyLogin(phone, String(form.get("code") ?? ""));
  if (!res) return { error: "Phone number or access code is incorrect.", values: { phone } };
  await setSession({ kind: "agency", ...res });
  redirect("/agency");
}

export async function logoutAction() {
  await clearSession();
  redirect("/agency/login");
}

export async function acceptLeadAction(leadId: string, _: ActionState): Promise<ActionState> {
  const s = await requireAgency();
  return attempt(async () => {
    await acceptLead(leadId, s.agencyId);
    revalidatePath(`/agency/leads/${leadId}`);
  });
}

export async function declineLeadAction(leadId: string, _: ActionState): Promise<ActionState> {
  const s = await requireAgency();
  const res = await attempt(() => declineLead(leadId, s.agencyId));
  if (res?.error) return res;
  redirect("/agency");
}

export async function sendQuoteAction(leadId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await requireAgency();
  const categories = form.getAll("category").map(String);
  const labels = form.getAll("label").map(String);
  const amounts = form.getAll("amount").map((a) => Number(String(a).replace(/[,₹\s]/g, "") || 0));
  const details: QuoteDetails = {
    lineItems: labels.map((label, i) => ({ category: categories[i] || "Other", label, amount: amounts[i] })),
    markup: Number(String(form.get("markup") ?? "0").replace(/[,₹\s]/g, "") || 0),
    inclusions: String(form.get("inclusions") ?? "").trim().slice(0, 1000),
    exclusions: String(form.get("exclusions") ?? "").trim().slice(0, 1000),
    notes: String(form.get("notes") ?? "").trim().slice(0, 1000),
  };
  const validDays = Math.min(Math.max(Number(form.get("validDays") ?? 7), 1), 30);
  return attempt(async () => {
    await sendQuote(leadId, s.agencyId, details, validDays);
    revalidatePath(`/agency/leads/${leadId}`);
    return "Quote sent to the customer.";
  });
}

export async function recordPaymentAction(bookingId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await requireAgency();
  const owns = await one(`select 1 from bookings where id = $1 and agency_id = $2`, [bookingId, s.agencyId]);
  if (!owns) return { error: "Booking not found." };
  const type = String(form.get("type")) === "BALANCE" ? "BALANCE" : "DEPOSIT";
  return attempt(async () => {
    await recordPayment(bookingId, {
      amount: Number(form.get("amount")),
      type,
      reference: String(form.get("reference") ?? ""),
      recordedBy: `agency:${s.agencyId}`,
    });
    revalidatePath(`/agency/bookings/${bookingId}`);
    return "Payment recorded — the platform will verify it.";
  });
}

export async function changeCodeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const s = await requireAgency();
  return attempt(async () => {
    await limit(`changeCode:${s.userId}`, 5, 900);
    if (String(form.get("next")) !== String(form.get("confirm"))) throw new WorkflowError("The new codes don't match.");
    const v = await changePassword(s.userId, String(form.get("current") ?? ""), String(form.get("next") ?? ""));
    await setSession({ ...s, v });
    return "Access code changed. Other devices have been signed out.";
  });
}
