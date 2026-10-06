import Link from "next/link";
import { Stat, StatusBadge } from "@/components/display";
import { requireAgency } from "@/lib/auth";
import { DESTINATIONS } from "@/lib/destinations";
import { budgetLabel, fmtDate, inr, inrShort } from "@/lib/format";
import { expireStaleLeads } from "@/lib/marketplace";
import { agencyDashboard } from "@/lib/queries";

export default async function AgencyDashboard() {
  const s = await requireAgency();
  await expireStaleLeads();
  const { counts, leads } = await agencyDashboard(s.agencyId);
  const open = leads.filter((l) => ["NEW", "ACCEPTED", "QUOTE_SENT", "CUSTOMER_VIEWED"].includes(l.status));
  const closed = leads.filter((l) => !open.includes(l));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="New leads" value={counts.new_leads} />
        <Stat label="Quotes pending" value={counts.quotes_pending} hint="accepted, not yet quoted" />
        <Stat label="Bookings" value={counts.bookings} />
        <Stat label="Revenue pipeline" value={inrShort(counts.pipeline)} hint="open quotes + bookings" />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Enquiries</h2>
        {open.length === 0 && <p className="card text-sm text-stone-600">No open enquiries right now. New ones arrive on WhatsApp too.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {open.map((l) => (
            <Link key={l.id} href={`/agency/leads/${l.id}`} className="card block space-y-2 transition hover:border-brand-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">{l.status === "NEW" ? "New enquiry" : "Enquiry"}</span>
                <StatusBadge status={l.status} />
              </div>
              <div className="text-lg font-semibold">
                {l.travellers} traveller{l.travellers > 1 ? "s" : ""}
                {l.with_kids && " (with kids)"} · {fmtDate(l.start_date).replace(/ \d{4}$/, "")} – {fmtDate(l.end_date)}
              </div>
              <div className="text-sm text-stone-600">
                Budget: {budgetLabel(l.budget_min, l.budget_max)} · Hotel: {l.hotel_category}
              </div>
              <div className="text-sm text-stone-600">{l.route.map((d) => DESTINATIONS[d]?.name ?? d).join(" + ")}</div>
              {l.revision_note && <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">↻ {l.revision_note}</p>}
              {l.latest_quote != null && <div className="text-sm">Your quote: <b>{inr(l.latest_quote)}</b></div>}
              <span className="inline-block text-sm font-semibold text-brand-700">
                {l.status === "NEW" ? "View & accept →" : l.status === "ACCEPTED" ? "Create quote →" : "View →"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {closed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">History</h2>
          <div className="card overflow-x-auto p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dates</th>
                  <th>Travellers</th>
                  <th>Quote</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/agency/leads/${l.id}`} className="text-brand-700">
                        {fmtDate(l.start_date)}
                      </Link>
                    </td>
                    <td>{l.travellers}</td>
                    <td>{inr(l.latest_quote)}</td>
                    <td>
                      <StatusBadge status={l.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
