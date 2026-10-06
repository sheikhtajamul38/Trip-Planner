import { todayIST } from "@/lib/format";
import { TrackVisit } from "@/components/Track";
import { PlannerForm } from "./PlannerForm";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <TrackVisit />
      <section className="space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">The easiest way to plan and book a Kashmir trip</p>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">Plan your Kashmir trip with AI</h1>
        <p className="text-stone-600">
          Tell us your dates, budget and what you want to experience. Get a personalised Kashmir itinerary and budget estimate in under a minute —
          then compare quotes from verified local travel operators. No obligation.
        </p>
      </section>
      <PlannerForm today={todayIST()} />
      <ul className="grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
        <li className="card p-4">
          <b className="block text-stone-900">1. Plan with AI</b>A personalised itinerary and budget, free.
        </li>
        <li className="card p-4">
          <b className="block text-stone-900">2. Compare local operators</b>2–3 verified operators price your exact trip.
        </li>
        <li className="card p-4">
          <b className="block text-stone-900">3. Book with confidence</b>Booking, payments and support tracked in one place.
        </li>
      </ul>
    </div>
  );
}
