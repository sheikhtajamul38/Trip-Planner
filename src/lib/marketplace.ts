import { type QuoteDetails, summarizeQuote } from "./ai";
import { type Queryable, getDb } from "./db";
import { inr, todayIST } from "./format";
import { notify } from "./notify";
import { addDays } from "./planner";
import { tripMagicPath } from "./tokens";
import { logEvent } from "./trips";
import {
  type AgencyRow,
  type BookingRow,
  type LeadRow,
  type PaymentRow,
  type PaymentType,
  type QuoteRow,
  type TripRow,
  WorkflowError,
} from "./types";

/**
 * Deterministic state machine for the money side of the marketplace:
 *
 *   lead:    NEW → ACCEPTED → QUOTE_SENT → CUSTOMER_VIEWED → SELECTED | LOST
 *            NEW → DECLINED | EXPIRED
 *   booking: PENDING_DEPOSIT → CONFIRMED (verified deposit) → COMPLETED (customer confirms)
 *
 * Every transition happens in a transaction, checks the current state, and is logged.
 */

export const DEPOSIT_AMOUNT = Number(process.env.DEPOSIT_AMOUNT ?? 5000);
/** Agencies should accept or decline a new lead within this many hours. */
export const LEAD_RESPONSE_HOURS = Number(process.env.LEAD_RESPONSE_HOURS ?? 2);
/** …and send a quote within this many hours of accepting. */
export const QUOTE_DUE_HOURS = Number(process.env.QUOTE_DUE_HOURS ?? 24);

async function tx<T>(fn: (q: Queryable) => Promise<T>) {
  return (await getDb()).tx(fn);
}

async function lockLead(q: Queryable, leadId: string, agencyId: string | null) {
  const [lead] = await q.query<LeadRow>(`select * from leads where id = $1 for update`, [leadId]);
  if (!lead || (agencyId && lead.agency_id !== agencyId)) throw new WorkflowError("Lead not found.");
  return lead;
}

export async function expireStaleLeads(hours = Number(process.env.LEAD_EXPIRY_HOURS ?? 24)) {
  const db = await getDb();
  const rows = await db.query<{ id: string }>(
    `update leads set status = 'EXPIRED' where status = 'NEW' and created_at < now() - make_interval(hours => $1) returning id`,
    [hours],
  );
  for (const r of rows) await logEvent(db, "lead", r.id, "expired", "system");
  await db.query(`update quotes set status = 'EXPIRED' where status in ('SENT', 'VIEWED') and valid_until < $1`, [todayIST()]);
  return rows.length;
}

// --------------------------------------------------------------------------- agency side

/** Accepting a lead reveals the customer's contact details and uses one credit on a lead-fee plan. */
export async function acceptLead(leadId: string, agencyId: string) {
  return tx(async (q) => {
    const lead = await lockLead(q, leadId, agencyId);
    if (lead.status !== "NEW") throw new WorkflowError(`This lead is already ${lead.status.toLowerCase().replace("_", " ")}.`);
    const [agency] = await q.query<AgencyRow>(`select * from agencies where id = $1 for update`, [agencyId]);
    let charged = false;
    if (agency.commission_model === "LEAD_FEE") {
      const res = await q.query(`update agencies set lead_credits = lead_credits - 1 where id = $1 and lead_credits > 0 returning id`, [agencyId]);
      if (!res.length) throw new WorkflowError("You have no lead credits left. Contact the platform to top up.");
      await q.query(`insert into credit_transactions (agency_id, delta, reason, lead_id) values ($1, -1, 'lead_accepted', $2)`, [agencyId, leadId]);
      charged = true;
    }
    await q.query(`update leads set status = 'ACCEPTED', accepted_at = now(), credit_charged = $2 where id = $1`, [leadId, charged]);
    await logEvent(q, "lead", leadId, "accepted", `agency:${agencyId}`, { charged });
  });
}

export async function declineLead(leadId: string, agencyId: string) {
  return tx(async (q) => {
    const lead = await lockLead(q, leadId, agencyId);
    if (lead.status !== "NEW") throw new WorkflowError("Only new leads can be declined.");
    await q.query(`update leads set status = 'DECLINED' where id = $1`, [leadId]);
    await logEvent(q, "lead", leadId, "declined", `agency:${agencyId}`);
  });
}

