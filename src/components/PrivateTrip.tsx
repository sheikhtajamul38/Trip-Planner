import Link from "next/link";

export function PrivateTrip() {
  return (
    <div className="mx-auto max-w-md space-y-3 text-center">
      <h1 className="text-2xl font-bold">This trip is private</h1>
      <p className="text-sm text-stone-600">
        Open it from the browser you planned it in, or from the link we sent to your WhatsApp.
      </p>
      <div className="flex justify-center gap-2">
        <Link href="/trips/recover" className="btn-primary">
          Send me my link
        </Link>
        <Link href="/" className="btn-secondary">
          Plan a new trip
        </Link>
      </div>
    </div>
  );
}
