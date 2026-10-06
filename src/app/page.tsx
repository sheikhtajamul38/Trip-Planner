import { todayIST } from "@/lib/format";
import { PlannerForm } from "./PlannerForm";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">Plan your Kashmir trip</h1>
        <p className="text-stone-600">
          Get a free day-by-day plan with an honest budget estimate. When you&apos;re ready, compare quotes from 2–3 verified local operators — no
          obligation.
        </p>
      </section>
      <PlannerForm today={todayIST()} />
      <ul className="grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
        <li className="card p-4">
          <b className="block text-stone-900">1. Plan</b>A personalised itinerary in seconds, free.
        </li>
        <li className="card p-4">
          <b className="block text-stone-900">2. Compare</b>Verified operators price your exact trip.
        </li>
        <li className="card p-4">
          <b className="block text-stone-900">3. Travel</b>Track your booking, payments and support in one place.
        </li>
      </ul>
    </div>
  );
}
