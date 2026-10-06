"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ExtractedRequirements, extractRequirements } from "@/lib/ai";
import { ACTIVITY_LEVELS, BUDGET_OPTIONS, HOTEL_CATEGORIES, INTERESTS, isDestinationId } from "@/lib/destinations";
import type { ActivityLevel, DestinationId, HotelCategory, Interest } from "@/lib/destinations";
import { todayIST } from "@/lib/format";
import { completeTrip, reportIssue, selectQuote, submitReview } from "@/lib/marketplace";
import { grantTripAccess, requireTripAccess } from "@/lib/auth";
import { LIMITS, limit, limitByIp } from "@/lib/ratelimit";
import { askAboutTrip, createTrip, editTrip, recoverTripLinks, requestQuotes } from "@/lib/trips";
import { WorkflowError } from "@/lib/types";

export type ActionState = { error?: string; ok?: string; values?: Record<string, string> } | undefined;

/** Business-rule errors go back to the form; anything else is a real bug and is rethrown. */
async function attempt(fn: () => Promise<void | string>): Promise<ActionState> {
  try {
    const ok = await fn();
    return ok ? { ok } : {};
  } catch (err) {
    if (err instanceof WorkflowError) return { error: err.message };
    throw err;
  }
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function extractAction(text: string): Promise<ExtractedRequirements & { error?: string }> {
  try {
    await limitByIp("extract");
  } catch (err) {
    if (err instanceof WorkflowError) return { questions: [], error: err.message };
    throw err;
  }
  return extractRequirements(text.slice(0, 2000), todayIST());
}

/** Rate limits per trip, then checks the caller holds this trip's access cookie. */
async function authorizeTrip(tripId: string, bucket: "askPerTrip" | "editPerTrip" | "tripWrite" = "tripWrite") {
  await requireTripAccess(tripId);
  const l = LIMITS[bucket];
  await limit(`${bucket}:trip:${tripId}`, l.max, l.window);
}

export async function createTripAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id = "";
  const budget = BUDGET_OPTIONS.find((b) => b.id === str(form, "budget"));
  const hotel = str(form, "hotelCategory");
  const pace = str(form, "activityLevel");
  const result = await attempt(async () => {
    await limitByIp("planTrip", "You've planned a lot of trips in the last hour — please try again later.");
    id = await createTrip({
      startDate: str(form, "startDate"),
      endDate: str(form, "endDate"),
      travellers: Number(str(form, "travellers")),
      budgetMin: budget?.min ?? 0,
      budgetMax: budget ? budget.max : null,
      interests: form.getAll("interests").map(String).filter((i): i is Interest => (INTERESTS as readonly string[]).includes(i)),
      hotelCategory: (HOTEL_CATEGORIES as readonly string[]).includes(hotel) ? (hotel as HotelCategory) : "3-star",
      activityLevel: (ACTIVITY_LEVELS as readonly string[]).includes(pace) ? (pace as ActivityLevel) : "moderate",
      withKids: form.get("withKids") === "on",
      destinations: form.getAll("destinations").map(String).filter(isDestinationId) as DestinationId[],
      notes: str(form, "notes").slice(0, 1000),
    });
  });
  if (result?.error) return result;
  await grantTripAccess(id);
  redirect(`/trip/${id}`);
}

export async function editTripAction(tripId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const request = str(form, "request").slice(0, 500);
  if (!request) return { error: "Tell us what you'd like to change." };
  return attempt(async () => {
    await authorizeTrip(tripId, "editPerTrip");
    const res = await editTrip(tripId, request);
    revalidatePath(`/trip/${tripId}`);
    if (!res.understood) {
      throw new WorkflowError(
        'I couldn\'t work that into the plan. Try "Replace Pahalgam with Sonamarg", "Make it cheaper" or "Less driving". Specific hotels are chosen with your operator when they quote.',
      );
    }
    return res.requotes
      ? `Itinerary updated. We've asked ${res.requotes} operator${res.requotes > 1 ? "s" : ""} to re-price it.`
      : "Itinerary updated.";
  });
}

export async function askAction(tripId: string, question: string): Promise<{ answer?: string; error?: string }> {
  try {
    await authorizeTrip(tripId, "askPerTrip");
    await limitByIp("askPerIp");
    return { answer: await askAboutTrip(tripId, question) };
  } catch (err) {
    if (err instanceof WorkflowError) return { error: err.message };
    throw err;
  }
}

export async function requestQuotesAction(tripId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const result = await attempt(async () => {
    await authorizeTrip(tripId);
    await limitByIp("requestQuotes");
    await requestQuotes(tripId, { name: str(form, "name"), phone: str(form, "phone"), email: str(form, "email") });
  });
  if (result?.error) return result;
  redirect(`/trip/${tripId}/quotes`);
}

export async function selectQuoteAction(tripId: string, quoteId: string, _: ActionState): Promise<ActionState> {
  const result = await attempt(async () => {
    await authorizeTrip(tripId);
    await selectQuote(tripId, quoteId);
  });
  if (result?.error) return result;
  redirect(`/trip/${tripId}/booking`);
}

export async function reportIssueAction(tripId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    await authorizeTrip(tripId);
    await reportIssue(tripId, str(form, "message"));
    revalidatePath(`/trip/${tripId}/booking`);
    return "Thanks — our team will contact you on WhatsApp.";
  });
}

export async function completeTripAction(tripId: string, _: ActionState): Promise<ActionState> {
  return attempt(async () => {
    await authorizeTrip(tripId);
    await completeTrip(tripId, "tourist");
    revalidatePath(`/trip/${tripId}/booking`);
  });
}

export async function reviewAction(tripId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    await authorizeTrip(tripId);
    await submitReview(tripId, Number(str(form, "rating")), str(form, "comment"));
    revalidatePath(`/trip/${tripId}/booking`);
    return "Thank you for your review!";
  });
}

export async function recoverAccessAction(_: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    await limitByIp("recoverPerIp");
    const phone = str(form, "phone");
    await limit(`recoverPerPhone:${phone.replace(/\D/g, "").slice(-10)}`, LIMITS.recoverPerPhone.max, LIMITS.recoverPerPhone.window);
    await recoverTripLinks(phone);
    return "If that number has trips with us, we'll send the links to it on WhatsApp shortly.";
  });
}