export function quoteTotal(details: Pick<QuoteDetails, "lineItems" | "markup">): number {
  return details.lineItems.reduce((s, l) => s + l.amount, 0) + details.markup;
}

export function validateQuoteDetails(details: QuoteDetails) {
  const items = details.lineItems.filter((l) => l.label.trim() || l.amount);
  if (!items.length) throw new WorkflowError("Add at least one line item.");
  for (const l of items) {
    if (!l.label.trim()) throw new WorkflowError("Every line item needs a description.");
    if (!Number.isFinite(l.amount) || l.amount < 0) throw new WorkflowError(`Invalid amount for "${l.label}".`);
  }
  if (!Number.isFinite(details.markup) || details.markup < 0) throw new WorkflowError("Markup can't be negative.");
  const clean = { ...details, lineItems: items.map((l) => ({ ...l, amount: Math.round(l.amount), label: l.label.trim() })) };
  if (quoteTotal(clean) <= 0) throw new WorkflowError("The quote total must be more than zero.");
  return clean;
}

/** The total is always computed here from the line items — never taken from the client or the AI. */
export async function sendQuote(leadId: string, agencyId: string, rawDetails: QuoteDetails, validDays = 7) {
  const details = validateQuoteDetails(rawDetails);
  const amount = quoteTotal(details);
  const db = await getDb();
  const [ctx] = await db.query<{ name: string; start_date: string; end_date: string }>(
    `select a.name, t.start_date, t.end_date from leads l join agencies a on a.id = l.agency_id join trips t on t.id = l.trip_id where l.id = $1`,
    [leadId],
  );
  if (!ctx) throw new WorkflowError("Lead not found.");
  const summary = await summarizeQuote(ctx.name, amount, details, { start: ctx.start_date, end: ctx.end_date });

  return tx(async (q) => {
    const lead = await lockLead(q, leadId, agencyId);
    if (!["ACCEPTED", "QUOTE_SENT", "CUSTOMER_VIEWED"].includes(lead.status)) {
      throw new WorkflowError(lead.status === "NEW" ? "Accept the lead before quoting." : "This lead is closed.");
    }
    const [trip] = await q.query<TripRow & { phone: string | null }>(
      `select t.*, u.phone from trips t left join users u on u.id = t.user_id where t.id = $1`,
      [lead.trip_id],
    );
    if (trip.status !== "QUOTES_REQUESTED") throw new WorkflowError("The customer is no longer collecting quotes.");
    await q.query(`update quotes set status = 'SUPERSEDED' where lead_id = $1 and status in ('SENT', 'VIEWED')`, [leadId]);
    const [quote] = await q.query<{ id: string }>(
      `insert into quotes (lead_id, agency_id, amount, details, customer_summary, valid_until)
       values ($1, $2, $3, $4::jsonb, $5, $6) returning id`,
      [leadId, agencyId, amount, JSON.stringify(details), summary, addDays(todayIST(), validDays)],
    );
    await q.query(`update leads set status = 'QUOTE_SENT', revision_note = null where id = $1`, [leadId]);
    await logEvent(q, "quote", quote.id, "sent", `agency:${agencyId}`, { leadId, amount });
    await notify(q, trip.phone, `${ctx.name} sent a quote of ${inr(amount)} for your Kashmir trip.`, tripMagicPath(trip.id, "/quotes"));
    return quote.id;
  });
}

// --------------------------------------------------------------------------- customer side

/** Opening the comparison screen marks fresh quotes as seen — agencies see it on their dashboard. */
export async function markQuotesViewed(tripId: string) {
  const db = await getDb();
  await db.query(
    `update quotes set status = 'VIEWED' where status = 'SENT' and lead_id in (select id from leads where trip_id = $1)`,
    [tripId],
  );
  await db.query(`update leads set status = 'CUSTOMER_VIEWED' where trip_id = $1 and status = 'QUOTE_SENT'`, [tripId]);
}

