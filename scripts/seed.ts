// Creates three demo agencies so the full flow can be tried locally.
// Usage: npm run db:seed
//   agencies: phone 9000000001/2/3, access code "demo-pass-1234"
//   admin:    admin@example.com / "dev-admin-1234"
import { createAdmin } from "../src/lib/accounts";
import { createAgency, setVerification } from "../src/lib/agencies";
import { one } from "../src/lib/db";
import { addCredits } from "../src/lib/marketplace";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed demo data in production.");
    process.exit(1);
  }

  const all = ["srinagar", "gulmarg", "pahalgam", "sonamarg", "doodhpathri", "yusmarg"];
  const demo = [
    { name: "Demo Agency A", phone: "9000000001", coverage: all, model: "FREE" as const },
    { name: "Demo Agency B", phone: "9000000002", coverage: all, model: "LEAD_FEE" as const },
    { name: "Demo Agency C", phone: "9000000003", coverage: ["srinagar", "gulmarg", "sonamarg", "doodhpathri"], model: "FREE" as const },
  ];

  for (const a of demo) {
    if (await one(`select 1 from agencies where name = $1`, [a.name])) {
      console.log(`${a.name} already exists`);
      continue;
    }
    const id = await createAgency(
      {
        name: a.name,
        description: "Demo operator for local testing",
        phone: a.phone,
        coverage: a.coverage,
        minBudget: 0,
        maxBudget: null,
        commissionModel: a.model,
        commissionRate: 0,
      },
      { name: a.name, accessCode: "demo-pass-1234" },
    );
    await setVerification(id, "VERIFIED", ["Demo — not a real business"]);
    if (a.model === "LEAD_FEE") await addCredits(id, 20, "demo credits");
    console.log(`Created ${a.name} (login ${a.phone} / demo-pass-1234)`);
  }
  await createAdmin("admin@example.com", "Dev admin", "dev-admin-1234");
  console.log("Dev admin: admin@example.com / dev-admin-1234");
  process.exit(0);
}

void main();
