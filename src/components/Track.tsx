"use client";

import { useEffect } from "react";

export function track(name: "visit" | "planner_started") {
  try {
    void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }), keepalive: true });
  } catch {
    // analytics must never break the page
  }
}

export function TrackVisit() {
  useEffect(() => track("visit"), []);
  return null;
}
