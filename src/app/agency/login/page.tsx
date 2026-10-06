"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/app/actions";
import { loginAction } from "../actions";

export default function AgencyLogin() {
  const [state, action] = useActionState<ActionState, FormData>(loginAction, undefined);
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Operator sign in</h1>
      <form action={action} className="card space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="phone">Registered phone number</label>
          <input id="phone" name="phone" type="tel" required autoComplete="tel" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="code">Access code</label>
          <input id="code" name="code" type="password" required autoComplete="current-password" />
        </div>
        <FormError error={state?.error} />
        <SubmitButton className="btn-primary w-full">Sign in</SubmitButton>
      </form>
      <p className="text-sm text-stone-600">
        Local operator in Kashmir? We onboard agencies personally — get in touch with the platform team to join.
      </p>
    </div>
  );
}
