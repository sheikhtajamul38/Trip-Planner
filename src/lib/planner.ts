import {
  type ActivityLevel,
  type DestinationId,
  type HotelCategory,
  type Interest,
  DESTINATIONS,
  DESTINATION_IDS,
  HOTEL_CATEGORIES,
  MEALS_PER_PERSON_PER_DAY,
  VEHICLES,
} from "./destinations";

/**
 * Deterministic itinerary planner. It decides where the traveller sleeps each
 * night and what they do, and prices an indicative budget. The AI layer may
 * rewrite the wording, but routing and money always come from here.
 */

export interface TripRequirements {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  travellers: number;
  budgetMin: number;
  budgetMax: number | null;
  interests: Interest[];
  hotelCategory: HotelCategory;
  activityLevel: ActivityLevel;
  withKids: boolean;
  /** Destinations the traveller asked for. */
  mustInclude?: DestinationId[];
  /** Destinations the traveller does not want. */
  exclude?: DestinationId[];
  /** Use exactly `mustInclude` (plus Srinagar) — set when editing a plan. */
  onlyThese?: boolean;
}

export interface Stay {
  destination: DestinationId;
  nights: number;
}

export interface ItineraryDay {
  day: number;
  date: string;
  base: DestinationId;
  title: string;
  travel?: string;
  items: string[];
}

export interface BudgetEstimate {
  min: number;
  max: number;
  breakdown: { label: string; amount: number }[];
  assumptions: string[];
}

export interface Itinerary {
  title: string;
  summary: string;
  stays: Stay[];
  days: ItineraryDay[];
  estimate: BudgetEstimate;
  notes: string[];
  generatedBy: "planner" | "ai";
}

const DAY_MS = 86_400_000;

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
}

export function tripDays(startDate: string, endDate: string): number {
  return Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS) + 1;
}

function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

const WINTER_MONTHS = [12, 1, 2];
const MAX_NIGHTS: Partial<Record<DestinationId, number>> = { gulmarg: 3, pahalgam: 3, sonamarg: 2 };
const ROUTE_ORDER: DestinationId[] = ["srinagar", "gulmarg", "sonamarg", "pahalgam", "doodhpathri", "yusmarg"];

function scoreDestination(id: DestinationId, req: TripRequirements, month: number): number {
  const d = DESTINATIONS[id];
  let score = 1 + d.tags.filter((t) => req.interests.includes(t)).length * 2;
  const winter = [12, 1, 2, 3].includes(month);
  if (winter && req.interests.includes("snow") && d.tags.includes("snow")) score += 3;
  if (id === "gulmarg") score += 1; // the most-requested destination
  if (id === "sonamarg" && WINTER_MONTHS.includes(month)) score -= 3;
  if (req.mustInclude?.includes(id)) score += 100;
  return score;
}

function rankDestinations(req: TripRequirements, overnight: boolean): DestinationId[] {
  const month = monthOf(req.startDate);
  return DESTINATION_IDS.filter(
    (id) =>
      id !== "srinagar" &&
      DESTINATIONS[id].overnight === overnight &&
      DESTINATIONS[id].months.includes(month) &&
      !req.exclude?.includes(id) &&
      (!req.onlyThese || overnight === false || req.mustInclude?.includes(id)),
  ).sort((a, b) => scoreDestination(b, req, month) - scoreDestination(a, req, month));
}

function maxDestinations(nights: number, level: ActivityLevel): number {
  if (level === "relaxed") return nights <= 4 ? 1 : 2;
  if (level === "active") return nights <= 2 ? 1 : nights <= 4 ? 2 : 3;
  return nights <= 3 ? 1 : nights <= 6 ? 2 : 3;
}

/** Decide where the traveller sleeps. Srinagar bookends the trip. */
export function planStays(req: TripRequirements): Stay[] {
  const nights = tripDays(req.startDate, req.endDate) - 1;
  if (nights <= 0) return [{ destination: "srinagar", nights: 0 }];

  const startSrinagar = req.activityLevel === "relaxed" && nights >= 5 ? 2 : 1;
  const endSrinagar = nights >= 3 ? 1 : 0;
  let available = nights - startSrinagar - endSrinagar;

  const ranked = rankDestinations(req, true);
  const wanted = req.mustInclude?.filter((id) => ranked.includes(id)).length ?? 0;
  const k = Math.min(Math.max(maxDestinations(nights, req.activityLevel), wanted), ranked.length, Math.max(available, 0));
  const chosen = ranked.slice(0, k);

  // Every chosen stop gets a night first, then relaxed trips stretch to two nights per
  // stop, then spare nights are spread round-robin before falling back to Srinagar.
  const alloc = new Map<DestinationId, number>(chosen.map((id) => [id, 0]));
  const fill = (cap: (id: DestinationId) => number) => {
    let progressed = true;
    while (available > 0 && progressed) {
      progressed = false;
      for (const id of chosen) {
        if (available > 0 && alloc.get(id)! < cap(id)) {
          alloc.set(id, alloc.get(id)! + 1);
          available--;
          progressed = true;
        }
      }
    }
  };
  fill(() => 1);
  fill((id) => Math.min(req.activityLevel === "relaxed" ? 2 : 1, MAX_NIGHTS[id] ?? 2));
  fill((id) => MAX_NIGHTS[id] ?? 2);

  const stays: Stay[] = [{ destination: "srinagar", nights: startSrinagar }];
  const ordered = [...chosen].sort((a, b) => ROUTE_ORDER.indexOf(a) - ROUTE_ORDER.indexOf(b));
  for (const id of ordered) if (alloc.get(id)! > 0) stays.push({ destination: id, nights: alloc.get(id)! });
  const tail = endSrinagar + Math.max(available, 0);
  if (tail > 0) {
    if (stays.length === 1) stays[0].nights += tail;
    else stays.push({ destination: "srinagar", nights: tail });
  }
  return stays;
}