export async function selectQuote(tripId: string, quoteId: string): Promise<string> {
  return tx(async (q) => {
    const [trip] = await q.query<TripRow>(`select * from trips where id = $1 for update`, [tripId]);
    if (!trip) throw new WorkflowError("Trip not found.");
    if (trip.status !== "QUOTES_REQUESTED") throw new WorkflowError("This trip is already booked.");
    const [quote] = await q.query<QuoteRow & { trip_id: string }>(
      `select qu.*, l.trip_id from quotes qu join leads l on l.id = qu.lead_id where qu.id = $1 for update`,
      [quoteId],
    );
    if (!quote || quote.trip_id !== tripId) throw new WorkflowError("Quote not found.");
    if (!["SENT", "VIEWED"].includes(quote.status)) throw new WorkflowError("This quote is no longer available.");
    if (quote.valid_until < todayIST()) throw new WorkflowError("This quote has expired — ask the operator for a new one.");

    const deposit = Math.min(DEPOSIT_AMOUNT, quote.amount);
    const [booking] = await q.query<{ id: string }>(
      `insert into bookings (trip_id, agency_id, quote_id, total_amount, deposit_amount) values ($1, $2, $3, $4, $5) returning id`,
      [tripId, quote.agency_id, quoteId, quote.amount, deposit],
    );
    await q.query(`update quotes set status = 'ACCEPTED' where id = $1`, [quoteId]);
    await q.query(
      `update quotes set status = 'REJECTED' where id <> $1 and status in ('SENT', 'VIEWED') and lead_id in (select id from leads where trip_id = $2)`,
      [quoteId, tripId],
    );
    await q.query(`update leads set status = 'SELECTED' where id = $1`, [quote.lead_id]);
    await q.query(
      `update leads set status = case when status = 'NEW' then 'EXPIRED' else 'LOST' end
        where trip_id = $1 and id <> $2 and status in ('NEW', 'ACCEPTED', 'QUOTE_SENT', 'CUSTOMER_VIEWED')`,
      [tripId, quote.lead_id],
    );
    await q.query(`update trips set status = 'BOOKED', updated_at = now() where id = $1`, [tripId]);
    await logEvent(q, "booking", booking.id, "created", "tourist", { quoteId, amount: quote.amount, deposit });
    const [agency] = await q.query<{ phone: string }>(`select phone from agencies where id = $1`, [quote.agency_id]);
    await notify(q, agency?.phone, `Your quote of ${inr(quote.amount)} was selected! Deposit due: ${inr(deposit)}.`, `/agency/bookings/${booking.id}`);
    return booking.id;
  });
}

// --------------------------------------------------------------------------- payments

/**
 * Payment status is only ever set by the backend: an admin verifying a transfer
 * by hand, or a signed provider webhook. Never by the AI or the browser.
 */
export async function recordPayment(
  bookingId: string,
  input: { amount: number; type: PaymentType; reference?: string | null; recordedBy: string; verified?: boolean },
): Promise<string> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new WorkflowError("Enter a payment amount.");
  return tx(async (q) => {
    const [booking] = await q.query<BookingRow>(`select * from bookings where id = $1 for update`, [bookingId]);
    if (!booking) throw new WorkflowError("Booking not found.");
    if (booking.status === "CANCELLED") throw new WorkflowError("This booking is cancelled.");
    const [payment] = await q.query<{ id: string }>(
      `insert into payments (booking_id, amount, payment_type, payment_status, payment_provider_reference, recorded_by, verified_at)
       values ($1, $2, $3, $4, $5, $6, case when $4 = 'VERIFIED' then now() end) returning id`,
      [bookingId, Math.round(input.amount), input.type, input.verified ? "VERIFIED" : "PENDING", input.reference?.trim() || null, input.recordedBy],
    );
    await logEvent(q, "payment", payment.id, "recorded", input.recordedBy, { bookingId, amount: input.amount, type: input.type, verified: !!input.verified });
    if (input.verified) await confirmIfPaid(q, booking);
    return payment.id;
  });
}

