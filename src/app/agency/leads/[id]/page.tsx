import Link from "next/link";
import { notFound } from "next/navigation";
import { ItineraryDays, StatusBadge } from "@/components/display";
import { getAgency } from "@/lib/agencies";
import { requireAgency } from "@/lib/auth";
import { DESTINATIONS, VEHICLES } from "@/lib/destinations";
import { budgetLabel, fmtDate, fmtDateTime, inr } from "@/lib/format";
import { whatsappLink } from "@/lib/notify";
import { tripDays } from "@/lib/planner";
import { agencyLead } from "@/lib/queries";
import { LeadDecision, QuoteBuilder } from "./LeadClient";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAgency();
  const { id } = await params;
  const data = await agencyLead(id, s.agencyId);
  if (!data) notFound();
  const { lead, trip, customer, quotes, booking } = data;
  const agency = (await getAgency(s.agencyId))!;
  const it = trip.ai_itinerary;
  const days = tripDays(trip.start_date, trip.end_date);
  const vehicle = VEHICLES.find((v) => v.maxPax >= trip.travellers) ?? VEHICLES[VEHICLES.length - 1];
  const canQuote = ["ACCEPTED", "QUOTE_SENT", "CUSTOMER_VIEWED"].includes(lead.status) && trip.status === "QUOTES_REQUESTED";
  const suggestions = [
    ...it.stays
      .filter((st) => st.nights > 0)
      .map((st) => ({ category: "Hotel", label: `${DESTINATIONS[st.destination].name} ${trip.hotel_category}, ${st.nights} night${st.nights > 1 ? "s" : ""}`, amount: "" })),
    { category: "Transport", label: `${vehicle.name}, ${days} days`, amount: "" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Link href="/agency" className="text-sm text-brand-700">
          ← All enquiries
        </Link>
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">
              {trip.travellers} traveller{trip.travellers > 1 ? "s" : ""} · {fmtDate(trip.start_date)} – {fmtDate(trip.end_date)}
            </h1>
            <StatusBadge status={lead.status} />
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-stone-500">Budget</dt>
              <dd className="font-medium">{budgetLabel(trip.budget_min, trip.budget_max)}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Hotel</dt>
              <dd className="font-medium">{trip.hotel_category}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Pace</dt>
              <dd className="font-medium">{trip.activity_level}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Children</dt>
              <dd className="font-medium">{trip.with_kids ? "Yes" : "No"}</dd>
            </div>
          </dl>
          {trip.interests.length > 0 && <p className="text-sm text-stone-600">Interests: {trip.interests.join(", ")}</p>}
          {trip.notes && <p className="rounded bg-stone-50 p-2 text-sm text-stone-700">“{trip.notes}”</p>}
          {lead.revision_note && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">↻ {lead.revision_note} — please send a revised quote.</p>}
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Requested itinerary</h2>
          <ItineraryDays itinerary={it} />
          <p className="mt-3 text-xs text-stone-500">
            Customer was shown an indicative estimate of {inr(it.estimate.min)} – {inr(it.estimate.max)}.
          </p>
        </div>
      </div>

      <aside className="space-y-4">
        {customer && (
          <div className="card space-y-1">
            <h2 className="font-semibold">Customer</h2>
            <p>{customer.name}</p>
            <p className="text-sm text-stone-600">{customer.phone}</p>
            {customer.email && <p className="text-sm text-stone-600">{customer.email}</p>}
            {customer.phone && (
              <a className="btn-secondary mt-2 w-full" target="_blank" rel="noreferrer" href={whatsappLink(customer.phone, `Hi ${customer.name}, this is ${agency.name} about your Kashmir trip.`)}>
                💬 WhatsApp customer
              </a>
            )}
          </div>
        )}

        {lead.status === "NEW" && (
          <div className="card">
            <LeadDecision leadId={lead.id} charged={agency.commission_model === "LEAD_FEE"} />
          </div>
        )}

        {booking && (
          <Link href={`/agency/bookings/${booking.id}`} className="card block border-emerald-300 bg-emerald-50">
            <b>🎉 The customer chose your quote.</b>
            <span className="block text-sm text-brand-700">Open booking →</span>
          </Link>
        )}

        {canQuote && (
          <div className="card space-y-3">
            <h2 className="font-semibold">{quotes.length ? "Send a revised quote" : "Create quote"}</h2>
            <QuoteBuilder leadId={lead.id} suggestions={suggestions} />
          </div>
        )}

        {quotes.length > 0 && (
          <div className="card space-y-2">
            <h2 className="font-semibold">Quotes sent</h2>
            <ul className="space-y-2 text-sm">
              {quotes.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2">
                  <span>
                    <b>{inr(q.amount)}</b> <span className="text-stone-500">· {fmtDateTime(q.created_at)}</span>
                  </span>
                  <StatusBadge status={q.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
