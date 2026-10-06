import { answerQuestion, interpretEdit, polishItinerary } from "./ai";
import { type Queryable, getDb, one, query } from "./db";
import type { ActivityLevel, DestinationId, HotelCategory, Interest } from "./destinations";
import { todayIST } from "./format";
import { matchAgencies } from "./matching";
import { notify } from "./notify";
import { type TripRequirements, applyDestinationEdit, buildItinerary, tripDays } from "./planner";
import { type TripRow, WorkflowError } from "./types";

export async function logEvent(q: Queryable, entityType: string, entityId: string, event: string, actor: string, data: object = {}) {
  await q.query(`insert into events (entity_type, entity_id, event, actor, data) values ($1, $2, $3, $4, $5::jsonb)`, [
    entityType,
    entityId,
    event,
    actor,
    JSON.stringify(data),
  ]);
}

export interface NewTripInput {
  startDate: string;
  endDate: string;
  travellers: number;
  budgetMin: number;
  budgetMax: number | null;
  interests: Interest[];
  hotelCategory: HotelCategory;
  activityLevel: ActivityLevel;
  withKids: boolean;
  destinations: DestinationId[];
  notes: string;
}

export function validateTripInput(input: NewTripInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    throw new WorkflowError("Please choose your travel dates.");
  }
  if (input.startDate < todayIST()) throw new WorkflowError("Your start date is in the past.");
  if (input.endDate < input.startDate) throw new WorkflowError("Your end date is before your start date.");
  const days = tripDays(input.startDate, input.endDate);
  if (days > 21) throw new WorkflowError("We plan trips of up to 21 days.");
  if (!Number.isInteger(input.travellers) || input.travellers < 1 || input.travellers > 50) {
    throw new WorkflowError("Travellers must be between 1 and 50.");
  }
}

export function requirementsFromTrip(trip: TripRow): TripRequirements {
  return {
    startDate: trip.start_date,
    endDate: trip.end_date,
    travellers: trip.travellers,
    budgetMin: trip.budget_min,
    budgetMax: trip.budget_max,
    interests: trip.interests,
    hotelCategory: trip.hotel_category,
    activityLevel: trip.activity_level,
    withKids: trip.with_kids,
    mustInclude: trip.destinations,
    exclude: trip.excluded,
  };
}

export async function createTrip(input: NewTripInput): Promise<string> {
  validateTripInput(input);
  const req: TripRequirements = { ...input, mustInclude: input.destinations, exclude: [] };
  const itinerary = await polishItinerary(buildItinerary(req), {
    travellers: input.travellers,
    withKids: input.withKids,
    notes: input.notes,
  });
  const db = await getDb();
  return db.tx(async (q) => {
    const [row] = await q.query<{ id: string }>(
      `insert into trips (start_date, end_date, travellers, budget_min, budget_max, interests, destinations,
         hotel_category, activity_level, with_kids, notes, ai_itinerary)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb) returning id`,
      [
        input.startDate,
        input.endDate,
        input.travellers,
        input.budgetMin,
        input.budgetMax,
        input.interests,
        input.destinations,
        input.hotelCategory,
        input.activityLevel,
        input.withKids,
        input.notes,
        JSON.stringify(itinerary),
      ],
    );
    await logEvent(q, "trip", row.id, "created", "tourist", { generatedBy: itinerary.generatedBy });
    return row.id;
  });
}

export async function getTrip(id: string): Promise<TripRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<TripRow>(`select * from trips where id = $1`, [id]);
}

/** Customer asks to change the plan. Outstanding quotes are re-requested. */
export async function editTrip(tripId: string, request: string): Promise<{ understood: boolean; requotes: number }> {
  const trip = await getTrip(tripId);
  if (!trip) throw new WorkflowError("Trip not found.");
  if (trip.status === "BOOKED" || trip.status === "COMPLETED") {
    throw new WorkflowError("This trip is already booked — message your operator to change it.");
  }
  const edit = await interpretEdit(request, trip.ai_itinerary.stays);
  if (!edit.understood) return { understood: false, requotes: 0 };

  const req = applyDestinationEdit(requirementsFromTrip(trip), trip.ai_itinerary.stays, edit);
  const itinerary = await polishItinerary(buildItinerary(req), {
    travellers: trip.travellers,
    withKids: trip.with_kids,
    notes: `${trip.notes}\nChange requested: ${request}`.trim(),
  });

  const db = await getDb();
  return db.tx(async (q) => {
    await q.query(
      `update trips set ai_itinerary = $2::jsonb, destinations = $3, excluded = $4, activity_level = $5, updated_at = now() where id = $1`,
      [tripId, JSON.stringify(itinerary), req.mustInclude ?? [], req.exclude ?? [], req.activityLevel],
    );
    // Operators that already priced the old plan need to re-price the new one.
    const leads = await q.query<{ id: string; phone: string }>(
      `update leads l set status = 'ACCEPTED', revision_note = $2
         from agencies a
        where l.agency_id = a.id and l.trip_id = $1 and l.status in ('ACCEPTED', 'QUOTE_SENT', 'CUSTOMER_VIEWED')
        returning l.id, a.phone`,
      [tripId, `Customer changed the itinerary: "${request}"`],
    );
    if (leads.length) {
      await q.query(`update quotes set status = 'SUPERSEDED' where lead_id = any($1) and status in ('SENT', 'VIEWED')`, [
        leads.map((l) => l.id),
      ]);
      for (const l of leads) {
        await notify(q, l.phone, "A customer changed their Kashmir itinerary and needs a revised quote.", `/agency/leads/${l.id}`);
      }
    }
    await logEvent(q, "trip", tripId, "itinerary_edited", "tourist", { request, edit, requotes: leads.length });
    return { understood: true, requotes: leads.length };
  });
}

