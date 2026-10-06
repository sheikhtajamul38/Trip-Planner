import Link from "next/link";
import { StatusBadge } from "@/components/display";
import { requireAgency } from "@/lib/auth";
import { fmtDate, inr } from "@/lib/format";
import { agencyBookings } from "@/lib/queries";

export default async function AgencyBookings() {
  const s = await requireAgency();
  const bookings = await agencyBookings(s.agencyId);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Bookings</h1>
      {bookings.length === 0 ? (
        <p className="card text-sm text-stone-600">No bookings yet.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Trip</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Paid (verified)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/agency/bookings/${b.id}`} className="text-brand-700">
                      {fmtDate(b.start_date)} – {fmtDate(b.end_date)}
                    </Link>
                  </td>
                  <td>
                    {b.customer_name} · {b.travellers} pax
                  </td>
                  <td>{inr(b.total_amount)}</td>
                  <td>{inr(b.paid)}</td>
                  <td>
                    <StatusBadge status={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
