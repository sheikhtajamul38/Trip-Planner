import { z } from "zod";
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
  DESTINATIONS,
  DESTINATION_IDS,
  type DestinationId,
  HOTEL_CATEGORIES,
  type HotelCategory,
  INTERESTS,
  type Interest,
  findDestinationsInText,
} from "./destinations";
import { type Itinerary, type Stay, addDays, formatRange } from "./planner";

/**
 * AI handles language: understanding requests, wording itineraries and answering
 * questions. It never decides prices, matching, payment or booking state.
 * Every function has a deterministic fallback so the product works without a key.
 */

export function aiAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function chat(messages: ChatMessage[], json: boolean): Promise<string | null> {
  if (!aiAvailable()) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        messages,
        temperature: 0.4,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      console.error("[ai] OpenAI error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.error("[ai] request failed", err);
    return null;
  }
}

async function chatJson<T>(messages: ChatMessage[], schema: z.ZodType<T>): Promise<T | null> {
  const raw = await chat(messages, true);
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    console.error("[ai] response failed validation", parsed.error.issues.slice(0, 3));
  } catch {
    console.error("[ai] response was not JSON");
  }
  return null;
}

const destinationFacts = () =>
  DESTINATION_IDS.map((id) => {
    const d = DESTINATIONS[id];
    return `- ${d.name} (${id}): ${d.tagline}. Drive from Srinagar ${d.driveFromSrinagar}. ${d.overnight ? "Overnight stay" : "Day trip"}. ${d.seasonalNote ?? ""} Activities: ${d.activities.map((a) => a.name).join("; ")}.`;
  }).join("\n");

// ---------------------------------------------------------------------------
// Step 1–2: understand a free-text request and ask for what is missing.

export interface ExtractedRequirements {
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  travellers?: number;
  withKids?: boolean;
  interests?: Interest[];
  activityLevel?: ActivityLevel;
  budgetMin?: number;
  budgetMax?: number | null;
  hotelCategory?: HotelCategory;
  destinations?: DestinationId[];
  questions: string[];
}

const extractedSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  durationDays: z.number().int().min(1).max(30).nullish(),
  travellers: z.number().int().min(1).max(50).nullish(),
  withKids: z.boolean().nullish(),
  interests: z.array(z.enum(INTERESTS)).nullish(),
  activityLevel: z.enum(ACTIVITY_LEVELS).nullish(),
  budgetMin: z.number().min(0).nullish(),
  budgetMax: z.number().min(0).nullish(),
  hotelCategory: z.enum(HOTEL_CATEGORIES).nullish(),
  destinations: z.array(z.string()).nullish(),
});

export async function extractRequirements(text: string, today: string): Promise<ExtractedRequirements> {
  const ai = await chatJson(
    [
      {
        role: "system",
        content: `You extract Kashmir trip requirements from a traveller's message. Today is ${today}.
Return JSON with any of these keys you can infer (omit or null when unknown — never guess dates):
startDate, endDate (YYYY-MM-DD, future dates), durationDays, travellers (total people incl. children; "we" with "our kids" means at least 3 — only set if stated or strongly implied),
withKids, interests (subset of ${JSON.stringify(INTERESTS)}), activityLevel (${ACTIVITY_LEVELS.join("|")}; "not hectic" = relaxed),
budgetMin, budgetMax (total trip INR), hotelCategory (${HOTEL_CATEGORIES.join("|")}), destinations (ids from ${JSON.stringify(DESTINATION_IDS)}).`,
      },
      { role: "user", content: text },
    ],
    extractedSchema,
  );
  const fallback = heuristicExtract(text, today);
  const merged: ExtractedRequirements = ai
    ? {
        startDate: ai.startDate ?? fallback.startDate,
        endDate: ai.endDate ?? fallback.endDate,
        durationDays: ai.durationDays ?? fallback.durationDays,
        travellers: ai.travellers ?? fallback.travellers,
        withKids: ai.withKids ?? fallback.withKids,
        interests: ai.interests?.length ? ai.interests : fallback.interests,
        activityLevel: ai.activityLevel ?? fallback.activityLevel,
        budgetMin: ai.budgetMin ?? fallback.budgetMin,
        budgetMax: ai.budgetMax ?? fallback.budgetMax,
        hotelCategory: ai.hotelCategory ?? fallback.hotelCategory,
        destinations: (ai.destinations ?? []).filter((d): d is DestinationId => (DESTINATION_IDS as string[]).includes(d)),
        questions: [],
      }
    : fallback;
  if (merged.startDate && !merged.endDate && merged.durationDays) {
    merged.endDate = addDays(merged.startDate, merged.durationDays - 1);
  }
  if (merged.startDate && merged.startDate < today) merged.startDate = merged.endDate = undefined;
  merged.questions = missingQuestions(merged);
  return merged;
}