export async function getTripMessages(tripId: string) {
  return query<{ role: "user" | "assistant"; content: string; created_at: Date }>(
    `select role, content, created_at from trip_messages where trip_id = $1 order by created_at`,
    [tripId],
  );
}

export async function askAboutTrip(tripId: string, question: string): Promise<string> {
  const trip = await getTrip(tripId);
  if (!trip) throw new WorkflowError("Trip not found.");
  const text = question.trim().slice(0, 1000);
  if (!text) throw new WorkflowError("Type a question first.");
  const history = (await getTripMessages(tripId)).map(({ role, content }) => ({ role, content }));
  const answer = await answerQuestion(
    { itinerary: trip.ai_itinerary, startDate: trip.start_date, endDate: trip.end_date, travellers: trip.travellers },
    history,
    text,
  );
  await query(`insert into trip_messages (trip_id, role, content) values ($1, 'user', $2), ($1, 'assistant', $3)`, [
    tripId,
    text,
    answer,
  ]);
  return answer;
}

export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const plain = digits.replace(/^\+/, "");
  if (/^[6-9]\d{9}$/.test(plain)) return "+91" + plain;
  if (/^91[6-9]\d{9}$/.test(plain)) return "+" + plain;
  if (/^\d{8,15}$/.test(plain) && digits.startsWith("+")) return "+" + plain;
  return null;
}

/** Screen 3: the tourist hands over contact details and the trip goes to 2–3 operators. */
export async function requestQuotes(
  tripId: string,
  contact: { name: string; phone: string; email?: string },
): Promise<{ matched: number }> {
  const name = contact.name.trim().slice(0, 100);
  const phone = normalisePhone(contact.phone);
  if (!name) throw new WorkflowError("Please tell us your name.");
  if (!phone) throw new WorkflowError("Please enter a valid WhatsApp number.");
  const db = await getDb();
  return db.tx(async (q) => {
    const [trip] = await q.query<TripRow>(`select * from trips where id = $1 for update`, [tripId]);
    if (!trip) throw new WorkflowError("Trip not found.");
    if (trip.status !== "PLANNED" && trip.status !== "QUOTES_REQUESTED") {
      throw new WorkflowError("This trip is already booked.");
    }
    const [user] = await q.query<{ id: string }>(
      `insert into users (name, phone, email, role) values ($1, $2, $3, 'tourist')
       on conflict (phone) do update set name = excluded.name, email = coalesce(excluded.email, users.email)
       returning id`,
      [name, phone, contact.email?.trim() || null],
    );
    await q.query(`update trips set user_id = $2, status = 'QUOTES_REQUESTED', updated_at = now() where id = $1`, [tripId, user.id]);
    if (trip.status === "QUOTES_REQUESTED") return { matched: 0 };

    const agencies = await matchAgencies(q, trip);
    for (const a of agencies) {
      const [lead] = await q.query<{ id: string }>(
        `insert into leads (trip_id, agency_id) values ($1, $2) on conflict do nothing returning id`,
        [tripId, a.id],
      );
      if (lead) {
        await logEvent(q, "lead", lead.id, "created", "matching", { agencyId: a.id, score: a.score });
        await notify(q, a.phone, `New Kashmir enquiry: ${trip.travellers} travellers, ${trip.start_date} to ${trip.end_date}.`, `/agency/leads/${lead.id}`);
      }
    }
    await logEvent(q, "trip", tripId, "quotes_requested", "tourist", { matched: agencies.map((a) => a.id) });
    if (agencies.length === 0) {
      await logEvent(q, "trip", tripId, "needs_manual_matching", "matching");
    }
    await notify(
      q,
      phone,
      `Thanks ${name}! We've sent your Kashmir trip to ${agencies.length || "our"} verified operator${agencies.length === 1 ? "" : "s"}. You'll get quotes here:`,
      `/trip/${tripId}/quotes`,
    );
    return { matched: agencies.length };
  });
}
