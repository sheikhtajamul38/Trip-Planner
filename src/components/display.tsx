import { DESTINATIONS } from "@/lib/destinations";
import { fmtDate, inr } from "@/lib/format";
import type { Itinerary } from "@/lib/planner";

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-stone-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-saffron-500/15 text-amber-800",
  ACCEPTED: "bg-sky-100 text-sky-800",
  QUOTE_SENT: "bg-indigo-100 text-indigo-800",
  CUSTOMER_VIEWED: "bg-violet-100 text-violet-800",
  SELECTED: "bg-emerald-100 text-emerald-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  VERIFIED: "bg-emerald-100 text-emerald-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  BOOKED: "bg-emerald-100 text-emerald-800",
  PENDING_DEPOSIT: "bg-amber-100 text-amber-800",
  PENDING: "bg-amber-100 text-amber-800",
  QUOTES_REQUESTED: "bg-sky-100 text-sky-800",
  LOST: "bg-stone-200 text-stone-600",
  EXPIRED: "bg-stone-200 text-stone-600",
  DECLINED: "bg-stone-200 text-stone-600",
  CANCELLED: "bg-red-100 text-red-700",
  FAILED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-red-100 text-red-700",
  OPEN: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_STYLES[status] ?? "bg-stone-100 text-stone-700"}`}>{status.replaceAll("_", " ").toLowerCase()}</span>;
}

export function VerifiedBadge({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="badge bg-emerald-100 text-emerald-800">✓ Platform verified</span>
      {items.map((i) => (
        <span key={i} className="badge bg-stone-100 text-stone-600">
          {i}
        </span>
      ))}
    </div>
  );
}

export function ItineraryDays({ itinerary, compact = false }: { itinerary: Itinerary; compact?: boolean }) {
  return (
    <ol className="space-y-3">
      {itinerary.days.map((d) => (
        <li key={d.day} className="flex gap-3">
          <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-brand-50 py-2 text-brand-700">
            <span className="text-[10px] font-semibold uppercase">Day</span>
            <span className="text-lg font-bold leading-none">{d.day}</span>
          </div>
          <div className="min-w-0 flex-1 border-b border-stone-100 pb-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <h3 className="font-semibold">{d.title}</h3>
              <span className="text-xs text-stone-500">
                {fmtDate(d.date)} · stay: {DESTINATIONS[d.base].name}
              </span>
            </div>
            {d.travel && <p className="mt-0.5 text-sm text-brand-700">🚗 {d.travel}</p>}
            {!compact && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-stone-700">
                {d.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function BudgetCard({ itinerary }: { itinerary: Itinerary }) {
  const e = itinerary.estimate;
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Indicative trip estimate</div>
      <div className="mt-1 text-2xl font-bold">
        {inr(e.min)} – {inr(e.max)}
      </div>
      <p className="mt-1 text-xs text-stone-500">Final price depends on dates, hotel availability and the operator&apos;s quote.</p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-brand-700">How we estimated this</summary>
        <ul className="mt-2 space-y-1">
          {e.breakdown.map((b) => (
            <li key={b.label} className="flex justify-between gap-2">
              <span className="text-stone-600">{b.label}</span>
              <span className="font-medium">{inr(b.amount)}</span>
            </li>
          ))}
        </ul>
        <ul className="mt-2 list-disc pl-5 text-xs text-stone-500">
          {e.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
