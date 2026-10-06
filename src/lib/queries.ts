import { one, query } from "./db";
import { DESTINATIONS, type DestinationId } from "./destinations";
import type {
  AgencyRow,
  BookingRow,
  IssueRow,
  LeadRow,
  NotificationRow,
  PaymentRow,
  QuoteRow,
  ReviewRow,
  TripRow,
  UserRow,
} from "./types";

/** Minimum data points before a statistic is shown publicly — no invented numbers. */
const MIN_SAMPLE = 3;

export interface AgencyProfile {
  id: string;
  name: string;
  description: string;
  phone: string;
  verified: boolean;
  verifiedItems: string[];
  completedTrips: number;
  reviewCount: number;
  avgRating: number | null;
  avgResponseMinutes: number | null;
  /** Share of leads received that got a quote. */
  quoteRate: number | null;
}

export async function agencyProfiles(ids: string[]): Promise<Map<string, AgencyProfile>> {
  if (!ids.length) return new Map();
  const rows = await query<AgencyRow & { completed: number; review_count: number; avg_rating: number | null; response_n: number; response_min: number | null; leads_n: number }>(
    `select a.*,
       (select count(*) from bookings b where b.agency_id = a.id and b.status = 'COMPLETED')::int as completed,
       (select count(*) from reviews r where r.agency_id = a.id and r.verified_trip)::int as review_count,
       (select avg(r.rating)::float from reviews r where r.agency_id = a.id and r.verified_trip) as avg_rating,
       (select count(*) from leads l where l.agency_id = a.id and exists (select 1 from quotes q where q.lead_id = l.id))::int as response_n,
       (select count(*) from leads l where l.agency_id = a.id and l.status <> 'NEW')::int as leads_n,
       (select avg(extract(epoch from (fq.first_quote - l.created_at)) / 60)::float
          from leads l join lateral (select min(q.created_at) as first_quote from quotes q where q.lead_id = l.id) fq on fq.first_quote is not null
         where l.agency_id = a.id) as response_min
     from agencies a where a.id = any($1)`,
    [ids],
  );
  return new Map(
    rows.map((a) => [
      a.id,
      {
        id: a.id,
        name: a.name,
        description: a.description,
        phone: a.phone,
        verified: a.verification_status === "VERIFIED",
        verifiedItems: a.verified_items,
        completedTrips: a.completed,
        reviewCount: a.review_count,
        avgRating: a.review_count >= MIN_SAMPLE ? a.avg_rating : null,
        avgResponseMinutes: a.response_n >= MIN_SAMPLE && a.response_min != null ? Math.round(a.response_min) : null,
        quoteRate: a.leads_n >= MIN_SAMPLE * 3 ? a.response_n / a.leads_n : null,
      },
    ]),
  );
}

// --------------------------------------------------------------------------- tourist

export interface TripView {
  trip: TripRow;
  customer: UserRow | null;
  leads: (LeadRow & { agency_name: string })[];
  quotes: (QuoteRow & { lead_status: string })[];
  profiles: Map<string, AgencyProfile>;
  booking: BookingRow | null;
  payments: PaymentRow[];
  review: ReviewRow | null;
  issues: IssueRow[];
}

