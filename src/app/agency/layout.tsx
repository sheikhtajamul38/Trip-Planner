import Link from "next/link";
import { getAgency } from "@/lib/agencies";
import { getSession } from "@/lib/auth";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const agency = session?.kind === "agency" ? await getAgency(session.agencyId) : null;
  return (
    <div className="space-y-6">
      {agency && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-900 px-4 py-3 text-white">
          <div className="flex items-center gap-4">
            <span className="font-bold uppercase tracking-wide">{agency.name}</span>
            <Link href="/agency" className="text-sm text-brand-100 hover:text-white">
              Leads
            </Link>
            <Link href="/agency/bookings" className="text-sm text-brand-100 hover:text-white">
              Bookings
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm text-brand-100">
            {agency.commission_model === "LEAD_FEE" && <span>{agency.lead_credits} lead credits</span>}
            <form action={logoutAction}>
              <button className="underline hover:text-white">Sign out</button>
            </form>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
