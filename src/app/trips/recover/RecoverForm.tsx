"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui";
import { type ActionState, recoverAccessAction } from "@/app/actions";

export function RecoverForm() {
  const [state, action] = useActionState<ActionState, FormData>(recoverAccessAction, undefined);
  if (state?.ok) return <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.ok}</p>;
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="phone">WhatsApp number you gave us</label>
        <input id="phone" name="phone" type="tel" required autoComplete="tel" placeholder="+91 98765 43210" />
      </div>
      <FormError error={state?.error} />
      <SubmitButton className="btn-primary w-full" pending="Sending…">
        Send me my trip links
      </SubmitButton>
    </form>
  );
}
