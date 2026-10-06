import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/display";
import { getAgency } from "@/lib/agencies";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { creditsAction, resetAgencyCodeAction, toggleActiveAction, updateAgencyAction, verificationAction } from "../../actions";
import { ErrorBanner } from "../../ErrorBanner";
import { AgencyFields } from "../AgencyFields";

export default async function AgencyAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const agency = /^[0-9a-f-]{36}$/i.test(id) ? await getAgency(id) : null;
  if (!agency) notFound();
  const credits = await query<{ delta: number; reason: string; created_at: Date }>(
    `select delta, reason, created_at from credit_transactions where agency_id = $1 order by created_at desc limit 20`,
    [id],
  );

  return (
    <div className="space-y-6">
      <Link href="/admin/agencies" className="text-sm text-brand-700">
        ← Agencies
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{agency.name}</h1>
        <StatusBadge status={agency.verification_status} />
        {!agency.active && <span className="badge bg-stone-200 text-stone-700">inactive</span>}
      </div>
      <ErrorBanner error={error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form action={updateAgencyAction.bind(null, id)} className="card space-y-4">
          <h2 className="font-semibold">Profile & matching</h2>
          <AgencyFields agency={agency} />
          <button className="btn-primary">Save</button>
        </form>

        <div className="space-y-4">
          <form action={verificationAction.bind(null, id)} className="card space-y-3">
            <h2 className="font-semibold">Verification</h2>
            <select name="status" defaultValue={agency.verification_status} aria-label="Verification status">
              <option value="PENDING">Pending</option>
              <option value="VERIFIED">Verified</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
            <div className="flex flex-col gap-1">
              <label htmlFor="verifiedItems">What you actually checked (one per line, shown to customers)</label>
              <textarea id="verifiedItems" name="verifiedItems" rows={3} defaultValue={agency.verified_items.join("\n")} placeholder={"J&K Tourism registration\nOffice visited\nGST verified"} />
            </div>
            <button className="btn-secondary">Update verification</button>
          </form>

          <form action={creditsAction.bind(null, id)} className="card space-y-3">
            <h2 className="font-semibold">Lead credits: {agency.lead_credits}</h2>
            <div className="flex gap-2">
              <input name="credits" type="number" required className="w-24" placeholder="+20" aria-label="Credits" />
              <input name="reason" className="min-w-0 flex-1" placeholder="e.g. Paid ₹10,000 — UTR 1234" aria-label="Reason" />
            </div>
            <button className="btn-secondary">Adjust credits</button>
            {credits.length > 0 && (
              <ul className="space-y-0.5 text-xs text-stone-600">
                {credits.map((c, i) => (
                  <li key={i}>
                    {c.delta > 0 ? "+" : ""}
                    {c.delta} · {c.reason} · {fmtDateTime(c.created_at)}
                  </li>
                ))}
              </ul>
            )}
          </form>

          <form action={resetAgencyCodeAction.bind(null, id)} className="card space-y-2">
            <h2 className="font-semibold">Reset access code</h2>
            <p className="text-xs text-stone-500">Signs the agency out everywhere. Share the new code privately.</p>
            <div className="flex gap-2">
              <input name="code" required minLength={10} className="min-w-0 flex-1" placeholder="New code (10+ chars)" aria-label="New access code" />
              <button className="btn-secondary">Reset</button>
            </div>
          </form>

          <form action={toggleActiveAction.bind(null, id, !agency.active)} className="card">
            <button className={agency.active ? "btn-danger w-full" : "btn-secondary w-full"}>{agency.active ? "Deactivate agency" : "Reactivate agency"}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
