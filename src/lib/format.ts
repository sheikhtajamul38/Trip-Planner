export function inr(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}

/** Compact form used in dashboards: ₹1.4L, ₹68.5k. */
export function inrShort(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(amount >= 1000000 ? 0 : 1).replace(/\.0$/, "")}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${amount}`;
}

export function fmtDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00Z" : d) : d;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/** Today's date in India, YYYY-MM-DD. */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function budgetLabel(min: number, max: number | null): string {
  if (!max) return `${inrShort(min)}+`;
  if (!min) return `under ${inrShort(max)}`;
  return `${inrShort(min)}–${inrShort(max)}`;
}