export async function getTripView(tripId: string): Promise<TripView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(tripId)) return null;
  const trip = await one<TripRow>(`select * from trips where id = $1`, [tripId]);
  if (!trip) return null;
  const [customer, leads, quotes, booking, issues] = await Promise.all([
    trip.user_id ? one<UserRow>(`select * from users where id = $1`, [trip.user_id]) : null,
    query<LeadRow & { agency_name: string }>(
      `select l.*, a.name as agency_name from leads l join agencies a on a.id = l.agency_id where l.trip_id = $1 order by l.created_at`,
      [tripId],
    ),
    query<QuoteRow & { lead_status: string }>(
      `select q.*, l.status as lead_status from quotes q join leads l on l.id = q.lead_id
        where l.trip_id = $1 and q.status in ('SENT', 'VIEWED', 'ACCEPTED') order by q.amount`,
      [tripId],
    ),
    one<BookingRow>(`select * from bookings where trip_id = $1 and status <> 'CANCELLED'`, [tripId]),
    query<IssueRow>(`select * from issues where trip_id = $1 order by created_at desc`, [tripId]),
  ]);
  const [payments, review, profiles] = await Promise.all([
    booking ? query<PaymentRow>(`select * from payments where booking_id = $1 order by created_at`, [booking.id]) : [],
    booking ? one<ReviewRow>(`select * from reviews where booking_id = $1`, [booking.id]) : null,
    agencyProfiles([...new Set([...quotes.map((q) => q.agency_id), ...(booking ? [booking.agency_id] : [])])]),
  ]);
  return { trip, customer, leads, quotes, profiles, booking, payments, review, issues };
}

export function paymentSummary(booking: BookingRow, payments: PaymentRow[]) {
  const verified = payments.filter((p) => p.payment_status === "VERIFIED");
  const paid = verified.reduce((s, p) => s + (p.payment_type === "REFUND" ? -p.amount : p.amount), 0);
  const depositPaid = Math.min(paid, booking.deposit_amount);
  return { paid, depositPaid, balance: Math.max(booking.total_amount - paid, 0), pending: payments.filter((p) => p.payment_status === "PENDING") };
}

// --------------------------------------------------------------------------- agency

export type AgencyLeadRow = LeadRow & {
  start_date: string;
  end_date: string;
  travellers: number;
  budget_min: number;
  budget_max: number | null;
  hotel_category: string;
  with_kids: boolean;
  route: DestinationId[];
  latest_quote: number | null;
};

export async function agencyDashboard(agencyId: string) {
  const [counts] = await query<{ new_leads: number; quotes_pending: number; bookings: number; pipeline: number }>(
    `select
       (select count(*) from leads where agency_id = $1 and status = 'NEW')::int as new_leads,
       (select count(*) from leads where agency_id = $1 and status = 'ACCEPTED')::int as quotes_pending,
       (select count(*) from bookings where agency_id = $1 and status in ('PENDING_DEPOSIT', 'CONFIRMED'))::int as bookings,
       ((select coalesce(sum(q.amount), 0) from quotes q join leads l on l.id = q.lead_id
          where q.agency_id = $1 and q.status in ('SENT', 'VIEWED') and l.status in ('QUOTE_SENT', 'CUSTOMER_VIEWED'))
        + (select coalesce(sum(total_amount), 0) from bookings where agency_id = $1 and status in ('PENDING_DEPOSIT', 'CONFIRMED')))::int as pipeline`,
    [agencyId],
  );
  const leads = await query<AgencyLeadRow>(
    `select l.*, t.start_date, t.end_date, t.travellers, t.budget_min, t.budget_max, t.hotel_category, t.with_kids,
            array(select distinct s->>'destination' from jsonb_array_elements(t.ai_itinerary->'stays') s) as route,
            (select q.amount from quotes q where q.lead_id = l.id order by q.created_at desc limit 1) as latest_quote
       from leads l join trips t on t.id = l.trip_id
      where l.agency_id = $1
      order by case l.status when 'NEW' then 0 when 'ACCEPTED' then 1 when 'QUOTE_SENT' then 2 when 'CUSTOMER_VIEWED' then 2 else 3 end,
               l.created_at desc
      limit 100`,
    [agencyId],
  );
  return { counts, leads };
}