export async function setPaymentStatus(paymentId: string, status: "VERIFIED" | "FAILED", actor: string) {
  return tx(async (q) => {
    const [payment] = await q.query<PaymentRow>(`select * from payments where id = $1 for update`, [paymentId]);
    if (!payment) throw new WorkflowError("Payment not found.");
    if (payment.payment_status !== "PENDING") throw new WorkflowError("This payment has already been processed.");
    await q.query(`update payments set payment_status = $2, verified_at = case when $2 = 'VERIFIED' then now() end where id = $1`, [paymentId, status]);
    await logEvent(q, "payment", paymentId, status.toLowerCase(), actor);
    if (status === "VERIFIED") {
      const [booking] = await q.query<BookingRow>(`select * from bookings where id = $1 for update`, [payment.booking_id]);
      await confirmIfPaid(q, booking);
    }
  });
}

/** Provider webhook path: find the payment by its reference and verify it. */
export async function verifyPaymentByReference(reference: string, status: "VERIFIED" | "FAILED") {
  const db = await getDb();
  const [p] = await db.query<{ id: string; payment_status: string }>(`select id, payment_status from payments where payment_provider_reference = $1`, [reference]);
  if (!p) throw new WorkflowError("Unknown payment reference.");
  if (p.payment_status !== "PENDING") return p.id; // webhooks are retried; stay idempotent
  await setPaymentStatus(p.id, status, "payment_webhook");
  return p.id;
}

export async function paidSoFar(q: Queryable, bookingId: string): Promise<number> {
  const [row] = await q.query<{ paid: number }>(
    `select coalesce(sum(case when payment_type = 'REFUND' then -amount else amount end), 0)::int as paid
       from payments where booking_id = $1 and payment_status = 'VERIFIED'`,
    [bookingId],
  );
  return row.paid;
}

async function confirmIfPaid(q: Queryable, booking: BookingRow) {
  if (booking.status !== "PENDING_DEPOSIT") return;
  if ((await paidSoFar(q, booking.id)) < booking.deposit_amount) return;
  await q.query(`update bookings set status = 'CONFIRMED', confirmed_at = now() where id = $1`, [booking.id]);
  await logEvent(q, "booking", booking.id, "confirmed", "system");
  const [ctx] = await q.query<{ customer: string | null; agency: string }>(
    `select u.phone as customer, a.phone as agency from trips t left join users u on u.id = t.user_id join agencies a on a.id = $2 where t.id = $1`,
    [booking.trip_id, booking.agency_id],
  );
  await notify(q, ctx?.customer, "Your Kashmir booking is confirmed ✓", tripMagicPath(booking.trip_id, "/booking"));
  await notify(q, ctx?.agency, "Deposit verified — booking confirmed.", `/agency/bookings/${booking.id}`);
}

// --------------------------------------------------------------------------- after the trip

export async function completeTrip(tripId: string, actor: string, opts: { force?: boolean } = {}) {
  return tx(async (q) => {
    const [booking] = await q.query<BookingRow & { end_date: string }>(
      `select b.*, t.end_date from bookings b join trips t on t.id = b.trip_id where b.trip_id = $1 and b.status <> 'CANCELLED' for update of b`,
      [tripId],
    );
    if (!booking) throw new WorkflowError("No booking for this trip.");
    if (booking.status !== "CONFIRMED") throw new WorkflowError("Only confirmed bookings can be completed.");
    if (!opts.force && booking.end_date > todayIST()) throw new WorkflowError("You can confirm completion once your trip has ended.");
    await q.query(`update bookings set status = 'COMPLETED', completed_at = now() where id = $1`, [booking.id]);
    await q.query(`update trips set status = 'COMPLETED', updated_at = now() where id = $1`, [tripId]);
    await logEvent(q, "booking", booking.id, "completed", actor);
  });
}

export async function submitReview(tripId: string, rating: number, comment: string) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new WorkflowError("Choose a rating from 1 to 5.");
  return tx(async (q) => {
    const [booking] = await q.query<BookingRow & { user_id: string | null }>(
      `select b.*, t.user_id from bookings b join trips t on t.id = b.trip_id where b.trip_id = $1 and b.status = 'COMPLETED'`,
      [tripId],
    );
    if (!booking) throw new WorkflowError("You can review once your trip is complete.");
    const rows = await q.query<{ id: string }>(
      `insert into reviews (booking_id, user_id, agency_id, rating, comment, verified_trip)
       values ($1, $2, $3, $4, $5, true) on conflict (booking_id) do nothing returning id`,
      [booking.id, booking.user_id, booking.agency_id, rating, comment.trim().slice(0, 2000)],
    );
    if (!rows.length) throw new WorkflowError("You've already reviewed this trip.");
    await logEvent(q, "review", rows[0].id, "created", "tourist", { rating });
  });
}

