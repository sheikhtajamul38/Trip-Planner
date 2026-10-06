"use client";

import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/app/actions";
import { inr } from "@/lib/format";
import { acceptLeadAction, declineLeadAction, sendQuoteAction } from "../../actions";

export function LeadDecision({ leadId, charged }: { leadId: string; charged: boolean }) {
  const [acceptState, accept] = useActionState<ActionState, FormData>(acceptLeadAction.bind(null, leadId), undefined);
  const [declineState, decline] = useActionState<ActionState, FormData>(declineLeadAction.bind(null, leadId), undefined);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={accept}>
          <SubmitButton pending="Accepting…">Accept lead{charged ? " (uses 1 credit)" : ""}</SubmitButton>
        </form>
        <form action={decline}>
          <SubmitButton className="btn-secondary" pending="…">
            Decline
          </SubmitButton>
        </form>
      </div>
      <FormError error={acceptState?.error ?? declineState?.error} />
      <p className="text-xs text-stone-500">Accepting shows you the customer&apos;s contact details and lets you send a quote.</p>
    </div>
  );
}

type Line = { category: string; label: string; amount: string };
const CATEGORIES = ["Hotel", "Transport", "Activities", "Meals", "Other"];

export function QuoteBuilder({ leadId, suggestions }: { leadId: string; suggestions: Line[] }) {
  const [state, action] = useActionState<ActionState, FormData>(sendQuoteAction.bind(null, leadId), undefined);
  const [lines, setLines] = useState<Line[]>(suggestions);
  const [markup, setMarkup] = useState("");
  const num = (v: string) => Number(v.replace(/[,₹\s]/g, "")) || 0;
  const total = lines.reduce((s, l) => s + num(l.amount), 0) + num(markup);
  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="space-y-4">
      {CATEGORIES.filter((c) => lines.some((l) => l.category === c)).map((cat) => (
        <fieldset key={cat} className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-stone-500">{cat}</legend>
          {lines.map((l, i) =>
            l.category !== cat ? null : (
              <div key={i} className="flex gap-2">
                <input type="hidden" name="category" value={l.category} />
                <input name="label" className="min-w-0 flex-1" value={l.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Description" />
                <input
                  name="amount"
                  inputMode="numeric"
                  className="w-28 text-right"
                  value={l.amount}
                  onChange={(e) => update(i, { amount: e.target.value })}
                  placeholder="₹"
                  aria-label={`Amount for ${l.label || cat}`}
                />
                <button type="button" className="px-2 text-stone-400 hover:text-red-600" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ),
          )}
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setLines([...lines, { category: c, label: "", amount: "" }])}>
            + {c}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-stone-200 pt-3">
        <label htmlFor="markup">Agency markup / service fee</label>
        <input id="markup" name="markup" inputMode="numeric" className="w-28 text-right" value={markup} onChange={(e) => setMarkup(e.target.value)} placeholder="₹" />
      </div>
      <div className="flex items-center justify-between text-lg font-bold">
        <span>Total</span>
        <span>{inr(total)}</span>
      </div>
      <p className="text-xs text-stone-500">The customer sees the total and item descriptions — not individual prices or your markup.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="inclusions">Includes</label>
          <textarea id="inclusions" name="inclusions" rows={2} placeholder="Breakfast & dinner, airport pickup, all sightseeing by Innova" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="exclusions">Excludes</label>
          <textarea id="exclusions" name="exclusions" rows={2} placeholder="Flights, gondola tickets, pony rides" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="notes">Note to customer</label>
        <textarea id="notes" name="notes" rows={2} />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="validDays">Valid for</label>
        <select id="validDays" name="validDays" defaultValue="7">
          {[3, 5, 7, 14].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </div>
      <FormError error={state?.error} />
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <SubmitButton className="btn-primary w-full" pending="Sending…" disabled={total <= 0}>
        Send quote · {inr(total)}
      </SubmitButton>
    </form>
  );
}
