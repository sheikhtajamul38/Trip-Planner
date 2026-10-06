import Link from "next/link";
import { notFound } from "next/navigation";
import { ItineraryDays, StatusBadge } from "@/components/display";
import { listAgencies } from "@/lib/agencies";
import { requireAdmin } from "@/lib/auth";
import { budgetLabel, fmtDate, fmtDateTime, inr } from "@/lib/format";
import { getTripView, paymentSummary, tripEvents } from "@/lib/queries";
import { adminRecordPaymentAction, assignLeadAction, cancelBookingAction, forceCompleteAction, paymentStatusAction } from "../../actions";
import { ErrorBanner } from "../../ErrorBanner";

export default async function AdminTrip({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const view = await getTripView(id);
  if (!view) notFound();
  const { trip, customer, leads, quotes, booking, payments, review, issues } = view;
  const [events, agencies] = await Promise.all([tripEvents(id), listAgencies()]);
  const back = `/admin/trips/${id}`;
  const assignable = agencies.filter((a) => a.active && a.verification_status === "VERIFIED" && !leads.some((l) => l.agency_id === a.id));

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-brand-700">
        ← Overview
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">
          {customer?.name ?? "Anonymous"} · {fmtDate(trip.start_date)} – {fmtDate(trip.end_date)}
        </h1>
        <StatusBadge status={trip.status} />
        <Link href={`/trip/${id}`} className="text-sm text-brand-700">
          Customer view →
        </Link>
      </div>
      <ErrorBanner error={error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="card space-y-1 text-sm">
            <p>
              {trip.travellers} pax{trip.with_kids && " (kids)"} · {budgetLabel(trip.budget_min, trip.budget_max)} · {trip.hotel_category} · {trip.activity_level}
            </p>
            {customer && (
              <p>
                {customer.phone} {customer.email && `· ${customer.email}`}
              </p>
            )}
            {trip.notes && <p className="text-stone-600">“{trip.notes}”</p>}
          </div>

          <div className="card space-y-2">
            <h2 className="font-semibold">Leads</h2>
            <ul className="space-y-1 text-sm">
              {leads.map((l) => (
                <li key={l.id} className="flex justify-between">
                  <span>
                    {l.agency_name} {l.credit_charged && <span className="text-xs text-stone-500">(credit used)</span>}
                  </span>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
            {trip.status === "QUOTES_REQUESTED" && assignable.length > 0 && (
              <form action={assignLeadAction.bind(null, id, back)} className="flex gap-2 pt-2">
                <select name="agencyId" aria-label="Agency" className="min-w-0 flex-1">
                  {assignable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary">Send lead</button>
              </form>
            )}
          </div>

          {quotes.length > 0 && (
            <div className="card space-y-1 text-sm">
              <h2 className="font-semibold">Live quotes</h2>
              {quotes.map((q) => (
                <div key={q.id} className="flex justify-between">
                  <span>
                    {view.profiles.get(q.agency_id)?.name} · {inr(q.amount)}
                  </span>
                  <StatusBadge status={q.status} />
                </div>
              ))}
            </div>
          )}

          {booking && (
            <div className="card space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Booking · {inr(booking.total_amount)}</h2>
                <StatusBadge status={booking.status} />
              </div>
              <p>
                Deposit {inr(booking.deposit_amount)} · verified paid {inr(paymentSummary(booking, payments).paid)}
              </p>
              <ul className="space-y-1">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span>
                      {p.payment_type} {inr(p.amount)} · {p.payment_provider_reference ?? "no ref"} · by {p.recorded_by}
                    </span>
                    {p.payment_status === "PENDING" ? (
                      <span className="flex gap-1">
                        <form action={paymentStatusAction.bind(null, p.id, "VERIFIED", back)}>
                          <button className="btn-primary px-2 py-1 text-xs">Verify</button>
                        </form>
                        <form action={paymentStatusAction.bind(null, p.id, "FAILED", back)}>
                          <button className="btn-danger px-2 py-1 text-xs">Reject</button>
                        </form>
                      </span>
                    ) : (
                      <StatusBadge status={p.payment_status} />
                    )}
                  </li>
                ))}
              </ul>
              {booking.status !== "CANCELLED" && booking.status !== "COMPLETED" && (
                <form action={adminRecordPaymentAction.bind(null, booking.id, back)} className="flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                  <select name="type" aria-label="Type">
                    <option>DEPOSIT</option>
                    <option>BALANCE</option>
                    <option>REFUND</option>
                  </select>
                  <input name="amount" type="number" min={1} required className="w-28" placeholder="Amount" aria-label="Amount" />
                  <input name="reference" className="min-w-0 flex-1" placeholder="Reference" aria-label="Reference" />
                  <button className="btn-secondary">Record verified payment</button>
                </form>
              )}
              <div className="flex flex-wrap gap-2">
                {booking.status === "CONFIRMED" && (
                  <form action={forceCompleteAction.bind(null, id)}>
                    <button className="btn-secondary">Mark trip completed</button>
                  </form>
                )}
                {(booking.status === "PENDING_DEPOSIT" || booking.status === "CONFIRMED") && (
                  <form action={cancelBookingAction.bind(null, booking.id, id)} className="flex gap-2">
                    <input name="reason" placeholder="Cancellation reason" required aria-label="Cancellation reason" />
                    <button className="btn-danger">Cancel booking</button>
                  </form>
                )}
              </div>
              {review && (
                <p>
                  Review: {"★".repeat(review.rating)} {review.comment}
                </p>
              )}
            </div>
          )}

          {issues.length > 0 && (
            <div className="card space-y-1 text-sm">
              <h2 className="font-semibold">Issues</h2>
              {issues.map((i) => (
                <p key={i.id}>
                  <StatusBadge status={i.status} /> {i.message}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-2 font-semibold">Audit trail</h2>
            <ol className="space-y-1 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="w-28 shrink-0 text-stone-500">{fmtDateTime(e.created_at)}</span>
                  <span>
                    <b>
                      {e.entity_type}.{e.event}
                    </b>{" "}
                    <span className="text-stone-500">by {e.actor}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card">
            <ItineraryDays itinerary={trip.ai_itinerary} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
