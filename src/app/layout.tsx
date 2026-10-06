import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kashmir Trip Planner",
  description: "The easiest way to plan and book a Kashmir trip. Plan with AI, compare verified local operators, book with confidence.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#17726c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold text-brand-700">
              <span aria-hidden className="text-xl">🏔️</span> Kashmir Trip Planner
            </Link>
            <nav className="flex gap-4 text-sm text-stone-600">
              <Link href="/" className="hover:text-brand-700">Plan a trip</Link>
              <Link href="/agency" className="hover:text-brand-700">For operators</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-stone-500">
          Estimates are indicative. Bookings are fulfilled by independent, platform-verified local operators.
        </footer>
      </body>
    </html>
  );
}
