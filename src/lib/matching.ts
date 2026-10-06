import type { Queryable } from "./db";
import type { DestinationId } from "./destinations";
import type { AgencyRow, TripRow } from "./types";

/**
 * Rule-based agency matching — plain code, not the LLM.
 *   eligible = active + verified + (has lead credits, unless not on a lead-fee plan)
 *   then: destination coverage, budget fit, response rate, current load.
 */

export const MAX_AGENCIES_PER_TRIP = 3;

export interface MatchedAgency extends AgencyRow {
  score: number;
  coverageRatio: number;
  responseRate: number | null;
  openLeads: number;
}

export function tripDestinations(trip: Pick<TripRow, "ai_itinerary">): DestinationId[] {
  const ids = new Set<DestinationId>(trip.ai_itinerary.stays.map((s) => s.destination));
  for (const d of trip.ai_itinerary.days) ids.add(d.base);
  return [...ids];
}

export function scoreAgency(
  agency: Pick<AgencyRow, "coverage" | "min_budget" | "max_budget">,
  trip: Pick<TripRow, "budget_min" | "budget_max">,
  destinations: DestinationId[],
  stats: { responseRate: number | null; openLeads: number },
): { score: number; coverageRatio: number } | null {
  const covered = destinations.filter((d) => agency.coverage.includes(d)).length;
  const coverageRatio = destinations.length ? covered / destinations.length : 1;
  if (coverageRatio < 0.5) return null;

  const tripMax = trip.budget_max ?? Number.POSITIVE_INFINITY;
  if (agency.max_budget != null && trip.budget_min > agency.max_budget) return null;
  if (agency.min_budget > tripMax) return null;

  let score = coverageRatio * 50;
  // Agencies without history get a neutral response rate so new partners still receive leads.
  score += (stats.responseRate ?? 0.6) * 30;
  score -= Math.min(stats.openLeads, 10) * 2;
  return { score, coverageRatio };
}

export async function matchAgencies(q: Queryable, trip: TripRow, limit = MAX_AGENCIES_PER_TRIP): Promise<MatchedAgency[]> {
  const agencies = await q.query<AgencyRow & { leads_90d: number; quoted_90d: number; open_leads: number }>(
    `select a.*,
            (select count(*) from leads l where l.agency_id = a.id and l.created_at > now() - interval '90 days')::int as leads_90d,
            (select count(*) from leads l where l.agency_id = a.id and l.created_at > now() - interval '90 days'
               and exists (select 1 from quotes qu where qu.lead_id = l.id))::int as quoted_90d,
            (select count(*) from leads l where l.agency_id = a.id and l.status = 'NEW')::int as open_leads
       from agencies a
      where a.active and a.verification_status = 'VERIFIED'
        and (a.commission_model <> 'LEAD_FEE' or a.lead_credits > 0)
        and not exists (select 1 from leads l where l.trip_id = $1 and l.agency_id = a.id)
      order by a.created_at`,
    [trip.id],
  );
  const destinations = tripDestinations(trip);
  const scored: MatchedAgency[] = [];
  for (const a of agencies) {
    // Need a few leads before the response rate means anything.
    const responseRate = a.leads_90d >= 3 ? a.quoted_90d / a.leads_90d : null;
    const s = scoreAgency(a, trip, destinations, { responseRate, openLeads: a.open_leads });
    if (s) scored.push({ ...a, score: s.score, coverageRatio: s.coverageRatio, responseRate, openLeads: a.open_leads });
  }
  return scored.sort((x, y) => y.score - x.score).slice(0, limit);
}
