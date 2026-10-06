import Link from "next/link";
import { Stat, StatusBadge } from "@/components/display";
import { listAgencies } from "@/lib/agencies";
import { requireAdmin } from "@/lib/auth";
import { budgetLabel, fmtDate, fmtDateTime, inr, inrShort, todayIST } from "@/lib/format";
import { query } from "@/lib/db";
import { PRICING_META } from "@/lib/destinations";
import { LEAD_RESPONSE_HOURS, QUOTE_DUE_HOURS, expireStaleLeads } from "@/lib/marketplace";
import { pruneRateLimits } from "@/lib/ratelimit";
import { whatsappLink } from "@/lib/notify";
import { adminMetrics, adminQueues, funnel as funnelSteps, overdueLeads } from "@/lib/queries";
import { assignLeadAction, expireLeadAction, notificationSentAction, paymentStatusAction, resolveIssueAction } from "./actions";
import { ErrorBanner } from "./ErrorBanner";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ range?: string; error?: string }> }) {
  await requireAdmin();
  const { range, error } = await searchParams;
  await expireStaleLeads();
  const since = range === "all" ? "1970-01-01" : todayIST().slice(0, 8) + "01";
  const [{ funnel, agencies, destinations }, queues, allAgencies, steps, overdue, [{ used: creditsUsed }]] = await Promise.all([
    adminMetrics(since),
    adminQueues(),
    listAgencies(),
    funnelSteps(since),
    overdueLeads(LEAD_RESPONSE_HOURS, QUOTE_DUE_HOURS),
    query<{ used: number }>(`select coalesce(-sum(delta), 0)::int as used from credit_transactions where delta < 0 and created_at >= $1`, [since]),
    pruneRateLimits(),
  ]);
  const assignable = allAgencies.filter((a) => a.active && a.verification_status === "VERIFIED");
  const rate = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <div className="space-y-8">
      <ErrorBanner error={error} />
      {PRICING_META.status === "draft" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Budget estimates use draft pricing ({PRICING_META.source}). Collect real rates with <code>docs/pricing-survey.md</code> before launch.
        </p>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Funnel · {range === "all" ? "all time" : "this month"}</h1>
          <Link href={range === "all" ? "/admin" : "/admin?range=all"} className="text-sm text-brand-700">
            {range === "all" ? "Show this month" : "Show all time"}
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="card overflow-x-auto p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th className="text-right">Count</th>
                  <th className="text-right">From previous</th>
                  <th className="hidden sm:table-cell">Share of trips</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((st, i) => {
                  const prev = steps[i - 1]?.count;
                  const trips = steps.find((x) => x.key === "trips")!.count;
                  const share = i >= 2 && trips ? st.count / trips : null;
                  return (
                    <tr key={st.key}>
                      <td>{st.label}</td>
                      <td className="text-right font-semibold">{st.count}</td>
                      <td className="text-right text-stone-500">{i === 0 ? "" : rate(st.count, prev)}</td>
                      <td className="hidden sm:table-cell">
                        {share != null && <div className="h-2 rounded bg-brand-500" style={{ width: `${Math.max(share * 100, 1)}%` }} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-3">
            <Stat label="Booked value" value={inrShort(funnel.confirmed_value)} hint="confirmed + completed bookings" />
            <Stat label="Lead credits used" value={creditsUsed} hint="accepted leads on paid plans" />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Missed response targets ({overdue.length})</h2>
        <p className="text-sm text-stone-500">
          New leads unanswered after {LEAD_RESPONSE_HOURS}h, or accepted but unquoted after {QUOTE_DUE_HOURS}h. Pull the lead, then send the trip to another
          operator from &ldquo;Needs matching&rdquo;.
        </p>
        {overdue.map((l) => (
          <div key={l.id} className="card flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <b>{l.agency_name}</b> · <StatusBadge status={l.status} /> since {fmtDateTime(l.accepted_at ?? l.created_at)}
              <div className="text-stone-500">
                <Link className="text-brand-700" href={`/admin/trips/${l.trip_id}`}>
                  {l.customer_name ?? "trip"}
                </Link>
              </div>
            </div>
            <form action={expireLeadAction.bind(null, l.id)}>
              <button className="btn-secondary">Pull lead</button>
            </form>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Needs matching ({queues.unmatched.length})</h2>
        <p className="text-sm text-stone-500">Customers waiting on quotes with fewer than two live operators.</p>
        {queues.unmatched.map((t) => (
          <div key={t.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <Link href={`/admin/trips/${t.id}`} className="font-semibold text-brand-700">
                {t.customer_name} · {t.travellers} pax · {fmtDate(t.start_date)}
              </Link>
              <div className="text-stone-500">
                {budgetLabel(t.budget_min, t.budget_max)} · {t.live_leads} live lead{t.live_leads === 1 ? "" : "s"}
              </div>
            </div>
            <form action={assignLeadAction.bind(null, t.id, "/admin")} className="flex gap-2">
              <select name="agencyId" required aria-label="Agency">
                {assignable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button className="btn-secondary">Send lead</button>
            </form>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Payments to verify ({queues.pendingPayments.length})</h2>
        {queues.pendingPayments.map((p) => (
          <div key={p.id} className="card flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <b>{inr(p.amount)}</b> {p.payment_type.toLowerCase()} via {p.agency_name} · ref <code>{p.payment_provider_reference ?? "—"}</code>
              <div className="text-stone-500">
                Recorded {fmtDateTime(p.created_at)} ·{" "}
                <Link className="text-brand-700" href={`/admin/trips/${p.trip_id}`}>
                  trip
                </Link>
              </div>
            </div>
            <div className="flex gap-2">
              <form action={paymentStatusAction.bind(null, p.id, "VERIFIED", "/admin")}>
                <button className="btn-primary">Verify</button>
              </form>
              <form action={paymentStatusAction.bind(null, p.id, "FAILED", "/admin")}>
                <button className="btn-danger">Reject</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Open issues ({queues.openIssues.length})</h2>
        {queues.openIssues.map((i) => (
          <div key={i.id} className="card flex flex-wrap items-start justify-between gap-3 text-sm">
            <div>
              <p>{i.message}</p>
              <p className="text-stone-500">
                {i.agency_name ?? "No operator yet"} · {i.customer_phone} · {fmtDateTime(i.created_at)} ·{" "}
                <Link className="text-brand-700" href={`/admin/trips/${i.trip_id}`}>
                  trip
                </Link>
              </p>
            </div>
            <form action={resolveIssueAction.bind(null, i.id, "/admin")}>
              <button className="btn-secondary">Mark resolved</button>
            </form>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Agency performance</h2>
        <div className="card overflow-x-auto p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Agency</th>
                <th>Leads</th>
                <th>Accepted</th>
                <th>Quoted</th>
                <th>Bookings</th>
                <th>Completed</th>
                <th>Conversion</th>
                <th>Rating</th>
                <th>Issues</th>
                <th>Plan</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/admin/agencies/${a.id}`} className="font-medium text-brand-700">
                      {a.name}
                    </Link>{" "}
                    {a.verification_status !== "VERIFIED" && <StatusBadge status={a.verification_status} />}
                  </td>
                  <td>{a.leads}</td>
                  <td>{a.accepted}</td>
                  <td>{a.quotes}</td>
                  <td>{a.bookings}</td>
                  <td>{a.completed}</td>
                  <td>{rate(a.bookings, a.leads)}</td>
                  <td>{a.avg_rating != null ? `${a.avg_rating.toFixed(1)} (${a.reviews})` : "—"}</td>
                  <td className={a.issues ? "font-semibold text-red-700" : ""}>{a.issues}</td>
                  <td className="text-xs">
                    {a.commission_model}
                    {a.commission_model === "LEAD_FEE" && ` · ${a.lead_credits} cr`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Popular destinations</h2>
          <div className="card space-y-1 text-sm">
            {destinations.length === 0 && <p className="text-stone-500">No trips yet.</p>}
            {destinations.map((d) => (
              <div key={d.destination} className="flex items-center gap-2">
                <span className="w-28">{d.name}</span>
                <div className="h-2 rounded bg-brand-500" style={{ width: `${(d.trips / Math.max(funnel.trips, 1)) * 60}%` }} />
                <span className="text-stone-500">{d.trips}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold">WhatsApp outbox ({queues.outbox.length})</h2>
          <p className="text-sm text-stone-500">Send by hand until the WhatsApp Business integration is live.</p>
          <div className="space-y-2">
            {queues.outbox.map((n) => (
              <div key={n.id} className="card flex items-start justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{n.recipient}</div>
                  <div className="text-stone-600">{n.message}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <a className="btn-secondary px-2 py-1 text-xs" target="_blank" rel="noreferrer" href={whatsappLink(n.recipient, `${n.message}${n.link ? " " + n.link : ""}`)}>
                    Open
                  </a>
                  <form action={notificationSentAction.bind(null, n.id)}>
                    <button className="btn-secondary px-2 py-1 text-xs">Sent ✓</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Recent trips</h2>
        <div className="card overflow-x-auto p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Customer</th>
                <th>Dates</th>
                <th>Route</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {queues.recentTrips.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/admin/trips/${t.id}`} className="text-brand-700">
                      {fmtDateTime(t.created_at)}
                    </Link>
                  </td>
                  <td>{t.customer_name ?? <span className="text-stone-400">anonymous</span>}</td>
                  <td>
                    {fmtDate(t.start_date)} · {t.travellers} pax
                  </td>
                  <td className="text-xs">{t.ai_itinerary.summary.split(" for ")[0]}</td>
                  <td>
                    <StatusBadge status={t.booking_status ?? t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
