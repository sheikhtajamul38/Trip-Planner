// Creates (or resets) a platform admin and prints a generated password once.
// Usage: npm run admin:create -- you@example.com "Your Name"
import { createAdmin, generatePassword } from "../src/lib/accounts";

async function main() {
  const [email, name = ""] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: npm run admin:create -- you@example.com "Your Name"');
    process.exit(1);
  }
  const password = generatePassword();
  await createAdmin(email, name, password);
  console.log(`Admin ready: ${email}\nPassword (shown once, store it in a password manager): ${password}`);
  process.exit(0);
}

void main();
