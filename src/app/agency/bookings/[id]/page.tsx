import Link from "next/link";
import { notFound } from "next/navigation";
import { ItineraryDays, StatusBadge } from "@/components/display";
import { requireAgency } from "@/lib/auth";
import { fmtDate, inr } from "@/lib/format";
import { whatsappLink } from "@/lib/notify";
import { agencyBooking, paymentSummary } from "@/lib/queries";
import { RecordPayment } from "./RecordPayment";

export default async function AgencyBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAgency();
  const { id } = await params;
  const data = await agencyBooking(id, s.agencyId);
  if (!data) notFound();
  const { booking, trip, customer, payments, quote, leadId } = data;
  const money = paymentSummary(booking, payments);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Link href="/agency/bookings" className="text-sm text-brand-700">
          ← All bookings
        </Link>
        <div className="card flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">
            {fmtDate(trip.start_date)} – {fmtDate(trip.end_date)} · {trip.travellers} pax
          </h1>
          <StatusBadge status={booking.status} />
        </div>
        <div className="card">
          <ItineraryDays itinerary={trip.ai_itinerary} />
        </div>
        {quote && (
          <div className="card space-y-1 text-sm">
            <h2 className="font-semibold">Accepted quote · {inr(quote.amount)}</h2>
            <ul>
              {quote.details.lineItems.map((l, i) => (
                <li key={i} className="flex justify-between">
                  <span>
                    {l.category}: {l.label}
                  </span>
                  <span>{inr(l.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between text-stone-500">
                <span>Markup</span>
                <span>{inr(quote.details.markup)}</span>
              </li>
            </ul>
            {leadId && (
              <Link href={`/agency/leads/${leadId}`} className="text-brand-700">
                View enquiry →
              </Link>
            )}
          </div>
        )}
      </div>
      <aside className="space-y-4">
        {customer && (
          <div className="card space-y-1">
            <h2 className="font-semibold">Customer</h2>
            <p>{customer.name}</p>
            <p className="text-sm text-stone-600">{customer.phone}</p>
            {customer.phone && (
              <a className="btn-secondary mt-2 w-full" target="_blank" rel="noreferrer" href={whatsappLink(customer.phone, `Hi ${customer.name}, thanks for booking your Kashmir trip with us!`)}>
                💬 WhatsApp customer
              </a>
            )}
          </div>
        )}
        <div className="card space-y-2 text-sm">
          <h2 className="font-semibold">Payments</h2>
          <div className="flex justify-between">
            <span>Deposit required</span>
            <b>{inr(booking.deposit_amount)}</b>
          </div>
          <div className="flex justify-between">
            <span>Verified paid</span>
            <b>{inr(money.paid)}</b>
          </div>
          <div className="flex justify-between">
            <span>Balance</span>
            <b>{inr(money.balance)}</b>
          </div>
          <ul className="space-y-1 border-t border-stone-100 pt-2">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span>
                  {p.payment_type.toLowerCase()} {inr(p.amount)}
                  {p.payment_provider_reference && <span className="text-stone-500"> · {p.payment_provider_reference}</span>}
                </span>
                <StatusBadge status={p.payment_status} />
              </li>
            ))}
          </ul>
        </div>
        {(booking.status === "PENDING_DEPOSIT" || booking.status === "CONFIRMED") && (
          <div className="card space-y-2">
            <h2 className="font-semibold">Record a payment received</h2>
            <RecordPayment bookingId={booking.id} defaultAmount={booking.status === "PENDING_DEPOSIT" ? booking.deposit_amount : money.balance} />
          </div>
        )}
      </aside>
    </div>
  );
}
