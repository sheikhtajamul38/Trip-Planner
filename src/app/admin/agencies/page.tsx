import Link from "next/link";
import { StatusBadge } from "@/components/display";
import { listAgencies } from "@/lib/agencies";
import { requireAdmin } from "@/lib/auth";
import { createAgencyAction } from "../actions";
import { ErrorBanner } from "../ErrorBanner";
import { AgencyFields } from "./AgencyFields";

export default async function AgenciesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { error } = await searchParams;
  const agencies = await listAgencies();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Agencies</h1>
      <div className="card overflow-x-auto p-0">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Verification</th>
              <th>Plan</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link className="font-medium text-brand-700" href={`/admin/agencies/${a.id}`}>
                    {a.name}
                  </Link>
                </td>
                <td>{a.phone}</td>
                <td>
                  <StatusBadge status={a.verification_status} />
                </td>
                <td className="text-xs">
                  {a.commission_model}
                  {a.commission_model === "LEAD_FEE" && ` · ${a.lead_credits} credits`}
                </td>
                <td>{a.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card space-y-4">
        <h2 className="text-lg font-bold">Onboard an agency</h2>
        <ErrorBanner error={error} />
        <form action={createAgencyAction} className="space-y-4">
          <AgencyFields />
          <div className="grid gap-3 border-t border-stone-200 pt-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="contactName">Contact person</label>
              <input id="contactName" name="contactName" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="accessCode">Access code (share privately, min 6 chars)</label>
              <input id="accessCode" name="accessCode" required minLength={6} />
            </div>
          </div>
          <p className="text-xs text-stone-500">New agencies start as PENDING and receive no leads until you verify them.</p>
          <button className="btn-primary">Create agency</button>
        </form>
      </section>
    </div>
  );
}
