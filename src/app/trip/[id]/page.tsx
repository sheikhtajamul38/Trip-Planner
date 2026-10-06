import Link from "next/link";
import { notFound } from "next/navigation";
import { BudgetCard, ItineraryDays } from "@/components/display";
import { aiAvailable } from "@/lib/ai";
import { getTrip, getTripMessages } from "@/lib/trips";
import { AskAI, EditItinerary, RequestQuotes } from "./TripClient";

export const dynamic = "force-dynamic";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await getTrip(id);
  if (!trip) notFound();
  const messages = await getTripMessages(id);
  const it = trip.ai_itinerary;
  const locked = trip.status === "BOOKED" || trip.status === "COMPLETED";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{it.generatedBy === "ai" ? "AI trip plan" : "Your trip plan"}</p>
          <h1 className="text-2xl font-bold sm:text-3xl">{it.title}</h1>
          <p className="text-stone-600">{it.summary}</p>
        </header>

        <section className="card">
          <ItineraryDays itinerary={it} />
        </section>

        {it.notes.length > 0 && (
          <section className="card bg-amber-50/50">
            <h2 className="mb-2 font-semibold">Good to know</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
              {it.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        )}

        {!locked && (
          <section className="card space-y-2">
            <h2 className="font-semibold">Change itinerary</h2>
            <EditItinerary tripId={id} />
          </section>
        )}

        <section className="card space-y-2">
          <h2 className="font-semibold">Ask anything about this trip</h2>
          {!aiAvailable() && <p className="text-xs text-stone-500">AI answers are limited in this demo — basic answers only.</p>}
          <AskAI tripId={id} initial={messages.map(({ role, content }) => ({ role, content }))} />
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <BudgetCard itinerary={it} />
        <div className="card space-y-3">
          {trip.status === "PLANNED" ? (
            <>
              <h2 className="text-lg font-bold">Get real quotes</h2>
              <p className="text-sm text-stone-600">Would you like verified local operators to price this exact trip?</p>
              <RequestQuotes tripId={id} />
            </>
          ) : trip.status === "QUOTES_REQUESTED" ? (
            <>
              <h2 className="text-lg font-bold">Quotes requested ✓</h2>
              <p className="text-sm text-stone-600">Operators are pricing your trip. We&apos;ll message you on WhatsApp when quotes arrive.</p>
              <Link href={`/trip/${id}/quotes`} className="btn-primary w-full">
                View quotes
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold">Your booking</h2>
              <Link href={`/trip/${id}/booking`} className="btn-primary w-full">
                Open trip dashboard
              </Link>
            </>
          )}
        </div>
        <p className="px-1 text-xs text-stone-500">
          Bookmark this page — it&apos;s your private link to this trip.
        </p>
      </aside>
    </div>
  );
}
