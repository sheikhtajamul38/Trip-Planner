import { NextResponse } from "next/server";
import { grantTripAccess } from "@/lib/auth";
import { isTripPage, verifyTripToken } from "@/lib/tokens";

/** Magic-link landing: swap the link token for this browser's trip cookie, then drop the token from the URL. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const next = `/${url.searchParams.get("next") ?? ""}`.replace(/\/$/, "");
  const base = process.env.APP_URL ?? url.origin;
  if (!verifyTripToken(url.searchParams.get("t"), id, "link")) {
    return NextResponse.redirect(new URL("/trips/recover?expired=1", base));
  }
  await grantTripAccess(id);
  const res = NextResponse.redirect(new URL(`/trip/${id}${isTripPage(next) ? next : ""}`, base));
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
