import { requireAgency } from "@/lib/auth";
import { ChangeCodeForm } from "./ChangeCodeForm";

export default async function AgencySettings() {
  await requireAgency();
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-xl font-bold">Change access code</h1>
      <div className="card">
        <ChangeCodeForm />
      </div>
    </div>
  );
}
