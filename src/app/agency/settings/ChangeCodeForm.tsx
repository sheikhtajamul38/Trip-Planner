"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/app/actions";
import { changeCodeAction } from "../actions";

export function ChangeCodeForm() {
  const [state, action] = useActionState<ActionState, FormData>(changeCodeAction, undefined);
  return (
    <form action={action} className="space-y-3">
      {(["current", "next", "confirm"] as const).map((name) => (
        <div key={name} className="flex flex-col gap-1">
          <label htmlFor={name}>{name === "current" ? "Current code" : name === "next" ? "New code (10+ characters)" : "Repeat new code"}</label>
          <input id={name} name={name} type="password" required minLength={name === "current" ? 1 : 10} autoComplete={name === "current" ? "current-password" : "new-password"} />
        </div>
      ))}
      <FormError error={state?.error} />
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <SubmitButton className="btn-primary w-full">Change code</SubmitButton>
    </form>
  );
}