function missingQuestions(r: ExtractedRequirements): string[] {
  const q: string[] = [];
  if (!r.startDate) q.push(r.durationDays ? `What dates are you planning to travel for your ${r.durationDays} days?` : "What dates are you planning to travel?");
  if (!r.travellers) q.push(r.withKids ? "How many adults and children are travelling?" : "How many people are travelling?");
  if (r.budgetMax === undefined && r.budgetMin === undefined) q.push("Do you have a rough budget for the whole trip?");
  return q;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function nextDate(today: string, month: number, day: number): string {
  const year = Number(today.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  const candidate = `${year}-${pad(month)}-${pad(day)}`;
  return candidate >= today ? candidate : `${year + 1}-${pad(month)}-${pad(day)}`;
}

export function heuristicExtract(text: string, today: string): ExtractedRequirements {
  const t = text.toLowerCase();
  const r: ExtractedRequirements = { questions: [] };

  const dur = t.match(/(\d{1,2})\s*(?:-|to)?\s*(days?|nights?)/);
  if (dur) r.durationDays = Number(dur[1]) + (dur[2].startsWith("night") ? 1 : 0);

  const iso = [...t.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  const named = [
    ...t.matchAll(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/g),
  ].map((m) => nextDate(today, MONTHS.indexOf(m[2]) + 1, Number(m[1])));
  const namedRev = [
    ...t.matchAll(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?!\d)/g),
  ].map((m) => nextDate(today, MONTHS.indexOf(m[1]) + 1, Number(m[2])));
  const dates = [...iso, ...named, ...namedRev].sort();
  if (dates[0]) r.startDate = dates[0];
  if (dates.length > 1 && dates[dates.length - 1] > dates[0]) r.endDate = dates[dates.length - 1];

  const pax = t.match(/(\d{1,2})\s*(people|persons|pax|travellers|travelers|adults|of us|members|friends)/);
  if (pax) r.travellers = Number(pax[1]);
  else if (/\b(couple|honeymoon|my (wife|husband|partner))\b/.test(t)) r.travellers = 2;
  else if (/\b(solo|alone|just me)\b/.test(t)) r.travellers = 1;
  if (/\b(kids?|children|child|son|daughter|family)\b/.test(t)) r.withKids = /\b(kids?|children|child|son|daughter)\b/.test(t);

  const interests = new Set<Interest>();
  if (/snow|ski|skiing|winter/.test(t)) interests.add("snow");
  if (/mountain|trek|hike|hiking|valley|meadow|glacier/.test(t)) interests.add("mountains");
  if (/culture|heritage|history|mosque|shrine|garden|old city/.test(t)) interests.add("culture");
  if (/food|wazwan|cuisine|eat/.test(t)) interests.add("food");
  if (/relax|slow|hectic|peaceful|chill|calm|houseboat/.test(t)) interests.add("relaxation");
  if (/adventure|raft|paraglid|ski|thrill/.test(t)) interests.add("adventure");
  if (interests.size) r.interests = [...interests];

  if (/(not|n't|nothing|no)\b[^.]*hectic|relaxed|slow|easy|elderly|parents|leisure/.test(t)) r.activityLevel = "relaxed";
  else if (/packed|active|as much as|adventurous|fast-paced/.test(t)) r.activityLevel = "active";

  const money = t.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k|l|lakh|lakhs|lac)\b/);
  if (money) {
    const value = Number(money[1]) * (money[2] === "k" ? 1000 : 100000);
    r.budgetMin = Math.round(value * 0.85);
    r.budgetMax = value;
  }

  if (/5[- ]?star|luxury|premium/.test(t)) r.hotelCategory = "luxury";
  else if (/4[- ]?star/.test(t)) r.hotelCategory = "4-star";
  else if (/3[- ]?star/.test(t)) r.hotelCategory = "3-star";
  else if (/budget|cheap|economical/.test(t)) r.hotelCategory = "standard";

  const dests = findDestinationsInText(text);
  if (dests.length) r.destinations = dests;
  if (r.startDate && !r.endDate && r.durationDays) r.endDate = addDays(r.startDate, r.durationDays - 1);
  return r;
}

// ---------------------------------------------------------------------------
// Step 3: let the AI word the itinerary without changing its structure.

const polishSchema = z.object({
  title: z.string().min(3).max(120),
  summary: z.string().min(3).max(500),
  days: z.array(
    z.object({
      title: z.string().min(1).max(120),
      items: z.array(z.string().min(1).max(200)).min(1).max(7),
    }),
  ),
  tips: z.array(z.string().max(300)).max(5).optional(),
});

export async function polishItinerary(itinerary: Itinerary, context: { travellers: number; withKids: boolean; notes: string }): Promise<Itinerary> {
  const skeleton = itinerary.days.map((d) => ({
    day: d.day,
    date: d.date,
    sleepsIn: DESTINATIONS[d.base].name,
    travel: d.travel ?? null,
    title: d.title,
    items: d.items,
  }));
  const ai = await chatJson(
    [
      {
        role: "system",
        content: `You are a Kashmir travel planner writing a day-by-day plan for ${context.travellers} traveller(s)${context.withKids ? " including children" : ""}.
You receive a fixed plan. Improve the wording: short, specific day titles and 2–5 bullet items per day with practical tips.
Rules: keep exactly ${skeleton.length} days in the same order; each day stays where "sleepsIn" says; only use places and activities from the facts below; never mention prices; keep travel days light.
Return JSON: {"title": string, "summary": string, "days": [{"title": string, "items": string[]}], "tips": string[]}.
Facts:\n${destinationFacts()}`,
      },
      { role: "user", content: JSON.stringify({ plan: skeleton, travellerNotes: context.notes || undefined }) },
    ],
    polishSchema,
  );
  if (!ai || ai.days.length !== itinerary.days.length) return itinerary;
  return {
    ...itinerary,
    title: ai.title,
    summary: ai.summary,
    days: itinerary.days.map((d, i) => ({ ...d, title: ai.days[i].title, items: ai.days[i].items })),
    notes: [...(ai.tips ?? []), ...itinerary.notes],
    generatedBy: "ai",
  };
}

// ---------------------------------------------------------------------------
// Step 7: understand an itinerary change request.

export interface ItineraryEdit {
  add: DestinationId[];
  remove: DestinationId[];
  activityLevel?: ActivityLevel;
  understood: boolean;
}

const editSchema = z.object({
  add: z.array(z.string()).default([]),
  remove: z.array(z.string()).default([]),
  activityLevel: z.enum(ACTIVITY_LEVELS).nullish(),
});

export async function interpretEdit(request: string, stays: Stay[]): Promise<ItineraryEdit> {
  const ai = await chatJson(
    [
      {
        role: "system",
        content: `Interpret a change request for a Kashmir itinerary. Current stops: ${stays.map((s) => s.destination).join(", ")}.
Destination ids: ${JSON.stringify(DESTINATION_IDS)}. Return JSON {"add": ids, "remove": ids, "activityLevel": "${ACTIVITY_LEVELS.join("|")}" or null}.
"Replace A with B" → remove A, add B. "Less hectic" → relaxed. "More activities" → active.`,
      },
      { role: "user", content: request },
    ],
    editSchema,
  );
  const valid = (ids: string[]) => ids.filter((d): d is DestinationId => (DESTINATION_IDS as string[]).includes(d));
  if (ai) {
    const edit = { add: valid(ai.add), remove: valid(ai.remove), activityLevel: ai.activityLevel ?? undefined };
    return { ...edit, understood: edit.add.length + edit.remove.length > 0 || Boolean(edit.activityLevel) };
  }
  return heuristicEdit(request);
}

export function heuristicEdit(request: string): ItineraryEdit {
  const t = request.toLowerCase();
  const edit: ItineraryEdit = { add: [], remove: [], understood: false };
  const name = (id: DestinationId) => DESTINATIONS[id].name.toLowerCase();
  const swap = t.match(/(?:replace|swap)\s+(\w+)\s+(?:with|for)\s+(\w+)/);
  const instead = t.match(/(\w+)\s+instead of\s+(\w+)/);
  const pair = swap ? [swap[1], swap[2]] : instead ? [instead[2], instead[1]] : null;
  if (pair) {
    const fromId = DESTINATION_IDS.find((id) => name(id) === pair[0]);
    const toId = DESTINATION_IDS.find((id) => name(id) === pair[1]);
    if (fromId) edit.remove.push(fromId);
    if (toId) edit.add.push(toId);
  } else {
    for (const id of DESTINATION_IDS) {
      const n = name(id);
      if (new RegExp(`(remove|skip|drop|without|no)\\s+(the\\s+)?${n}`).test(t)) edit.remove.push(id);
      else if (new RegExp(`(add|include|visit|see|also|more time in)\\s+(the\\s+)?${n}`).test(t)) edit.add.push(id);
    }
  }
  if (/less hectic|more relaxed|slower|relax|fewer/.test(t)) edit.activityLevel = "relaxed";
  else if (/more activities|packed|more adventure|busier/.test(t)) edit.activityLevel = "active";
  edit.understood = edit.add.length + edit.remove.length > 0 || Boolean(edit.activityLevel);
  return edit;
}

// ---------------------------------------------------------------------------
// "Ask AI anything" about the trip.

export async function answerQuestion(
  trip: { itinerary: Itinerary; startDate: string; endDate: string; travellers: number },
  history: { role: "user" | "assistant"; content: string }[],
  question: string,
): Promise<string> {
  const answer = await chat(
    [
      {
        role: "system",
        content: `You are a friendly Kashmir trip assistant. The traveller's plan: ${trip.itinerary.summary}
Days: ${trip.itinerary.days.map((d) => `Day ${d.day} (${d.date}) ${d.title}: ${d.items.join("; ")}`).join(" | ")}
Facts:\n${destinationFacts()}
Answer in under 120 words. Do not quote exact prices — say operators will confirm prices in their quotes. If asked to change the plan, tell them to use "Change itinerary". If unsure about current conditions (roads, weather, advisories), say so and suggest confirming with the operator.`,
      },
      ...history.slice(-8),
      { role: "user", content: question },
    ],
    false,
  );
  return answer?.trim() || heuristicAnswer(trip, question);
}

export function heuristicAnswer(trip: { itinerary: Itinerary; startDate: string; endDate: string }, question: string): string {
  const q = question.toLowerCase();
  const mentioned = findDestinationsInText(question);
  if (/weather|cold|temperature|snow|pack|cloth/.test(q)) {
    const m = Number(trip.startDate.slice(5, 7));
    return [12, 1, 2].includes(m)
      ? "It will be cold — often below freezing at night, colder in Gulmarg and Sonamarg. Pack thermals, a heavy jacket, gloves, a cap and waterproof shoes. Your operator can arrange snow boots and coats in Gulmarg."
      : [3, 4, 10, 11].includes(m)
        ? "Days are pleasant and nights are cold. Pack layers, a warm jacket and comfortable walking shoes."
        : "Summer days are warm in Srinagar and cooler in the mountains. Pack light layers, a light jacket for evenings and sunscreen.";
  }
  if (mentioned.length) {
    const d = DESTINATIONS[mentioned[0]];
    return `${d.name}: ${d.tagline}. It is ${d.driveFromSrinagar === "—" ? "the base city" : `${d.driveFromSrinagar} from Srinagar`}. Popular things to do: ${d.activities.slice(0, 4).map((a) => a.name).join(", ")}.${d.seasonalNote ? " " + d.seasonalNote : ""}`;
  }
  if (/price|cost|budget|expensive|cheap/.test(q)) {
    return `The plan's indicative estimate is ₹${trip.itinerary.estimate.min.toLocaleString("en-IN")}–₹${trip.itinerary.estimate.max.toLocaleString("en-IN")}. For real prices, use "Get actual quotes" and verified local operators will price this exact trip.`;
  }
  return `Your plan covers ${trip.itinerary.summary} Ask me about the weather, what to pack, or any stop on the route — or request quotes and the operators can answer specifics.`;
}

// ---------------------------------------------------------------------------
// Step 6: turn an operator's quote into a clean customer-facing summary.

export interface QuoteDetails {
  lineItems: { category: string; label: string; amount: number }[];
  markup: number;
  inclusions: string;
  exclusions: string;
  notes: string;
}

export async function summarizeQuote(agencyName: string, amount: number, details: QuoteDetails, dates: { start: string; end: string }): Promise<string> {
  const ai = await chat(
    [
      {
        role: "system",
        content:
          "Write a short, factual customer-facing summary (max 70 words) of a travel operator's quote for a Kashmir trip. Only use the information given. Do not invent hotels, inclusions or prices. Do not mention markup.",
      },
      {
        role: "user",
        content: JSON.stringify({
          agency: agencyName,
          total: amount,
          dates: formatRange(dates.start, dates.end),
          items: details.lineItems.map((l) => `${l.category}: ${l.label}`),
          inclusions: details.inclusions,
          exclusions: details.exclusions,
          notes: details.notes,
        }),
      },
    ],
    false,
  );
  return ai?.trim() || templateQuoteSummary(agencyName, details);
}

export function templateQuoteSummary(agencyName: string, details: QuoteDetails): string {
  const byCat = new Map<string, string[]>();
  for (const l of details.lineItems) byCat.set(l.category, [...(byCat.get(l.category) ?? []), l.label]);
  const parts = [...byCat].map(([c, labels]) => `${c}: ${labels.join(", ")}`);
  return [`${agencyName} has priced your trip.`, parts.length ? `${parts.join(". ")}.` : "", details.inclusions && `Includes: ${details.inclusions.replace(/\.$/, "")}.`]
    .filter(Boolean)
    .join(" ");
}
