"use client";

import { useActionState, useState, useTransition } from "react";
import { FormError, SubmitButton } from "@/components/ui";
import { type ActionState, askAction, editTripAction, requestQuotesAction } from "@/app/actions";

export function EditItinerary({ tripId }: { tripId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(editTripAction.bind(null, tripId), undefined);
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <input name="request" className="min-w-0 flex-1" placeholder='e.g. "Replace Pahalgam with Sonamarg"' maxLength={500} />
        <SubmitButton className="btn-secondary" pending="Updating…">
          Update
        </SubmitButton>
      </div>
      <FormError error={state?.error} />
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}

export function AskAI({ tripId, initial }: { tripId: string; initial: { role: "user" | "assistant"; content: string }[] }) {
  const [messages, setMessages] = useState(initial);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    setError(undefined);
    setMessages((m) => [...m, { role: "user", content: q }]);
    start(async () => {
      const res = await askAction(tripId, q);
      if (res.answer) setMessages((m) => [...m, { role: "assistant", content: res.answer! }]);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      {messages.length > 0 && (
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "ml-8 bg-brand-600 text-white" : "mr-8 bg-stone-100 text-stone-800"}`}
            >
              {m.content}
            </div>
          ))}
          {pending && <div className="mr-8 rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-500">Thinking…</div>}
        </div>
      )}
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="min-w-0 flex-1"
          placeholder="What should we pack? Is Gulmarg OK for kids?"
          maxLength={1000}
        />
        <button className="btn-secondary" disabled={pending || !question.trim()}>
          Ask
        </button>
      </form>
      <FormError error={error} />
    </div>
  );
}

export function RequestQuotes({ tripId }: { tripId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(requestQuotesAction.bind(null, tripId), undefined);
  return (
    <form action={action} className="space-y-3">
      <ul className="space-y-1 text-sm text-stone-700">
        <li>✓ 2–3 verified local operators</li>
        <li>✓ No obligation</li>
        <li>✓ Compare offers side by side</li>
      </ul>
      <div className="flex flex-col gap-1">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required autoComplete="name" maxLength={100} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="phone">WhatsApp number</label>
        <input id="phone" name="phone" required type="tel" autoComplete="tel" placeholder="+91 98765 43210" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email">
          Email <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <input id="email" name="email" type="email" autoComplete="email" />
      </div>
      <FormError error={state?.error} />
      <SubmitButton className="btn-primary w-full py-3" pending="Sending to operators…">
        Get my quotes
      </SubmitButton>
      <p className="text-xs text-stone-500">We only share your details with the operators who accept your request.</p>
    </form>
  );
}