export async function agencyLead(leadId: string, agencyId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return null;
  const lead = await one<LeadRow>(`select * from leads where id = $1 and agency_id = $2`, [leadId, agencyId]);
  if (!lead) return null;
  const trip = (await one<TripRow>(`select * from trips where id = $1`, [lead.trip_id]))!;
  // Contact details are only revealed once the agency has accepted (and paid for) the lead.
  const revealed = !["NEW", "DECLINED", "EXPIRED"].includes(lead.status);
  const customer = revealed && trip.user_id ? await one<UserRow>(`select * from users where id = $1`, [trip.user_id]) : null;
  const quotes = await query<QuoteRow>(`select * from quotes where lead_id = $1 order by created_at desc`, [leadId]);
  const booking = await one<BookingRow>(`select * from bookings where trip_id = $1 and agency_id = $2 and status <> 'CANCELLED'`, [trip.id, agencyId]);
  return { lead, trip, customer, quotes, booking };
}

export async function agencyBookings(agencyId: string) {
  return query<BookingRow & { start_date: string; end_date: string; travellers: number; customer_name: string | null; paid: number }>(
    `select b.*, t.start_date, t.end_date, t.travellers, u.name as customer_name,
            (select coalesce(sum(case when p.payment_type = 'REFUND' then -p.amount else p.amount end), 0) from payments p
              where p.booking_id = b.id and p.payment_status = 'VERIFIED')::int as paid
       from bookings b join trips t on t.id = b.trip_id left join users u on u.id = t.user_id
      where b.agency_id = $1 order by t.start_date`,
    [agencyId],
  );
}

export async function agencyBooking(bookingId: string, agencyId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const booking = await one<BookingRow>(`select * from bookings where id = $1 and agency_id = $2`, [bookingId, agencyId]);
  if (!booking) return null;
  const trip = (await one<TripRow>(`select * from trips where id = $1`, [booking.trip_id]))!;
  const [customer, payments, quote, lead] = await Promise.all([
    trip.user_id ? one<UserRow>(`select * from users where id = $1`, [trip.user_id]) : null,
    query<PaymentRow>(`select * from payments where booking_id = $1 order by created_at`, [bookingId]),
    one<QuoteRow>(`select * from quotes where id = $1`, [booking.quote_id]),
    one<{ id: string }>(`select l.id from leads l join quotes q on q.lead_id = l.id where q.id = $1`, [booking.quote_id]),
  ]);
  return { booking, trip, customer, payments, quote, leadId: lead?.id ?? null };
}

// --------------------------------------------------------------------------- platform admin

export async function adminMetrics(since: string) {
  const [funnel] = await query<{ trips: number; qualified: number; quotes: number; bookings: number; completed: number; confirmed_value: number }>(
    `select
       (select count(*) from trips where created_at >= $1)::int as trips,
       (select count(*) from trips where created_at >= $1 and user_id is not null)::int as qualified,
       (select count(*) from quotes where created_at >= $1 and status <> 'SUPERSEDED')::int as quotes,
       (select count(*) from bookings where created_at >= $1)::int as bookings,
       (select count(*) from bookings where completed_at >= $1)::int as completed,
       (select coalesce(sum(total_amount), 0) from bookings where created_at >= $1 and status in ('CONFIRMED', 'COMPLETED'))::int as confirmed_value`,
    [since],
  );
  const agencies = await query<{
    id: string;
    name: string;
    verification_status: string;
    commission_model: string;
    lead_credits: number;
    active: boolean;
    leads: number;
    accepted: number;
    quotes: number;
    bookings: number;
    completed: number;
    issues: number;
    avg_rating: number | null;
    reviews: number;
  }>(
    `select a.id, a.name, a.verification_status, a.commission_model, a.lead_credits, a.active,
       (select count(*) from leads l where l.agency_id = a.id)::int as leads,
       (select count(*) from leads l where l.agency_id = a.id and l.accepted_at is not null)::int as accepted,
       (select count(distinct q.lead_id) from quotes q where q.agency_id = a.id)::int as quotes,
       (select count(*) from bookings b where b.agency_id = a.id and b.status <> 'CANCELLED')::int as bookings,
       (select count(*) from bookings b where b.agency_id = a.id and b.status = 'COMPLETED')::int as completed,
       (select count(*) from issues i join bookings b on b.id = i.booking_id where b.agency_id = a.id)::int as issues,
       (select avg(r.rating)::float from reviews r where r.agency_id = a.id) as avg_rating,
       (select count(*) from reviews r where r.agency_id = a.id)::int as reviews
     from agencies a order by a.created_at`,
  );
  const destinationRows = await query<{ destination: DestinationId; trips: number }>(
    `select s->>'destination' as destination, count(distinct t.id)::int as trips
       from trips t, jsonb_array_elements(t.ai_itinerary->'stays') s
      where t.created_at >= $1 group by 1 order by 2 desc`,
    [since],
  );
  const destinations = destinationRows.map((d) => ({ ...d, name: DESTINATIONS[d.destination]?.name ?? d.destination }));
  return { funnel, agencies, destinations };
}

