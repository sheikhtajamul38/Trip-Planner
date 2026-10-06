import { DESTINATIONS, DESTINATION_IDS } from "@/lib/destinations";
import type { AgencyRow } from "@/lib/types";

export function AgencyFields({ agency }: { agency?: AgencyRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="name">Agency name</label>
        <input id="name" name="name" required defaultValue={agency?.name} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="phone">Phone / WhatsApp (also the login)</label>
        <input id="phone" name="phone" required defaultValue={agency?.phone} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={agency?.email ?? ""} />
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label htmlFor="description">Short description (shown to customers)</label>
        <input id="description" name="description" defaultValue={agency?.description} maxLength={200} />
      </div>
      <fieldset className="space-y-1 sm:col-span-2">
        <legend className="text-sm font-medium text-stone-700">Destinations covered</legend>
        <div className="flex flex-wrap gap-2">
          {DESTINATION_IDS.map((d) => (
            <label key={d} className="chip">
              <input type="checkbox" name="coverage" value={d} defaultChecked={agency ? agency.coverage.includes(d) : true} className="sr-only" />
              {DESTINATIONS[d].name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor="minBudget">Min trip budget (₹)</label>
        <input id="minBudget" name="minBudget" type="number" min={0} defaultValue={agency?.min_budget ?? 0} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="maxBudget">Max trip budget (₹, blank = any)</label>
        <input id="maxBudget" name="maxBudget" type="number" min={0} defaultValue={agency?.max_budget ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="commissionModel">Commercial model</label>
        <select id="commissionModel" name="commissionModel" defaultValue={agency?.commission_model ?? "FREE"}>
          <option value="FREE">Free (early partner)</option>
          <option value="LEAD_FEE">Prepaid lead credits</option>
          <option value="SUBSCRIPTION">Subscription</option>
          <option value="COMMISSION">Booking commission</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="commissionRate">Commission rate (%)</label>
        <input id="commissionRate" name="commissionRate" type="number" step="0.1" min={0} max={100} defaultValue={agency?.commission_rate ?? 0} />
      </div>
    </div>
  );
}
