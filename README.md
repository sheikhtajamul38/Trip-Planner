# Kashmir Trip Planner — MVP

A free AI trip planner for Kashmir that turns planning into qualified leads for verified local operators, and keeps the full transaction record on the platform:

```
Trip → Lead → Quote → Booking → Payment → Completed trip → Verified review
```

**Plan → Qualify → Match → Quote → Choose → Track.** That's all V1 does.

## What's in it

| Who | Screens |
| --- | --- |
| Tourist | `/` trip planner (form, or describe the trip and AI fills it in) · `/trip/[id]` day-by-day plan, budget estimate, *change itinerary*, *ask anything*, *get quotes* · `/trip/[id]/quotes` compare operators · `/trip/[id]/booking` trip dashboard (status, payments, message operator, report issue, confirm completion, verified review) |
| Agency | `/agency` dashboard (new leads, quotes pending, bookings, revenue pipeline) · `/agency/leads/[id]` enquiry + quote builder · `/agency/bookings` record payments received |
| Platform admin | `/admin` funnel, agency performance, popular destinations, manual matching queue, payment verification, open issues, WhatsApp outbox · `/admin/agencies` onboarding, verification, lead credits · `/admin/trips/[id]` full audit trail |

## Design rules

- **AI does language, code does money and state.** OpenAI extracts requirements, words the itinerary, answers questions, interprets change requests and summarises quotes. Routing, the budget estimate, agency matching, quote totals, booking and payment status are deterministic code (`src/lib/planner.ts`, `matching.ts`, `marketplace.ts`). Every AI call has a non-AI fallback, so the app works without an API key.
- **No invented numbers.** Ratings come only from verified reviews of completed trips, and response time and trip counts come only from platform data. None of them is shown until there are at least 3 data points. "Platform verified" lists only what the admin actually checked.
- **V1 does not hold customer money.** The customer pays the deposit to the operator. The operator records the payment and reference, and an admin verifies it (or a signed provider webhook does, at `/api/payments/webhook`). The booking is confirmed only after a verified deposit. Get Indian legal and tax advice before you add split settlements or escrow.
- **Lead-fee model built in.** An agency is either `FREE` (early partners) or `LEAD_FEE` with prepaid credits. Accepting a lead uses one credit and reveals the customer's contact details. Credits are kept in a ledger (`credit_transactions`).
- **Run the first transactions by hand.** Unmatched trips show up in the admin queue so you can assign agencies. Notifications go to an outbox with one-tap WhatsApp links until a WhatsApp Business provider is connected.
- **Everything is audited.** Every state change writes to `events`.

## Running locally

```bash
npm install
cp .env.example .env.local     # optional: add OPENAI_API_KEY
npm run db:seed                # 3 demo agencies, login 9000000001/2/3 + "demo1234"
npm run dev
```

If `DATABASE_URL` is empty, the app uses an embedded PGlite database in `./.data`, so there's nothing to install. In development the admin password is `admin` unless `ADMIN_PASSWORD` is set.

## Production (Supabase + Vercel)

1. Create a Supabase project and set `DATABASE_URL` to its Postgres connection string (use the pooler URL on serverless).
2. Run `npm run db:migrate` (it applies `db/schema.sql` and is safe to re-run).
3. Set `SESSION_SECRET`, `ADMIN_PASSWORD`, `APP_URL`, `OPENAI_API_KEY` and, optionally, `PAYMENT_WEBHOOK_SECRET` and `DEPOSIT_AMOUNT` (default ₹5,000).
4. Deploy to Vercel.

## Tests

```bash
npm test        # planner, AI fallbacks, matching, and the full trip→review workflow on in-memory Postgres
npm run lint    # typecheck
```

## Deliberately not built yet

Hotel inventory integration, live taxi tracking, wallets and automated refunds, native apps, voice AI, loyalty, and a WhatsApp provider integration (the outbox is ready for it).
