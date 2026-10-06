import Link from "next/link";
import { getSession } from "@/lib/auth";
import { adminLogoutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="space-y-6">
      {session?.kind === "admin" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-900 px-4 py-3 text-white">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-bold uppercase tracking-wide">Platform</span>
            <Link href="/admin" className="text-stone-300 hover:text-white">
              Overview
            </Link>
            <Link href="/admin/agencies" className="text-stone-300 hover:text-white">
              Agencies
            </Link>
          </div>
          <form action={adminLogoutAction}>
            <button className="text-sm text-stone-300 underline hover:text-white">Sign out</button>
          </form>
        </div>
      )}
      {children}
    </div>
  );
}
