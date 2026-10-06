import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { VerifiedBadge } from "@/components/display";
import { fmtDate, inr } from "@/lib/format";
import { markQuotesViewed } from "@/lib/marketplace";
import { getTripView } from "@/lib/queries";
import { SelectQuote } from "./SelectQuote";

export const dynamic = "force-dynamic";

function responseLabel(minutes: number) {
  if (minutes < 60) return `~${minutes} min`;
  if (minutes < 60 * 24) return `~${Math.round(minutes / 60)} h`;
  return `~${Math.round(minutes / 1440)} days`;
}

export default async function QuotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let view = await getTripView(id);
  if (!view) notFound();
  if (view.trip.status === "PLANNED") redirect(`/trip/${id}`);
  if (view.booking) redirect(`/trip/${id}/booking`);
  if (view.quotes.some((q) => q.status === "SENT")) {
    await markQuotesViewed(id);
    view = (await getTripView(id))!;
  }

  const { trip, quotes, leads, profiles } = view;
  const waiting = leads.filter((l) => ["NEW", "ACCEPTED"].includes(l.status)).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link href={`/trip/${id}`} className="text-sm text-brand-700">
          ← Back to itinerary
        </Link>
        <h1 className="text-2xl font-bold sm:text-3xl">Your Kashmir quotes</h1>
        <p className="text-stone-600">
          {trip.ai_itinerary.summary} Quotes are for this exact itinerary.
        </p>
      </header>

      {quotes.length === 0 && (
        <div className="card text-center">
          <p className="text-lg font-semibold">Operators are pricing your trip</p>
          <p className="mt-1 text-sm text-stone-600">
            {leads.length
              ? `We've sent your trip to ${leads.length} verified operator${leads.length > 1 ? "s" : ""}. You'll get a WhatsApp message as soon as a quote arrives.`
              : "We're finding the right operators for your trip and will message you on WhatsApp shortly."}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {quotes.map((q, idx) => {
          const p = profiles.get(q.agency_id)!;
          const categories = new Map<string, string[]>();
          for (const l of q.details.lineItems) categories.set(l.category, [...(categories.get(l.category) ?? []), l.label]);
          return (
            <article key={q.id} className={`card flex flex-col gap-3 ${idx === 0 && quotes.length > 1 ? "ring-2 ring-brand-500" : ""}`}>
              {p.verified && <VerifiedBadge items={p.verifiedItems} />}
              <div>
                <h2 className="text-lg font-bold">{p.name}</h2>
                {p.description && <p className="text-sm text-stone-600">{p.description}</p>}
              </div>
              <div className="text-3xl font-bold">{inr(q.amount)}</div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {p.avgRating != null && (
                  <div>
                    <dt className="text-stone-500">Rating</dt>
                    <dd className="font-semibold">
                      {p.avgRating.toFixed(1)} ★ <span className="font-normal text-stone-500">({p.reviewCount} verified)</span>
                    </dd>
                  </div>
                )}
                {p.completedTrips > 0 && (
                  <div>
                    <dt className="text-stone-500">Trips via platform</dt>
                    <dd className="font-semibold">{p.completedTrips} completed</dd>
                  </div>
                )}
                {p.avgResponseMinutes != null && (
                  <div>
                    <dt className="text-stone-500">Typical response</dt>
                    <dd className="font-semibold">{responseLabel(p.avgResponseMinutes)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-stone-500">Valid until</dt>
                  <dd className="font-semibold">{fmtDate(q.valid_until)}</dd>
                </div>
              </dl>
              {q.customer_summary && <p className="text-sm text-stone-700">{q.customer_summary}</p>}
              <details className="text-sm">
                <summary className="cursor-pointer text-brand-700">View quote</summary>
                <ul className="mt-2 space-y-1">
                  {[...categories].map(([c, labels]) => (
                    <li key={c}>
                      <b>{c}:</b> {labels.join(", ")}
                    </li>
                  ))}
                </ul>
                {q.details.inclusions && <p className="mt-2"><b>Includes:</b> {q.details.inclusions}</p>}
                {q.details.exclusions && <p className="mt-1"><b>Excludes:</b> {q.details.exclusions}</p>}
                {q.details.notes && <p className="mt-1 text-stone-600">{q.details.notes}</p>}
              </details>
              <div className="mt-auto">
                <SelectQuote tripId={id} quoteId={q.id} agencyName={p.name} />
              </div>
            </article>
          );
        })}
      </div>

      {quotes.length > 0 && waiting > 0 && (
        <p className="text-center text-sm text-stone-500">
          {waiting} more operator{waiting > 1 ? "s are" : " is"} still preparing a quote.
        </p>
      )}
    </div>
  );
}
