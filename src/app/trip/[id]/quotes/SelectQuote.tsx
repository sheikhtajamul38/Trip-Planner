"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui";
import { type ActionState, selectQuoteAction } from "@/app/actions";

export function SelectQuote({ tripId, quoteId, agencyName }: { tripId: string; quoteId: string; agencyName: string }) {
  const [state, action] = useActionState<ActionState, FormData>(selectQuoteAction.bind(null, tripId, quoteId), undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Book with ${agencyName}? The other operators will be told you've chosen.`)) e.preventDefault();
      }}
      className="space-y-2"
    >
      <SubmitButton className="btn-primary w-full" pending="Booking…">
        Choose this operator
      </SubmitButton>
      <FormError error={state?.error} />
    </form>
  );
}
