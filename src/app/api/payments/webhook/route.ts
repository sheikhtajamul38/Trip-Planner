import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { verifyPaymentByReference } from "@/lib/marketplace";
import { WorkflowError } from "@/lib/types";

/**
 * Generic payment-provider webhook. Expects a JSON body
 *   { "reference": "<payment_provider_reference>", "status": "captured" | "failed" }
 * signed with HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, rawBody) in the `x-signature` header (hex).
 * Adapt the parsing to your provider's payload; the state change stays in marketplace.ts.
 */
export async function POST(req: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });

  const raw = await req.text();
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const given = req.headers.get("x-signature") ?? "";
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: { reference?: string; status?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.reference || !body.status) return NextResponse.json({ error: "reference and status required" }, { status: 400 });

  const status = ["captured", "paid", "success", "verified"].includes(body.status.toLowerCase()) ? "VERIFIED" : "FAILED";
  try {
    const id = await verifyPaymentByReference(body.reference, status);
    return NextResponse.json({ ok: true, paymentId: id, status });
  } catch (err) {
    if (err instanceof WorkflowError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
