import { beforeEach, describe, expect, it } from "vitest";
import { createAgency, setVerification } from "@/lib/agencies";
import { getDb, query, resetDbForTests } from "@/lib/db";
import { addDays } from "@/lib/planner";
import { todayIST } from "@/lib/format";
import {
  acceptLead,
  addCredits,
  completeTrip,
  markQuotesViewed,
  recordPayment,
  selectQuote,
  sendQuote,
  setPaymentStatus,
  submitReview,
} from "@/lib/marketplace";
import { createTrip, editTrip, requestQuotes } from "@/lib/trips";
import type { BookingRow, LeadRow, QuoteRow, TripRow } from "@/lib/types";

process.env.DATABASE_URL = "memory://";
delete process.env.OPENAI_API_KEY;

const start = addDays(todayIST(), 30);

async function agency(name: string, phone: string, coverage: string[], model: "FREE" | "LEAD_FEE" = "FREE") {
  const id = await createAgency(
    {
      name,
      description: "",
      phone,
      coverage,
      minBudget: 0,
      maxBudget: null,
      commissionModel: model,
      commissionRate: 0,
    },
    { name, accessCode: "secret123" },
  );
  await setVerification(id, "VERIFIED", ["Phone verified"]);
  return id;
}

async function newTrip() {
  return createTrip({
    startDate: start,
    endDate: addDays(start, 5),
    travellers: 2,
    budgetMin: 50000,
    budgetMax: 75000,
    interests: ["mountains", "snow"],
    hotelCategory: "3-star",
    activityLevel: "moderate",
    withKids: false,
    destinations: [],
    notes: "",
  });
}

const details = {
  lineItems: [
    { category: "Hotel", label: "Srinagar 3-star, 2 nights", amount: 9000 },
    { category: "Transport", label: "Innova, 6 days", amount: 24000 },
  ],
  markup: 5000,
  inclusions: "Breakfast",
  exclusions: "Flights",
  notes: "",
};

beforeEach(async () => {
  resetDbForTests();
  await getDb();
});

