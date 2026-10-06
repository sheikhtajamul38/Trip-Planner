# Pilot launch checklist

Work through this before real customers or agencies use the app. Items marked **(code)** are
already done in the codebase; the rest are configuration you do once.

## Access and authorization

- **(code)** Tourists: a trip is readable and writable only from the browser that created it
  (signed per-trip cookie) or via a signed magic link sent to their WhatsApp (valid 14 days). Every
  tourist server action re-checks access, since a bound trip id is client-controlled. Lost links:
  `/trips/recover` queues fresh links to the number on file and gives the same reply whether or
  not the number exists.
- **(code)** Agencies: they log in with phone + access code (10+ chars, scrypt-hashed). Every query
  and mutation is scoped to the session's agency, and customer contact details appear only after
  the agency accepts the lead. Agencies can record a payment but can never verify one.
- **(code)** Admins: real accounts (`npm run admin:create`), with no shared password.
- **(code)** Sessions are re-checked against the database on every request. Changing a password,
  resetting an agency code or deactivating an agency signs that account out everywhere.
- **(code)** Rate limits (stored in Postgres): planning, AI questions, quote requests, link
  recovery and logins (per IP and per account).
- **(code)** Security headers: CSP, frame-ancestors none, nosniff, HSTS, `no-store` on private pages.
- Create your admin account in production and **do not** run `npm run db:seed` there (the seed refuses
  when `NODE_ENV=production`).
- Change the demo agency codes, or better, create real agencies from `/admin/agencies`.

## Supabase

- **(code)** Row Level Security is enabled on every table, and all grants to `anon`/`authenticated` are
  revoked. The app connects server-side as the table owner, so Supabase's public REST/GraphQL API
  exposes nothing. Test it: with the project's anon key,
  `curl "$SUPABASE_URL/rest/v1/trips" -H "apikey: $ANON_KEY"` must return an error or `[]`.
- Use a **separate production project**. Never put the `service_role` key or the database URL in
  any `NEXT_PUBLIC_*` variable, because the app doesn't need either in the browser.
- Database → Settings: **enforce SSL**, and add **network restrictions** if your host has fixed egress IPs.
- Enable **MFA** on every Supabase account in the organization.
- Enable **Point-in-Time Recovery** (or at least confirm daily backups on your plan) and do one test restore.
- Use the connection pooler URL for serverless hosting and set `DATABASE_POOL_SIZE` small (e.g. 3).

## Hosting (e.g. Vercel)

- Environment variables (Production only): `DATABASE_URL`, `SESSION_SECRET` (32+ random chars),
  `APP_URL` (your https domain, used in magic links), `OPENAI_API_KEY`, `OPENAI_MODEL`,
  `PAYMENT_WEBHOOK_SECRET` if you use the webhook.
- **(code)** Errors are logged as JSON lines through `src/instrumentation.ts` (path only, never query
  strings that might carry tokens). Attach a log drain or add Sentry there.
- Set a spending limit on the OpenAI key.

## AI

- Run `OPENAI_API_KEY=... npm run ai:eval` and read every answer it prints. Re-run it whenever you change
  a prompt or the model.
- **(code)** The AI cannot change bookings, quotes or payments: it only returns text or a structured
  route edit, which deterministic code applies. Edits are refused once a trip is booked.

## Pricing

- Collect real rates with `docs/pricing-survey.md`, update `src/lib/destinations.ts`, and set
  `PRICING_META.status = "validated"`. Until then the admin dashboard shows a warning.

## Operations during the pilot

- WhatsApp messages (including customers' magic links) wait in the admin **WhatsApp outbox**. Send them
  by hand promptly, because a customer who switches devices depends on that link.
- Check **Missed response targets** and **Needs matching** a few times a day.
