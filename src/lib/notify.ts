import type { Queryable } from "./db";

/**
 * Queue a message for a customer or agency. V1 keeps an outbox the admin sends
 * by hand (one-tap WhatsApp links); a WhatsApp Business provider can later
 * drain QUEUED rows without touching the workflow code.
 */
export async function notify(q: Queryable, recipient: string | null | undefined, message: string, path?: string) {
  if (!recipient) return;
  const link = path ? `${process.env.APP_URL ?? "http://localhost:3000"}${path}` : null;
  await q.query(`insert into notifications (recipient, message, link) values ($1, $2, $3)`, [recipient, message, link]);
  if (process.env.NODE_ENV !== "test") console.log(`[notify] → ${recipient}: ${message}${link ? ` ${link}` : ""}`);
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
}