describe("trip → lead → quote → booking → payment → review", () => {
  it("runs the full happy path with a deterministic audit trail", async () => {
    const all = ["srinagar", "gulmarg", "pahalgam", "sonamarg", "doodhpathri", "yusmarg"];
    const a1 = await agency("Alpha Travels", "9000000001", all);
    const a2 = await agency("Beta Tours", "9000000002", all, "LEAD_FEE");
    await addCredits(a2, 2, "test");
    await agency("Gamma Holidays", "9000000003", all);
    await agency("Delta (no coverage)", "9000000004", ["yusmarg"]);

    const tripId = await newTrip();
    const { matched } = await requestQuotes(tripId, { name: "Rahul", phone: "98765 43210" });
    expect(matched).toBe(3);

    const leads = await query<LeadRow>(`select * from leads where trip_id = $1`, [tripId]);
    const l1 = leads.find((l) => l.agency_id === a1)!;
    const l2 = leads.find((l) => l.agency_id === a2)!;
    expect(l1 && l2).toBeTruthy();

    await expect(sendQuote(l1.id, a1, details)).rejects.toThrow(/Accept the lead/);
    await acceptLead(l1.id, a1);
    await acceptLead(l2.id, a2);
    const [{ lead_credits }] = await query<{ lead_credits: number }>(`select lead_credits from agencies where id = $1`, [a2]);
    expect(lead_credits).toBe(1);

    // Total is computed server-side from line items + markup.
    const q1 = await sendQuote(l1.id, a1, details);
    const [quote] = await query<QuoteRow>(`select * from quotes where id = $1`, [q1]);
    expect(quote.amount).toBe(38000);
    await sendQuote(l2.id, a2, { ...details, markup: 9000 });

    // Customer changes the plan: sent quotes are superseded and agencies re-price.
    const edit = await editTrip(tripId, "Replace Gulmarg with Pahalgam");
    expect(edit.understood).toBe(true);
    expect(edit.requotes).toBe(2);
    const trip = (await query<TripRow>(`select * from trips where id = $1`, [tripId]))[0];
    expect(trip.ai_itinerary.stays.map((s) => s.destination)).toContain("pahalgam");
    expect(trip.ai_itinerary.stays.map((s) => s.destination)).not.toContain("gulmarg");
    const q1b = await sendQuote(l1.id, a1, { ...details, markup: 6000 });

    await markQuotesViewed(tripId);
    const [viewed] = await query<LeadRow>(`select * from leads where id = $1`, [l1.id]);
    expect(viewed.status).toBe("CUSTOMER_VIEWED");

    await expect(selectQuote(tripId, q1)).rejects.toThrow(/no longer available/);
    const bookingId = await selectQuote(tripId, q1b);
    await expect(selectQuote(tripId, q1b)).rejects.toThrow(/already booked/);

    const statuses = await query<{ agency_id: string; status: string }>(`select agency_id, status from leads where trip_id = $1`, [tripId]);
    expect(statuses.find((s) => s.agency_id === a1)!.status).toBe("SELECTED");
    expect(statuses.find((s) => s.agency_id === a2)!.status).toBe("LOST");

    // A pending payment does not confirm the booking; a verified one does.
    const p = await recordPayment(bookingId, { amount: 5000, type: "DEPOSIT", reference: "UTR123", recordedBy: "agency" });
    let [booking] = await query<BookingRow>(`select * from bookings where id = $1`, [bookingId]);
    expect(booking.status).toBe("PENDING_DEPOSIT");
    await setPaymentStatus(p, "VERIFIED", "admin");
    [booking] = await query<BookingRow>(`select * from bookings where id = $1`, [bookingId]);
    expect(booking.status).toBe("CONFIRMED");

    await expect(completeTrip(tripId, "tourist")).rejects.toThrow(/once your trip has ended/);
    await completeTrip(tripId, "admin", { force: true });
    await submitReview(tripId, 5, "Wonderful");
    await expect(submitReview(tripId, 4, "again")).rejects.toThrow(/already reviewed/);

    const events = await query<{ event: string }>(`select event from events order by id`);
    expect(events.map((e) => e.event)).toEqual(
      expect.arrayContaining(["quotes_requested", "accepted", "sent", "itinerary_edited", "created", "confirmed", "completed"]),
    );
  });

  it("does not match lead-fee agencies without credits and refuses to accept without credits", async () => {
    const all = ["srinagar", "gulmarg", "pahalgam", "sonamarg"];
    const broke = await agency("No Credit Co", "9000000011", all, "LEAD_FEE");
    const tripId = await newTrip();
    const { matched } = await requestQuotes(tripId, { name: "Asha", phone: "9876500000" });
    expect(matched).toBe(0);

    // Manually assigned by admin anyway → accepting still needs a credit.
    await query(`insert into leads (trip_id, agency_id) values ($1, $2)`, [tripId, broke]);
    const [lead] = await query<LeadRow>(`select * from leads where trip_id = $1`, [tripId]);
    await expect(acceptLead(lead.id, broke)).rejects.toThrow(/no lead credits/);
  });

  it("rejects invalid trips and phone numbers", async () => {
    await expect(
      createTrip({
        startDate: addDays(todayIST(), -3),
        endDate: addDays(todayIST(), 2),
        travellers: 2,
        budgetMin: 0,
        budgetMax: null,
        interests: [],
        hotelCategory: "standard",
        activityLevel: "moderate",
        withKids: false,
        destinations: [],
        notes: "",
      }),
    ).rejects.toThrow(/past/);
    const tripId = await newTrip();
    await expect(requestQuotes(tripId, { name: "X", phone: "123" })).rejects.toThrow(/valid WhatsApp/);
  });
});
