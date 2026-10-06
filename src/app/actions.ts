"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ExtractedRequirements, extractRequirements } from "@/lib/ai";
import { ACTIVITY_LEVELS, BUDGET_OPTIONS, HOTEL_CATEGORIES, INTERESTS, isDestinationId } from "@/lib/destinations";
import type { ActivityLevel, DestinationId, HotelCategory, Interest } from "@/lib/destinations";
import { todayIST } from "@/lib/format";
import { completeTrip, reportIssue, selectQuote, submitReview } from "@/lib/marketplace";
import { askAboutTrip, createTrip, editTrip, requestQuotes } from "@/lib/trips";
import { WorkflowError } from "@/lib/types";

export type ActionState = { error?: string; ok?: string } | undefined;

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

export async function extractAction(text: string): Promise<ExtractedRequirements> {
  return extractRequirements(text.slice(0, 2000), todayIST());
}

export async function createTripAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id = "";
  const budget = BUDGET_OPTIONS.find((b) => b.id === str(form, "budget"));
  const hotel = str(form, "hotelCategory");
  const pace = str(form, "activityLevel");
  const result = await attempt(async () => {
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
  redirect(`/trip/${id}`);
}

export async function editTripAction(tripId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const request = str(form, "request").slice(0, 500);
  if (!request) return { error: "Tell us what you'd like to change." };
  return attempt(async () => {
    const res = await editTrip(tripId, request);
    revalidatePath(`/trip/${tripId}`);
    if (!res.understood) {
      throw new WorkflowError('Sorry, I couldn\'t work out that change. Try something like "Replace Pahalgam with Sonamarg" or "Make it less hectic".');
    }
    return res.requotes
      ? `Itinerary updated. We've asked ${res.requotes} operator${res.requotes > 1 ? "s" : ""} to re-price it.`
      : "Itinerary updated.";
  });
}

export async function askAction(tripId: string, question: string): Promise<{ answer?: string; error?: string }> {
  try {
    return { answer: await askAboutTrip(tripId, question) };
  } catch (err) {
    if (err instanceof WorkflowError) return { error: err.message };
    throw err;
  }
}

export async function requestQuotesAction(tripId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const result = await attempt(async () => {
    await requestQuotes(tripId, { name: str(form, "name"), phone: str(form, "phone"), email: str(form, "email") });
  });
  if (result?.error) return result;
  redirect(`/trip/${tripId}/quotes`);
}

export async function selectQuoteAction(tripId: string, quoteId: string, _: ActionState): Promise<ActionState> {
  const result = await attempt(async () => {
    await selectQuote(tripId, quoteId);
  });
  if (result?.error) return result;
  redirect(`/trip/${tripId}/booking`);
}

export async function reportIssueAction(tripId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    await reportIssue(tripId, str(form, "message"));
    revalidatePath(`/trip/${tripId}/booking`);
    return "Thanks — our team will contact you on WhatsApp.";
  });
}

export async function completeTripAction(tripId: string, _: ActionState): Promise<ActionState> {
  return attempt(async () => {
    await completeTrip(tripId, "tourist");
    revalidatePath(`/trip/${tripId}/booking`);
  });
}

export async function reviewAction(tripId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    await submitReview(tripId, Number(str(form, "rating")), str(form, "comment"));
    revalidatePath(`/trip/${tripId}/booking`);
    return "Thank you for your review!";
  });
}
