import { describe, expect, it } from "vitest";
import { heuristicEdit, heuristicExtract, hotelForBudget } from "@/lib/ai";
import { type TripRequirements, applyDestinationEdit, buildItinerary, planStays, tripDays } from "@/lib/planner";
import { scoreAgency } from "@/lib/matching";

const base: TripRequirements = {
  startDate: "2027-01-12",
  endDate: "2027-01-18",
  travellers: 2,
  budgetMin: 50000,
  budgetMax: 75000,
  interests: ["mountains", "snow"],
  hotelCategory: "3-star",
  activityLevel: "moderate",
  withKids: false,
};

describe("planner", () => {
  it("covers every night and every day", () => {
    for (const [start, end] of [
      ["2027-01-12", "2027-01-12"],
      ["2027-01-12", "2027-01-13"],
      ["2027-05-01", "2027-05-04"],
      ["2027-05-01", "2027-05-15"],
    ]) {
      for (const level of ["relaxed", "moderate", "active"] as const) {
        const req = { ...base, startDate: start, endDate: end, activityLevel: level };
        const it = buildItinerary(req);
        expect(it.days).toHaveLength(tripDays(start, end));
        expect(it.stays.reduce((s, x) => s + x.nights, 0)).toBe(Math.max(tripDays(start, end) - 1, 0));
        expect(it.stays[0].destination).toBe("srinagar");
        expect(it.estimate.min).toBeLessThan(it.estimate.max);
      }
    }
  });

  it("prefers Gulmarg for a winter snow trip", () => {
    expect(planStays(base).map((s) => s.destination)).toContain("gulmarg");
  });

  it("skips meadow day trips that are closed in winter", () => {
    const it = buildItinerary({ ...base, endDate: "2027-01-25", interests: ["relaxation"] });
    expect(it.days.some((d) => /Doodhpathri|Yusmarg/.test(d.title))).toBe(false);
  });

  it("applies replace edits", () => {
    const stays = planStays(base);
    const req = applyDestinationEdit(base, stays, { add: ["pahalgam"], remove: ["gulmarg"] });
    const names = planStays(req).map((s) => s.destination);
    expect(names).toContain("pahalgam");
    expect(names).not.toContain("gulmarg");
  });

  it("gives every requested stop at least one night on a relaxed trip", () => {
    const req = { ...base, startDate: "2027-11-15", endDate: "2027-11-20", activityLevel: "relaxed" as const };
    const edited = applyDestinationEdit(req, planStays(req), { add: ["sonamarg"], remove: ["pahalgam"] });
    const stays = planStays(edited);
    expect(stays.map((s) => s.destination)).toEqual(expect.arrayContaining(["gulmarg", "sonamarg"]));
    expect(stays.every((s) => s.nights > 0)).toBe(true);
  });

  it("flags plans over budget", () => {
    const it = buildItinerary({ ...base, hotelCategory: "luxury", budgetMax: 30000 });
    expect(it.notes.join(" ")).toMatch(/above your budget/);
  });
});

describe("heuristic AI fallbacks", () => {
  it("extracts requirements from a family request", () => {
    const r = heuristicExtract("We're coming for 5 days with our kids. Want snow but don't want anything too hectic.", "2026-10-06");
    expect(r.durationDays).toBe(5);
    expect(r.withKids).toBe(true);
    expect(r.interests).toContain("snow");
    expect(r.activityLevel).toBe("relaxed");
    expect(r.startDate).toBeUndefined();
  });

  it("parses dates, travellers and budget", () => {
    const r = heuristicExtract("4 people from 12 Jan to 18 Jan, budget 80k, 4-star, Gulmarg and Pahalgam", "2026-10-06");
    expect(r.startDate).toBe("2027-01-12");
    expect(r.endDate).toBe("2027-01-18");
    expect(r.travellers).toBe(4);
    expect(r.budgetMax).toBe(80000);
    expect(r.hotelCategory).toBe("4-star");
    expect(r.destinations).toEqual(["gulmarg", "pahalgam"]);
  });

  it("handles Hinglish, typos and tight budgets", async () => {
    const r = heuristicExtract("hum 4 log hai, 5 din, bacche bhi hai, barf dekhni hai, gulmrg jana hai", "2026-10-06");
    expect(r).toMatchObject({ travellers: 4, durationDays: 5, withKids: true, destinations: ["gulmarg"] });
    expect(r.interests).toContain("snow");
    expect(hotelForBudget({ budgetMax: 40000, travellers: 4, durationDays: 5 })).toBe("standard");
    expect(heuristicEdit("pahalgam ki jagah sonmarg kar do")).toMatchObject({ add: ["sonamarg"], remove: ["pahalgam"] });
    expect(heuristicEdit("I don't like this hotel").understood).toBe(false);
    expect(heuristicEdit("Cancel my booking").understood).toBe(false);
  });

  it("makes a plan cheaper by stepping hotels down, deterministically", () => {
    const edit = heuristicEdit("Make it cheaper");
    expect(edit.hotelChange).toBe("down");
    const cheaper = applyDestinationEdit(base, planStays(base), edit);
    expect(cheaper.hotelCategory).toBe("standard");
    expect(buildItinerary(cheaper).estimate.max).toBeLessThan(buildItinerary(base).estimate.max);
    expect(applyDestinationEdit({ ...base, hotelCategory: "standard" }, planStays(base), edit).hotelCategory).toBe("standard");
  });

  it("understands replace requests", () => {
    expect(heuristicEdit("Can we replace Pahalgam with Sonamarg?")).toMatchObject({ add: ["sonamarg"], remove: ["pahalgam"], understood: true });
    expect(heuristicEdit("Sonamarg instead of Pahalgam please")).toMatchObject({ add: ["sonamarg"], remove: ["pahalgam"] });
    expect(heuristicEdit("make it less hectic").activityLevel).toBe("relaxed");
  });
});

describe("matching", () => {
  const trip = { budget_min: 50000, budget_max: 75000 };
  it("requires destination coverage and budget fit", () => {
    const stats = { responseRate: null, openLeads: 0 };
    expect(scoreAgency({ coverage: ["yusmarg"], min_budget: 0, max_budget: null }, trip, ["srinagar", "gulmarg"], stats)).toBeNull();
    expect(scoreAgency({ coverage: ["srinagar", "gulmarg"], min_budget: 100000, max_budget: null }, trip, ["srinagar", "gulmarg"], stats)).toBeNull();
    const good = scoreAgency({ coverage: ["srinagar", "gulmarg"], min_budget: 0, max_budget: null }, trip, ["srinagar", "gulmarg"], stats);
    const busy = scoreAgency({ coverage: ["srinagar", "gulmarg"], min_budget: 0, max_budget: null }, trip, ["srinagar", "gulmarg"], { ...stats, openLeads: 5 });
    expect(good!.score).toBeGreaterThan(busy!.score);
  });
});
