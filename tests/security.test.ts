import { beforeEach, describe, expect, it } from "vitest";
import { adminLogin, agencyLogin, changePassword, createAdmin } from "@/lib/accounts";
import { createAgency, setVerification } from "@/lib/agencies";
import { getDb, query, resetDbForTests } from "@/lib/db";
import { todayIST } from "@/lib/format";
import { acceptLead, declineLead, recordPayment, selectQuote, sendQuote } from "@/lib/marketplace";
import { addDays } from "@/lib/planner";
import { agencyBooking, agencyLead } from "@/lib/queries";
import { hit } from "@/lib/ratelimit";
import { signPayload, tripMagicPath, tripToken, verifyPayload, verifyTripToken } from "@/lib/tokens";
import { createTrip, requestQuotes } from "@/lib/trips";
import type { LeadRow } from "@/lib/types";

process.env.DATABASE_URL = "memory://";
delete process.env.OPENAI_API_KEY;

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

beforeEach(async () => {
  resetDbForTests();
  await getDb();
});

describe("trip tokens", () => {
  it("bind to one trip and one purpose", () => {
    const link = tripToken(A, "link");
    expect(verifyTripToken(link, A, "link")).toBe(true);
    expect(verifyTripToken(link, B, "link")).toBe(false);
    expect(verifyTripToken(link, A, "cookie")).toBe(false);
    expect(verifyTripToken(tripToken(A, "cookie"), A, "cookie")).toBe(true);
  });

  it("reject tampering and expiry", () => {
    const t = tripToken(A, "link");
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ trip: B, p: "link", exp: Date.now() + 1e9 })).toString("base64url");
    expect(verifyTripToken(`${forged}.${sig}`, B, "link")).toBe(false);
    expect(verifyTripToken(`${body}.${sig.slice(0, -2)}xx`, A, "link")).toBe(false);
    expect(verifyPayload(signPayload({ x: 1 }, -1))).toBeNull();
    expect(tripMagicPath(A, "/quotes")).toMatch(new RegExp(`^/trip/${A}/access\\?t=.+&next=quotes$`));
  });
});

describe("row level security", () => {
  it("hides every table from Supabase's anon/authenticated roles even if granted", async () => {
    const db = await getDb();
    await createAdmin("rls@example.com", "RLS", "a-strong-password");
    await db.exec(`create role anon; grant usage on schema public to anon; grant all on all tables in schema public to anon;`);
    await db.tx(async (q) => {
      await q.query(`set local role anon`);
      const rows = await q.query(`select * from users`);
      expect(rows).toHaveLength(0);
      await expect(q.query(`insert into agencies (name, phone) values ('x', '+919999999999')`)).rejects.toThrow(/row-level security/);
    });
  });
});

async function agency(name: string, phone: string) {
  const id = await createAgency(
    { name, description: "", phone, coverage: ["srinagar", "gulmarg", "pahalgam", "sonamarg", "doodhpathri", "yusmarg"], minBudget: 0, maxBudget: null, commissionModel: "FREE", commissionRate: 0 },
    { name, accessCode: "agency-code-123" },
  );
  await setVerification(id, "VERIFIED", []);
  return id;
}

describe("agency isolation", () => {
  it("an agency cannot read or act on another agency's lead or booking", async () => {
    const a1 = await agency("One", "9000000101");
    const a2 = await agency("Two", "9000000102");
    const start = addDays(todayIST(), 20);
    const tripId = await createTrip({
      startDate: start, endDate: addDays(start, 4), travellers: 2, budgetMin: 0, budgetMax: null, interests: [],
      hotelCategory: "3-star", activityLevel: "moderate", withKids: false, destinations: [], notes: "",
    });
    await requestQuotes(tripId, { name: "T", phone: "9876512345" });
    const leads = await query<LeadRow>(`select * from leads where trip_id = $1`, [tripId]);
    const l1 = leads.find((l) => l.agency_id === a1)!;

    expect(await agencyLead(l1.id, a2)).toBeNull();
    await expect(acceptLead(l1.id, a2)).rejects.toThrow(/not found/);
    await expect(declineLead(l1.id, a2)).rejects.toThrow(/not found/);

    await acceptLead(l1.id, a1);
    const details = { lineItems: [{ category: "Hotel", label: "x", amount: 1000 }], markup: 0, inclusions: "", exclusions: "", notes: "" };
    await expect(sendQuote(l1.id, a2, details)).rejects.toThrow(/not found/);
    // Contact details stay hidden until the agency itself accepts.
    const l2 = leads.find((l) => l.agency_id === a2)!;
    expect((await agencyLead(l2.id, a2))!.customer).toBeNull();
    expect((await agencyLead(l1.id, a1))!.customer?.phone).toBe("+919876512345");

    const q = await sendQuote(l1.id, a1, details);
    const bookingId = await selectQuote(tripId, q);
    expect(await agencyBooking(bookingId, a2)).toBeNull();
    expect(await agencyBooking(bookingId, a1)).not.toBeNull();
    await recordPayment(bookingId, { amount: 100, type: "DEPOSIT", reference: "r1", recordedBy: "agency" });
    const [p] = await query<{ payment_status: string }>(`select payment_status from payments`);
    expect(p.payment_status).toBe("PENDING"); // agencies can never self-verify
  });
});

describe("accounts", () => {
  it("revokes sessions on password change and rejects wrong passwords", async () => {
    const id = await agency("Three", "9000000103");
    const before = await agencyLogin("9000000103", "agency-code-123");
    expect(before?.agencyId).toBe(id);
    expect(await agencyLogin("9000000103", "wrong-code-xx")).toBeNull();
    const v = await changePassword(before!.userId, "agency-code-123", "a-new-code-456");
    expect(v).toBe(before!.v + 1);
    expect(await agencyLogin("9000000103", "agency-code-123")).toBeNull();
    await expect(changePassword(before!.userId, "nope", "another-code-789")).rejects.toThrow(/current access code/);
    await expect(changePassword(before!.userId, "a-new-code-456", "short")).rejects.toThrow(/at least/);

    await createAdmin("Boss@Example.com", "Boss", "admin-password-1");
    expect(await adminLogin("boss@example.com", "admin-password-1")).not.toBeNull();
    expect(await adminLogin("boss@example.com", "admin-password-2")).toBeNull();
    // Agencies can't log in as admin and vice versa.
    expect(await adminLogin("9000000103", "a-new-code-456")).toBeNull();
  });

  it("deactivated agencies cannot log in", async () => {
    const id = await agency("Four", "9000000104");
    await query(`update agencies set active = false where id = $1`, [id]);
    expect(await agencyLogin("9000000104", "agency-code-123")).toBeNull();
  });
});

describe("rate limiter", () => {
  it("counts within a window", async () => {
    expect(await hit("k", 60)).toBe(1);
    expect(await hit("k", 60)).toBe(2);
    expect(await hit("other", 60)).toBe(1);
    await query(`update rate_limits set window_start = now() - interval '2 minutes'`);
    expect(await hit("k", 60)).toBe(1);
  });
});
