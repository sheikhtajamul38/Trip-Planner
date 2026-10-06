"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/app/actions";
import { recordPaymentAction } from "../../actions";

export function RecordPayment({ bookingId, defaultAmount }: { bookingId: string; defaultAmount: number }) {
  const [state, action] = useActionState<ActionState, FormData>(recordPaymentAction.bind(null, bookingId), undefined);
  return (
    <form action={action} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select name="type" aria-label="Payment type">
          <option value="DEPOSIT">Deposit</option>
          <option value="BALANCE">Balance</option>
        </select>
        <input name="amount" type="number" min={1} defaultValue={defaultAmount || undefined} aria-label="Amount" required />
      </div>
      <input name="reference" placeholder="UPI / bank reference (UTR)" className="w-full" required />
      <FormError error={state?.error} />
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <SubmitButton className="btn-secondary w-full" pending="Saving…">
        Record payment
      </SubmitButton>
      <p className="text-xs text-stone-500">The booking is confirmed once the platform verifies the payment.</p>
    </form>
  );
}
