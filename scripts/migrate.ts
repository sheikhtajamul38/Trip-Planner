// Applies db/schema.sql (idempotent). Usage: DATABASE_URL=postgres://… npm run db:migrate
import { getDb, schemaSql } from "../src/lib/db";

async function main() {
  const db = await getDb();
  await db.exec(schemaSql());
  console.log("Schema applied.");
  process.exit(0);
}

void main();
