"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui";
import { type ActionState, completeTripAction, reportIssueAction, reviewAction } from "@/app/actions";

export function ReportIssue({ tripId }: { tripId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(reportIssueAction.bind(null, tripId), undefined);
  if (state?.ok) return <p className="text-sm text-emerald-700">{state.ok}</p>;
  return (
    <form action={action} className="space-y-2">
      <textarea name="message" rows={3} className="w-full" placeholder="What went wrong? Our team (not the operator) reads this." required maxLength={2000} />
      <FormError error={state?.error} />
      <SubmitButton className="btn-secondary" pending="Sending…">
        Report an issue
      </SubmitButton>
    </form>
  );
}

export function CompleteTrip({ tripId }: { tripId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(completeTripAction.bind(null, tripId), undefined);
  return (
    <form action={action} className="space-y-2">
      <SubmitButton pending="Saving…">Yes, my trip is complete</SubmitButton>
      <FormError error={state?.error} />
    </form>
  );
}

export function ReviewForm({ tripId }: { tripId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(reviewAction.bind(null, tripId), undefined);
  if (state?.ok) return <p className="text-sm text-emerald-700">{state.ok}</p>;
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-row-reverse justify-end gap-1 text-2xl">
        {[5, 4, 3, 2, 1].map((n) => (
          <label key={n} className="cursor-pointer text-stone-300 has-[:checked]:text-amber-500 [label:has(:checked)~&]:text-amber-500">
            <input type="radio" name="rating" value={n} required className="sr-only" />
            <span aria-label={`${n} star${n > 1 ? "s" : ""}`}>★</span>
          </label>
        ))}
      </div>
      <textarea name="comment" rows={3} className="w-full" placeholder="How was your trip? Hotels, driver, itinerary…" maxLength={2000} />
      <FormError error={state?.error} />
      <SubmitButton pending="Saving…">Submit verified review</SubmitButton>
    </form>
  );
}
