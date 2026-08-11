// Onboards a new division: creates its Office row plus the single
// DIVISION_CHIEF account that bootstraps it. Run once per division.
//
// This exists because account creation is deliberately office-scoped —
// POST /api/users always takes officeId from the caller's session, so a Chief
// can never reach another division. That is the property holding office
// isolation together (there is no Postgres RLS), and it also means a brand-new
// division has nobody who can create its first account. This script is the
// only sanctioned way in: it runs on the server, by an operator who already
// has filesystem access, instead of granting some role a permanent
// cross-division power inside the app.
//
// Once the Chief exists they staff their own division through Settings; this
// script is not needed again for that office.
//
// Usage:
//   npm run onboard-division -- --name "Finance and Administrative Division" \
//     --code FAD --chief-name "Juan Dela Cruz" --chief-username juan.delacruz \
//     --password 'Str0ng!pass' [--chief-email juan@example.com] [--dry-run]
//
// Targets whichever database DATABASE_URL points at. Loaded from .env, which
// per CLAUDE.md is the *deployment* database on port 5433 — not the .env.local
// one used by `npm run dev`. Check which you mean before running.

import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { passwordProblem, PASSWORD_RULE_TEXT } from "../src/lib/passwordPolicy";

const REPO_ROOT = join(__dirname, "..");

// Minimal .env reader. Prisma's CLI loads .env for us, but a bare ts-node
// process does not, and dotenv is not a top-level dependency here — rather
// than add one for a script run four times, parse the handful of lines we
// need. Real environment variables always win, so an operator can override
// DATABASE_URL inline without editing the file.
function loadEnvFile(): void {
  let contents: string;
  try {
    contents = readFileSync(join(REPO_ROOT, ".env"), "utf8");
  } catch {
    return; // no .env is fine if DATABASE_URL is already exported
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq !== -1) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    // A flag with no value (--dry-run) is followed by nothing or another --flag.
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function requireString(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    fail(`Missing --${key}. See the usage comment at the top of this file.`);
  }
  return value.trim();
}

const prisma = new PrismaClient();

async function main() {
  loadEnvFile();

  const args = parseArgs(process.argv.slice(2));
  const dryRun = args["dry-run"] === true;

  const name = requireString(args, "name");
  const chiefName = requireString(args, "chief-name");
  const chiefUsername = requireString(args, "chief-username");
  const password = requireString(args, "password");
  const chiefEmail = typeof args["chief-email"] === "string" ? args["chief-email"].trim() : null;

  // Codes are normalised to uppercase so "fad" and "FAD" can't become two
  // different offices.
  const code = requireString(args, "code").toUpperCase();

  // The outgoing routing number uses the office code up to its first hyphen as
  // a prefix (src/lib/documentTypeCodes.ts). Two codes sharing a prefix would
  // generate colliding routing numbers, so refuse hyphens outright rather than
  // let a well-meaning "FAD-CARAGA" silently collapse to "FAD".
  if (code.includes("-")) {
    fail(
      `Office code "${code}" contains a hyphen. The outgoing routing prefix is the code up to its first hyphen, ` +
        `so hyphenated codes risk colliding with each other. Use a plain code such as FAD, MWPTD, MWPSD or WRSD.`
    );
  }
  if (!/^[A-Z][A-Z0-9]*$/.test(code)) {
    fail(`Office code "${code}" must be letters and digits only, starting with a letter.`);
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(chiefUsername) || chiefUsername.length < 3) {
    fail(
      `Username "${chiefUsername}" must be at least 3 characters and contain only letters, numbers, dots, dashes and underscores.`
    );
  }

  // Same rule the app enforces wherever a password is set, imported rather
  // than restated so this script can't drift from /api/users.
  const passwordIssue = passwordProblem(password);
  if (passwordIssue) {
    fail(`${passwordIssue} (${PASSWORD_RULE_TEXT})`);
  }

  // Pre-flight both uniqueness checks so a clash is a clear message rather than
  // a raw P2002 — and so we never create the Office and then fail on the user,
  // leaving an empty division behind.
  const existingOffice = await prisma.office.findUnique({ where: { code } });
  if (existingOffice) {
    fail(`An office with code "${code}" already exists: "${existingOffice.name}". Nothing was created.`);
  }

  // A distinct code is not enough: what actually has to be unique is the
  // outgoing routing *prefix*, the code up to its first hyphen. The seeded
  // office is "MWPTD-CARAGA", so a new office coded "MWPTD" would pass the
  // uniqueness check above and then generate routing numbers colliding with
  // it. Compare prefixes, not codes.
  const prefixOf = (officeCode: string) => officeCode.split("-")[0];
  const clash = (await prisma.office.findMany({ select: { name: true, code: true } })).find(
    (o) => prefixOf(o.code) === prefixOf(code)
  );
  if (clash) {
    fail(
      `Office code "${code}" shares the outgoing routing prefix "${prefixOf(code)}" with the existing office ` +
        `"${clash.name}" (${clash.code}). Their outgoing routing numbers would collide. Nothing was created.`
    );
  }

  // username is globally unique across every office, not per-office.
  const existingUser = await prisma.user.findUnique({
    where: { username: chiefUsername },
    select: { username: true },
  });
  if (existingUser) {
    fail(
      `The username "${chiefUsername}" is already taken — usernames are unique across all divisions, not just within one. Pick another.`
    );
  }

  console.log(`\n  Division : ${name}`);
  console.log(`  Code     : ${code}`);
  console.log(`  Chief    : ${chiefName} (${chiefUsername})`);
  console.log(`  Email    : ${chiefEmail ?? "—"}`);

  if (dryRun) {
    console.log(`\n  ✓ Dry run — validation passed, nothing was written.\n`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // One transaction: a division without its Chief is unusable, and a Chief
  // without a division is unreachable. Either both land or neither does.
  const { office, chief } = await prisma.$transaction(async (tx) => {
    const office = await tx.office.create({ data: { name, code } });

    const chief = await tx.user.create({
      data: {
        officeId: office.id,
        name: chiefName,
        username: chiefUsername,
        email: chiefEmail ? chiefEmail : null,
        role: Role.DIVISION_CHIEF,
        passwordHash,
      },
      select: { id: true, name: true, username: true },
    });

    // AuditLog.userId is a required FK, and at onboarding there is no prior
    // actor in this office to attribute the change to — the Chief being
    // created is the only user that exists here. Recording them is honest:
    // these rows say "this division and this account came into existence",
    // and the trail from then on has real actors.
    await tx.auditLog.createMany({
      data: [
        {
          officeId: office.id,
          userId: chief.id,
          action: "CREATE",
          entityType: "Office",
          entityId: office.id,
          details: { name, code, via: "scripts/onboard-division.ts" },
        },
        {
          officeId: office.id,
          userId: chief.id,
          action: "CREATE",
          entityType: "User",
          entityId: chief.id,
          // The password is never written to the audit trail, only the fact of creation.
          details: {
            name: chief.name,
            username: chief.username,
            role: Role.DIVISION_CHIEF,
            via: "scripts/onboard-division.ts",
          },
        },
      ],
    });

    return { office, chief };
  });

  console.log(`\n  ✓ Created division "${office.name}" (${office.code})`);
  console.log(`  ✓ Created Division Chief: ${chief.username}`);
  console.log(`\n  Give ${chief.name} their username and the password you set.`);
  console.log(`  There is no forced password change in this system — ask them to`);
  console.log(`  change it themselves under Settings after signing in.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
