"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/app/actions";
import { adminLoginAction } from "../actions";

export default function AdminLogin() {
  const [state, action] = useActionState<ActionState, FormData>(adminLoginAction, undefined);
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Platform admin</h1>
      <form action={action} className="card space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" defaultValue={state?.values?.email} key={state?.values?.email} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <FormError error={state?.error} />
        <SubmitButton className="btn-primary w-full">Sign in</SubmitButton>
      </form>
    </div>
  );
}