interface PickedActivity {
  name: string;
  cost: number;
}

function activityPicker(req: TripRequirements) {
  const month = monthOf(req.startDate);
  const maxIntensity = req.activityLevel === "relaxed" ? 2 : 3;
  const used = new Set<string>();
  return (dest: DestinationId, count: number): PickedActivity[] => {
    const pool = DESTINATIONS[dest].activities
      .filter((a) => !a.months || a.months.includes(month))
      .filter((a) => a.intensity <= maxIntensity)
      .filter((a) => !req.withKids || a.family || a.intensity <= 2)
      .filter((a) => !used.has(a.name))
      .map((a, i) => ({ a, i, s: a.tags.filter((t) => req.interests.includes(t)).length }))
      .sort((x, y) => y.s - x.s || x.i - y.i);
    return pool.slice(0, Math.max(count, 0)).map(({ a }) => {
      used.add(a.name);
      return { name: a.name, cost: a.costPerPerson ?? 0 };
    });
  };
}

function itemsPerDay(level: ActivityLevel): number {
  return level === "relaxed" ? 2 : level === "moderate" ? 3 : 4;
}

/** Build the day-by-day plan and an indicative budget. */
export function buildItinerary(req: TripRequirements, staysOverride?: Stay[]): Itinerary {
  const days = tripDays(req.startDate, req.endDate);
  const stays = staysOverride ?? planStays(req);
  const pick = activityPicker(req);
  const perDay = itemsPerDay(req.activityLevel);
  const month = monthOf(req.startDate);

  // Night-by-night base, then the departure day sits wherever the last night was.
  const nightBases: DestinationId[] = stays.flatMap((s) => Array<DestinationId>(s.nights).fill(s.destination));
  const dayTripPool = [
    ...rankDestinations(req, false),
    ...rankDestinations({ ...req, onlyThese: false, mustInclude: [] }, true).filter(
      (id) => !stays.some((s) => s.destination === id) && DESTINATIONS[id].driveHours <= 3,
    ),
  ];

  const out: ItineraryDay[] = [];
  let activityCost = 0;
  const visited = new Set<DestinationId>(stays.map((s) => s.destination));

  for (let i = 0; i < days; i++) {
    const date = addDays(req.startDate, i);
    const base = nightBases[i] ?? nightBases[nightBases.length - 1] ?? "srinagar";
    const prev = i === 0 ? null : (nightBases[i - 1] ?? base);
    const d = DESTINATIONS[base];
    let title = d.name;
    let travel: string | undefined;
    let items: PickedActivity[] = [];

    if (i === days - 1 && days > 1) {
      title = "Departure";
      travel = base === "srinagar" ? "Transfer to Srinagar airport" : `${d.name} → Srinagar airport (${d.driveFromSrinagar})`;
      items = base === "srinagar" ? pick("srinagar", 1) : [];
      out.push({ day: i + 1, date, base, title, travel, items: [...items.map((a) => a.name), "Check out and fly home"] });
      activityCost += items.reduce((s, a) => s + a.cost, 0);
      continue;
    }

    if (i === 0) {
      travel = base === "srinagar" ? "Arrive at Srinagar airport, transfer to hotel" : `Arrive in Srinagar, drive to ${d.name} (${d.driveFromSrinagar})`;
      title = `Arrival — ${d.name}`;
      items = pick(base, perDay - 1);
    } else if (prev !== base) {
      const from = DESTINATIONS[prev!];
      travel = `${from.name} → ${d.name}` + (base === "srinagar" ? ` (${from.driveFromSrinagar})` : prev === "srinagar" ? ` (${d.driveFromSrinagar})` : " via Srinagar");
      items = pick(base, perDay - 1);
    } else {
      items = pick(base, perDay);
      // A spare Srinagar day becomes a day trip once the city's highlights are covered.
      const trip = base === "srinagar" ? dayTripPool.find((id) => !visited.has(id)) : undefined;
      if (trip && (items.length < perDay || i > 1)) {
        visited.add(trip);
        const td = DESTINATIONS[trip];
        title = `Day trip to ${td.name}`;
        travel = `Srinagar ⇄ ${td.name} (${td.driveFromSrinagar} each way)`;
        items = pick(trip, perDay - 1);
      }
    }
    if (items.length === 0) items = [{ name: `Free time to explore ${d.name}`, cost: 0 }];
    activityCost += items.reduce((s, a) => s + a.cost, 0);
    out.push({ day: i + 1, date, base, title, travel, items: items.map((a) => a.name) });
  }

  const estimate = estimateBudget(req, stays, days, activityCost);
  const notes = buildNotes(req, stays, month, estimate);
  const route = stays.map((s) => DESTINATIONS[s.destination].name).filter((n, i, a) => a.indexOf(n) === i);

  return {
    title: `Your ${days}-day Kashmir plan`,
    summary: `${route.join(" → ")} for ${req.travellers} traveller${req.travellers === 1 ? "" : "s"}, ${formatRange(req.startDate, req.endDate)}.`,
    stays,
    days: out,
    estimate,
    notes,
    generatedBy: "planner",
  };
}

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

