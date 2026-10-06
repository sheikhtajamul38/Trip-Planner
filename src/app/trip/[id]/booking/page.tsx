import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StatusBadge, VerifiedBadge } from "@/components/display";
import { DESTINATIONS } from "@/lib/destinations";
import { fmtDate, inr, todayIST } from "@/lib/format";
import { whatsappLink } from "@/lib/notify";
import { getTripView, paymentSummary } from "@/lib/queries";
import { CompleteTrip, ReportIssue, ReviewForm } from "./BookingClient";

export const dynamic = "force-dynamic";

const STATUS_TEXT = {
  PENDING_DEPOSIT: "Awaiting deposit",
  CONFIRMED: "Booking confirmed ✓",
  COMPLETED: "Trip completed ✓",
  CANCELLED: "Cancelled",
} as const;

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getTripView(id);
  if (!view) notFound();
  const { trip, booking, payments, profiles, review, issues } = view;
  if (!booking) redirect(trip.status === "PLANNED" ? `/trip/${id}` : `/trip/${id}/quotes`);

  const agency = profiles.get(booking.agency_id)!;
  const money = paymentSummary(booking, payments);
  const ended = trip.end_date <= todayIST();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">My Kashmir trip</h1>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-stone-500">Operator</div>
            <div className="text-lg font-bold">{agency.name}</div>
            {agency.verified && <VerifiedBadge items={agency.verifiedItems} />}
          </div>
          <div className="text-right">
            <div className="text-sm text-stone-500">Status</div>
            <div className="text-lg font-bold">{STATUS_TEXT[booking.status]}</div>
          </div>
        </div>
      </header>

      {booking.status === "PENDING_DEPOSIT" && (
        <div className="card border-amber-200 bg-amber-50 text-sm">
          <p className="font-semibold">Next step: pay your {inr(booking.deposit_amount)} deposit</p>
          <p className="mt-1 text-stone-700">
            {agency.name} will share payment details with you on WhatsApp. Your booking is confirmed here once the platform verifies the deposit — only
            pay through the details your operator sends, and keep the transaction reference.
          </p>
        </div>
      )}

      <section className="card">
        <h2 className="mb-3 font-semibold">Itinerary</h2>
        <ul className="divide-y divide-stone-100 text-sm">
          {trip.ai_itinerary.days.map((d) => (
            <li key={d.day} className="flex justify-between gap-3 py-2">
              <span className="w-24 shrink-0 text-stone-500">{fmtDate(d.date).replace(/ \d{4}$/, "")}</span>
              <span className="flex-1 font-medium">{d.title}</span>
              <span className="text-stone-500">{DESTINATIONS[d.base].name}</span>
            </li>
          ))}
        </ul>
        <Link href={`/trip/${id}`} className="mt-3 inline-block text-sm text-brand-700">
          View full itinerary →
        </Link>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Payment details</h2>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-stone-500">Booking amount</dt>
            <dd className="text-lg font-bold">{inr(booking.total_amount)}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Paid (verified)</dt>
            <dd className="text-lg font-bold">{inr(money.paid)}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Balance</dt>
            <dd className="text-lg font-bold">{inr(money.balance)}</dd>
          </div>
        </dl>
        {payments.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span>
                  {p.payment_type.toLowerCase()} · {fmtDate(p.created_at)}
                  {p.payment_provider_reference && <span className="text-stone-500"> · ref {p.payment_provider_reference}</span>}
                </span>
                <span className="flex items-center gap-2">
                  {inr(p.amount)} <StatusBadge status={p.payment_status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-wrap gap-2">
        <a
          className="btn-primary"
          href={whatsappLink(agency.phone, `Hi ${agency.name}, this is about my Kashmir trip (${fmtDate(trip.start_date)} – ${fmtDate(trip.end_date)}).`)}
          target="_blank"
          rel="noreferrer"
        >
          💬 Message operator
        </a>
        <Link href={`/trip/${id}`} className="btn-secondary">
          View itinerary
        </Link>
      </section>

      {booking.status === "CONFIRMED" && ended && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Did your trip go ahead as planned?</h2>
          <p className="text-sm text-stone-600">Confirming helps us keep operator records honest, and lets you leave a verified review.</p>
          <CompleteTrip tripId={id} />
        </section>
      )}

      {booking.status === "COMPLETED" && (
        <section className="card space-y-2">
          <h2 className="font-semibold">{review ? "Your review" : `Review ${agency.name}`}</h2>
          {review ? (
            <p className="text-sm">
              <span className="text-amber-500">{"★".repeat(review.rating)}</span> {review.comment}
            </p>
          ) : (
            <ReviewForm tripId={id} />
          )}
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="font-semibold">Need help?</h2>
        {issues.length > 0 && (
          <ul className="space-y-1 text-sm">
            {issues.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-2">
                <span className="text-stone-700">{i.message}</span>
                <StatusBadge status={i.status} />
              </li>
            ))}
          </ul>
        )}
        <ReportIssue tripId={id} />
      </section>
    </div>
  );
}
