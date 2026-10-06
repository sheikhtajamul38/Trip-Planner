import Link from "next/link";
import { Stat, StatusBadge } from "@/components/display";
import { listAgencies } from "@/lib/agencies";
import { requireAdmin } from "@/lib/auth";
import { budgetLabel, fmtDate, fmtDateTime, inr, inrShort, todayIST } from "@/lib/format";
import { expireStaleLeads } from "@/lib/marketplace";
import { whatsappLink } from "@/lib/notify";
import { adminMetrics, adminQueues } from "@/lib/queries";
import { assignLeadAction, notificationSentAction, paymentStatusAction, resolveIssueAction } from "./actions";
import { ErrorBanner } from "./ErrorBanner";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ range?: string; error?: string }> }) {
  await requireAdmin();
  const { range, error } = await searchParams;
  await expireStaleLeads();
  const since = range === "all" ? "1970-01-01" : todayIST().slice(0, 8) + "01";
  const [{ funnel, agencies, destinations }, queues, allAgencies] = await Promise.all([adminMetrics(since), adminQueues(), listAgencies()]);
  const assignable = allAgencies.filter((a) => a.active && a.verification_status === "VERIFIED");
  const rate = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <div className="space-y-8">
      <ErrorBanner error={error} />
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{range === "all" ? "All time" : "This month"}</h1>
          <Link href={range === "all" ? "/admin" : "/admin?range=all"} className="text-sm text-brand-700">
            {range === "all" ? "Show this month" : "Show all time"}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat label="Trips planned" value={funnel.trips} />
          <Stat label="Qualified leads" value={funnel.qualified} hint={`${rate(funnel.qualified, funnel.trips)} of trips`} />
          <Stat label="Quotes" value={funnel.quotes} />
          <Stat label="Bookings" value={funnel.bookings} hint={`${rate(funnel.bookings, funnel.qualified)} of leads`} />
          <Stat label="Completed" value={funnel.completed} />
          <Stat label="Booked value" value={inrShort(funnel.confirmed_value)} hint="confirmed + completed" />
        </div>
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