export function estimateBudget(req: TripRequirements, stays: Stay[], days: number, activityCostPerPerson: number): BudgetEstimate {
  const rooms = Math.ceil(req.travellers / 2);
  const hotel = stays.reduce((s, st) => s + st.nights * DESTINATIONS[st.destination].roomRate[req.hotelCategory] * rooms, 0);
  const vehicle = VEHICLES.find((v) => v.maxPax >= req.travellers) ?? VEHICLES[VEHICLES.length - 1];
  const vehicleCount = Math.ceil(req.travellers / vehicle.maxPax);
  const transport = vehicle.perDay * vehicleCount * days;
  const meals = MEALS_PER_PERSON_PER_DAY[req.hotelCategory] * req.travellers * days;
  const activities = activityCostPerPerson * req.travellers;
  const total = hotel + transport + meals + activities;
  return {
    min: roundTo(total * 0.9, 1000),
    max: roundTo(total * 1.15, 1000),
    breakdown: [
      { label: `Hotels (${req.hotelCategory}, ${rooms} room${rooms > 1 ? "s" : ""})`, amount: hotel },
      { label: `Transport (${vehicleCount > 1 ? `${vehicleCount} × ` : ""}${vehicle.name}, ${days} days)`, amount: transport },
      { label: "Meals", amount: meals },
      { label: "Activities and entry tickets", amount: activities },
    ],
    assumptions: [
      "Indicative prices only — operators quote actual rates.",
      "Flights to and from Srinagar are not included.",
      `${rooms} room${rooms > 1 ? "s" : ""} on twin sharing.`,
    ],
  };
}

function buildNotes(req: TripRequirements, stays: Stay[], month: number, estimate: BudgetEstimate): string[] {
  const notes: string[] = [];
  for (const id of new Set(stays.map((s) => s.destination))) {
    const note = DESTINATIONS[id].seasonalNote;
    if (note && id !== "srinagar") notes.push(`${DESTINATIONS[id].name}: ${note}`);
  }
  if (req.interests.includes("snow") && ![12, 1, 2, 3].includes(month)) {
    notes.push("Snow is unlikely at Gulmarg outside December–March; higher points like Apharwat may still have some in spring.");
  }
  if (req.budgetMax && estimate.min > req.budgetMax) {
    notes.push("This estimate is above your budget. Standard hotels or fewer nights outside Srinagar would bring it down.");
  }
  notes.push("Check current travel advisories before you travel; operators will confirm road and weather conditions.");
  return notes;
}

export function formatRange(start: string, end: string): string {
  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Turn an edit request into new requirements for re-planning. */
export function applyDestinationEdit(
  req: TripRequirements,
  current: Stay[],
  edit: { add?: DestinationId[]; remove?: DestinationId[]; activityLevel?: ActivityLevel; hotelChange?: "up" | "down" },
): TripRequirements {
  const ladder = HOTEL_CATEGORIES;
  const step = edit.hotelChange === "up" ? 1 : edit.hotelChange === "down" ? -1 : 0;
  const hotelCategory = ladder[Math.min(Math.max(ladder.indexOf(req.hotelCategory) + step, 0), ladder.length - 1)];
  const remove = new Set(edit.remove ?? []);
  const keep = [...new Set(current.map((s) => s.destination))].filter((id) => id !== "srinagar" && !remove.has(id));
  const add = (edit.add ?? []).filter((id) => id !== "srinagar" && !keep.includes(id));
  return {
    ...req,
    activityLevel: edit.activityLevel ?? req.activityLevel,
    hotelCategory,
    mustInclude: [...keep, ...add],
    exclude: [...new Set([...(req.exclude ?? []).filter((id) => !add.includes(id)), ...remove])],
    onlyThese: true,
  };
}