export async function adminQueues() {
  const [unmatched, pendingPayments, openIssues, outbox, recentTrips] = await Promise.all([
    query<TripRow & { customer_name: string; customer_phone: string; live_leads: number }>(
      `select t.*, u.name as customer_name, u.phone as customer_phone,
              (select count(*) from leads l where l.trip_id = t.id and l.status not in ('DECLINED', 'EXPIRED', 'LOST'))::int as live_leads
         from trips t join users u on u.id = t.user_id
        where t.status = 'QUOTES_REQUESTED'
          and (select count(*) from leads l where l.trip_id = t.id and l.status not in ('DECLINED', 'EXPIRED', 'LOST')) < 2
        order by t.updated_at`,
    ),
    query<PaymentRow & { agency_name: string; trip_id: string; deposit_amount: number }>(
      `select p.*, a.name as agency_name, b.trip_id, b.deposit_amount from payments p join bookings b on b.id = p.booking_id join agencies a on a.id = b.agency_id
        where p.payment_status = 'PENDING' order by p.created_at`,
    ),
    query<IssueRow & { agency_name: string | null; customer_phone: string | null }>(
      `select i.*, a.name as agency_name, u.phone as customer_phone from issues i
         join trips t on t.id = i.trip_id left join users u on u.id = t.user_id
         left join bookings b on b.id = i.booking_id left join agencies a on a.id = b.agency_id
        where i.status = 'OPEN' order by i.created_at`,
    ),
    query<NotificationRow>(`select * from notifications where status = 'QUEUED' order by created_at limit 50`),
    query<TripRow & { customer_name: string | null; booking_status: string | null; booking_id: string | null }>(
      `select t.*, u.name as customer_name, b.status as booking_status, b.id as booking_id from trips t left join users u on u.id = t.user_id
         left join bookings b on b.trip_id = t.id and b.status <> 'CANCELLED'
        order by t.created_at desc limit 30`,
    ),
  ]);
  return { unmatched, pendingPayments, openIssues, outbox, recentTrips };
}

export async function tripEvents(tripId: string) {
  return query<{ id: number; entity_type: string; event: string; actor: string; data: object; created_at: Date }>(
    `select e.* from events e
      where (e.entity_type = 'trip' and e.entity_id = $1)
         or (e.entity_type = 'lead' and e.entity_id in (select id from leads where trip_id = $1))
         or (e.entity_type = 'quote' and e.entity_id in (select q.id from quotes q join leads l on l.id = q.lead_id where l.trip_id = $1))
         or (e.entity_type = 'booking' and e.entity_id in (select id from bookings where trip_id = $1))
         or (e.entity_type = 'payment' and e.entity_id in (select p.id from payments p join bookings b on b.id = p.booking_id where b.trip_id = $1))
         or (e.entity_type in ('review', 'issue') and e.entity_id in (
              select r.id from reviews r join bookings b on b.id = r.booking_id where b.trip_id = $1
              union select i.id from issues i where i.trip_id = $1))
      order by e.id`,
    [tripId],
  );
}

// --------------------------------------------------------------------------- funnel

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

