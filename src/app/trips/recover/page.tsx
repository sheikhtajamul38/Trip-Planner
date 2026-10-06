import { RecoverForm } from "./RecoverForm";

export default async function RecoverPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Open your trip</h1>
      <p className="text-sm text-stone-600">
        {expired ? "That link has expired. " : ""}Trips are private to the browser that created them and to links we send to your WhatsApp. Enter
        your number and we&apos;ll send you fresh links.
      </p>
      <div className="card">
        <RecoverForm />
      </div>
    </div>
  );
}
