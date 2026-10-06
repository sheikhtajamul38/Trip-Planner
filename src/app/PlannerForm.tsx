"use client";

import { useActionState, useState, useTransition } from "react";
import { FormError, SubmitButton } from "@/components/ui";
import { BUDGET_OPTIONS, DESTINATIONS, DESTINATION_IDS, type Interest } from "@/lib/destinations";
import { type ActionState, createTripAction, extractAction } from "./actions";

const INTEREST_LABELS: Record<Interest, string> = {
  mountains: "🏔️ Mountains",
  snow: "❄️ Snow",
  culture: "🕌 Culture",
  food: "🍲 Food",
  relaxation: "🛶 Relaxation",
  adventure: "🧗 Adventure",
};

function budgetIdFor(max: number | null | undefined, min: number | undefined): string {
  const v = max ?? min;
  if (v == null) return "";
  return (BUDGET_OPTIONS.find((b) => b.max == null || v <= b.max) ?? BUDGET_OPTIONS[BUDGET_OPTIONS.length - 1]).id;
}

export function PlannerForm({ today }: { today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(createTripAction, undefined);
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [extracting, startExtract] = useTransition();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travellers, setTravellers] = useState(2);
  const [withKids, setWithKids] = useState(false);
  const [budget, setBudget] = useState("50-75k");
  const [interests, setInterests] = useState<Interest[]>(["mountains", "snow"]);
  const [hotel, setHotel] = useState("3-star");
  const [pace, setPace] = useState("moderate");
  const [destinations, setDestinations] = useState<string[]>([]);

  function fillFromDescription() {
    startExtract(async () => {
      const r = await extractAction(description);
      if (r.startDate) setStartDate(r.startDate);
      if (r.endDate) setEndDate(r.endDate);
      if (r.travellers) setTravellers(r.travellers);
      if (r.withKids != null) setWithKids(r.withKids);
      if (r.interests?.length) setInterests(r.interests);
      if (r.activityLevel) setPace(r.activityLevel);
      if (r.hotelCategory) setHotel(r.hotelCategory);
      const b = budgetIdFor(r.budgetMax, r.budgetMin);
      if (b) setBudget(b);
      if (r.destinations?.length) setDestinations(r.destinations);
      setQuestions(r.questions);
    });
  }

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="space-y-5">
      <div className="card space-y-3">
        <label htmlFor="describe" className="block text-base font-semibold text-stone-900">
          Tell us about your trip <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <textarea
          id="describe"
          rows={3}
          className="w-full"
          placeholder="e.g. We're 4 people coming for 5 days in January with our kids. Want snow but nothing too hectic."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="button" className="btn-secondary" disabled={!description.trim() || extracting} onClick={fillFromDescription}>
          {extracting ? "Reading…" : "✨ Fill in the form for me"}
        </button>
        {questions.length > 0 && (
          <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
            <p className="font-semibold">Got it! A couple of quick questions:</p>
            <ul className="mt-1 list-disc pl-5">
              {questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <form action={action} className="card space-y-6">
        <fieldset className="space-y-2">
          <legend className="text-base font-semibold">When are you travelling?</legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="startDate">Arrive</label>
              <input id="startDate" name="startDate" type="date" required min={today} value={startDate} onChange={(e) => {
                setStartDate(e.target.value);
                if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
              }} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="endDate">Depart</label>
              <input id="endDate" name="endDate" type="date" required min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-base font-semibold">Travellers</legend>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary h-10 w-10 p-0" aria-label="Fewer travellers" onClick={() => setTravellers(Math.max(1, travellers - 1))}>
                −
              </button>
              <input name="travellers" readOnly value={travellers} className="w-14 text-center" aria-label="Travellers" />
              <button type="button" className="btn-secondary h-10 w-10 p-0" aria-label="More travellers" onClick={() => setTravellers(Math.min(50, travellers + 1))}>
                +
              </button>
            </div>
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" name="withKids" checked={withKids} onChange={(e) => setWithKids(e.target.checked)} /> Travelling with children
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-base font-semibold">Budget for the whole trip</legend>
          <div className="flex flex-wrap gap-2">
            {BUDGET_OPTIONS.map((b) => (
              <label key={b.id} className="chip">
                <input type="radio" name="budget" value={b.id} checked={budget === b.id} onChange={() => setBudget(b.id)} className="sr-only" />
                {b.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-base font-semibold">What interests you?</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(INTEREST_LABELS) as Interest[]).map((i) => (
              <label key={i} className="chip">
                <input type="checkbox" name="interests" value={i} checked={interests.includes(i)} onChange={() => setInterests(toggle(interests, i))} className="sr-only" />
                {INTEREST_LABELS[i]}
              </label>
            ))}
          </div>
        </fieldset>

        <details className="space-y-3" open={destinations.length > 0 || undefined}>
          <summary className="cursor-pointer text-sm font-semibold text-brand-700">More preferences (hotels, pace, must-see places)</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="hotelCategory">Hotels</label>
              <select id="hotelCategory" name="hotelCategory" value={hotel} onChange={(e) => setHotel(e.target.value)}>
                <option value="standard">Standard / budget</option>
                <option value="3-star">3-star</option>
                <option value="4-star">4-star</option>
                <option value="luxury">5-star / luxury</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="activityLevel">Pace</label>
              <select id="activityLevel" name="activityLevel" value={pace} onChange={(e) => setPace(e.target.value)}>
                <option value="relaxed">Relaxed — fewer moves, more time</option>
                <option value="moderate">Balanced</option>
                <option value="active">Packed — see as much as possible</option>
              </select>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <span className="text-sm font-medium text-stone-700">Must-see places</span>
            <div className="flex flex-wrap gap-2">
              {DESTINATION_IDS.filter((d) => d !== "srinagar").map((d) => (
                <label key={d} className="chip">
                  <input type="checkbox" name="destinations" value={d} checked={destinations.includes(d)} onChange={() => setDestinations(toggle(destinations, d))} className="sr-only" />
                  {DESTINATIONS[d].name}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <label htmlFor="notes">Anything else?</label>
            <textarea id="notes" name="notes" rows={2} placeholder="Elderly parents, honeymoon, vegetarian food…" defaultValue={description} />
          </div>
        </details>

        <FormError error={state?.error} />
        <SubmitButton className="btn-primary w-full py-3 text-base" pending="Building your trip…">
          Build my trip
        </SubmitButton>
      </form>
    </div>
  );
}