export async function reportIssue(tripId: string, message: string) {
  const text = message.trim().slice(0, 2000);
  if (!text) throw new WorkflowError("Tell us what went wrong.");
  return tx(async (q) => {
    const [booking] = await q.query<{ id: string }>(`select id from bookings where trip_id = $1 and status <> 'CANCELLED'`, [tripId]);
    const [issue] = await q.query<{ id: string }>(`insert into issues (trip_id, booking_id, message) values ($1, $2, $3) returning id`, [
      tripId,
      booking?.id ?? null,
      text,
    ]);
    await logEvent(q, "issue", issue.id, "reported", "tourist");
  });
}

// --------------------------------------------------------------------------- admin operations

export async function assignLead(tripId: string, agencyId: string) {
  return tx(async (q) => {
    const [trip] = await q.query<TripRow>(`select * from trips where id = $1`, [tripId]);
    if (!trip || trip.status !== "QUOTES_REQUESTED") throw new WorkflowError("Trip is not collecting quotes.");
    const [lead] = await q.query<{ id: string }>(`insert into leads (trip_id, agency_id) values ($1, $2) on conflict do nothing returning id`, [tripId, agencyId]);
    if (!lead) throw new WorkflowError("This agency already has the lead.");
    await logEvent(q, "lead", lead.id, "created", "admin", { agencyId, manual: true });
    const [agency] = await q.query<{ phone: string }>(`select phone from agencies where id = $1`, [agencyId]);
    await notify(q, agency?.phone, `New Kashmir enquiry: ${trip.travellers} travellers, ${trip.start_date} to ${trip.end_date}.`, `/agency/leads/${lead.id}`);
  });
}

/** Admin pulls a lead from a slow agency so the trip can be reassigned. No credit is refunded automatically. */
export async function expireLead(leadId: string, reason: string) {
  return tx(async (q) => {
    const lead = await lockLead(q, leadId, null);
    if (!["NEW", "ACCEPTED"].includes(lead.status)) throw new WorkflowError("Only unanswered or unquoted leads can be pulled.");
    await q.query(`update leads set status = 'EXPIRED' where id = $1`, [leadId]);
    await logEvent(q, "lead", leadId, "expired", "admin", { reason, wasAccepted: lead.status === "ACCEPTED" });
  });
}

export async function cancelBooking(bookingId: string, reason: string) {
  return tx(async (q) => {
    const [b] = await q.query<BookingRow>(`select * from bookings where id = $1 for update`, [bookingId]);
    if (!b || b.status === "CANCELLED" || b.status === "COMPLETED") throw new WorkflowError("Booking can't be cancelled.");
    await q.query(`update bookings set status = 'CANCELLED' where id = $1`, [bookingId]);
    await q.query(`update trips set status = 'CANCELLED', updated_at = now() where id = $1`, [b.trip_id]);
    await logEvent(q, "booking", bookingId, "cancelled", "admin", { reason });
  });
}

export async function addCredits(agencyId: string, credits: number, reason: string) {
  if (!Number.isInteger(credits) || credits === 0) throw new WorkflowError("Enter a whole number of credits.");
  return tx(async (q) => {
    const res = await q.query(`update agencies set lead_credits = lead_credits + $2 where id = $1 and lead_credits + $2 >= 0 returning id`, [agencyId, credits]);
    if (!res.length) throw new WorkflowError("Credits can't go below zero.");
    await q.query(`insert into credit_transactions (agency_id, delta, reason) values ($1, $2, $3)`, [agencyId, credits, reason || "admin_topup"]);
    await logEvent(q, "agency", agencyId, "credits_changed", "admin", { credits, reason });
  });
}