/**
 * The full funnel for a period. Visitor steps come from first-party beacons; every
 * later step follows the cohort of trips created in the period through to review.
 */
export async function funnel(since: string): Promise<FunnelStep[]> {
  const [r] = await query<Record<string, number>>(
    `with cohort as (select * from trips where created_at >= $1)
     select
       (select count(distinct visitor_id) from analytics_events where name = 'visit' and created_at >= $1)::int as visitors,
       (select count(distinct visitor_id) from analytics_events where name = 'planner_started' and created_at >= $1)::int as planner_started,
       (select count(*) from cohort)::int as trips,
       (select count(*) from cohort where user_id is not null)::int as quote_requests,
       (select count(*) from cohort c where exists (select 1 from leads l where l.trip_id = c.id))::int as qualified,
       (select count(*) from cohort c where exists (select 1 from leads l where l.trip_id = c.id and l.accepted_at is not null))::int as accepted,
       (select count(*) from cohort c where exists (select 1 from quotes q join leads l on l.id = q.lead_id where l.trip_id = c.id))::int as quoted,
       (select count(*) from cohort c where exists (select 1 from analytics_events a where a.name = 'quotes_viewed' and a.trip_id = c.id))::int as viewed,
       (select count(*) from cohort c where exists (select 1 from bookings b where b.trip_id = c.id))::int as chose,
       (select count(*) from cohort c where exists (select 1 from bookings b join payments p on p.booking_id = b.id
          where b.trip_id = c.id and p.payment_type = 'DEPOSIT' and p.payment_status = 'VERIFIED'))::int as deposit,
       (select count(*) from cohort c where exists (select 1 from bookings b where b.trip_id = c.id and b.confirmed_at is not null))::int as confirmed,
       (select count(*) from cohort c where exists (select 1 from bookings b where b.trip_id = c.id and b.status = 'COMPLETED'))::int as completed,
       (select count(*) from cohort c where exists (select 1 from bookings b join reviews rv on rv.booking_id = b.id where b.trip_id = c.id))::int as reviewed`,
    [since],
  );
  const steps: [string, string][] = [
    ["visitors", "Visitors"],
    ["planner_started", "Started the planner"],
    ["trips", "Trip generated"],
    ["quote_requests", "Requested quotes"],
    ["qualified", "Qualified lead (sent to operators)"],
    ["accepted", "An operator accepted"],
    ["quoted", "Quote received"],
    ["viewed", "Customer viewed quotes"],
    ["chose", "Chose an operator"],
    ["deposit", "Deposit verified"],
    ["confirmed", "Booking confirmed"],
    ["completed", "Trip completed"],
    ["reviewed", "Verified review"],
  ];
  return steps.map(([key, label]) => ({ key, label, count: r[key] }));
}

export async function recordQuotesViewed(tripId: string) {
  await query(
    `insert into analytics_events (name, trip_id) select 'quotes_viewed', $1
      where not exists (select 1 from analytics_events where name = 'quotes_viewed' and trip_id = $1)`,
    [tripId],
  );
}

/** Leads past their response target: NEW beyond the first-response window, or ACCEPTED with no quote. */
export async function overdueLeads(responseHours: number, quoteHours: number) {
  return query<{ id: string; status: string; created_at: Date; accepted_at: Date | null; agency_name: string; trip_id: string; customer_name: string | null }>(
    `select l.id, l.status, l.created_at, l.accepted_at, a.name as agency_name, l.trip_id, u.name as customer_name
       from leads l join agencies a on a.id = l.agency_id join trips t on t.id = l.trip_id left join users u on u.id = t.user_id
      where t.status = 'QUOTES_REQUESTED'
        and ((l.status = 'NEW' and l.created_at < now() - make_interval(hours => $1))
          or (l.status = 'ACCEPTED' and l.accepted_at < now() - make_interval(hours => $2)))
      order by l.created_at`,
    [responseHours, quoteHours],
  );
}
