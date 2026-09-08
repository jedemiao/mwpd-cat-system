// Seeds throwaway records across every register so a dev database has
// something to look at: correspondence with live ARTA states, activities on
// the calendar, leave, SENA conferences and call-log entries.
//
// This is demo data, not fixtures — there is no test suite depending on it.
// The point is a populated UI: overdue and due-soon documents so the ARTA
// banner and nav badge actually render, a pipeline board with counts at each
// stage, and a month of activities with real assignees.
//
// Usage:
//   npm run seed-temp -- [--office MWPTD-CARAGA] [--dry-run]
//   npm run seed-temp -- --undo
//   npm run seed-temp -- --env .env.other        # different env file
//   npm run seed-temp -- --database-url postgresql://…   # explicit target
//
// Targets .env.local (localhost:5432, the `npm run dev` database) by default —
// the OPPOSITE of scripts/onboard-division.ts, which loads .env and therefore
// hits the deployment on 5433. That default is deliberate: this script invents
// documents, and inventing them in the office's live ledger would burn real
// routing numbers and put fictional cases in front of staff. Pointing it at any
// other database requires --force.
//
// Every id it creates is written to prisma/.temp-seed-manifest.json, and
// --undo deletes exactly those rows. Text fields that have somewhere to put it
// also carry a "[temp seed]" marker, so anything orphaned by a lost manifest is
// still greppable.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { PrismaClient, DocumentOrigin, DocComplexity, ActivityCategory, LeaveType, SenaStatus } from "@prisma/client";
import { computeDueDate } from "../src/lib/artaLeadTime";
import { buildRoutingNumber, buildInternalRoutingNumber, buildOutgoingRoutingNumber } from "../src/lib/documentTypeCodes";
import type { DocumentTypeCode } from "../src/lib/documentTypeCodes";

const REPO_ROOT = join(__dirname, "..");
const MANIFEST_PATH = join(REPO_ROOT, "prisma", ".temp-seed-manifest.json");
const MARKER = "[temp seed]";

// Same minimal reader as scripts/onboard-division.ts — dotenv is not a
// top-level dependency, and a bare ts-node process loads nothing on its own.
//
// Precedence here is the reverse of that script's, and deliberately so:
// importing @prisma/client auto-loads .env into process.env at module load,
// before any of this code runs. Since .env is the DEPLOYMENT database (port
// 5433, per CLAUDE.md), trusting an ambient DATABASE_URL would mean this
// script silently targets production no matter what --env says. So the env
// file wins, and a genuine override goes through --database-url.
function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  let contents: string;
  try {
    contents = readFileSync(join(REPO_ROOT, file), "utf8");
  } catch {
    return out;
  }
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

// ---------------------------------------------------------------------------
// Dates. Everything is anchored to today so the ARTA states stay live however
// long after seeding the database is opened. UTC midnight throughout, matching
// formatRoutingDate and the DTR module's normalisation.
// ---------------------------------------------------------------------------

const TODAY = (() => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
})();

function days(offset: number): Date {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

// Nudges a date off Saturday/Sunday, so seeded correspondence and activities
// land on working days the way real entries do.
function workday(offset: number): Date {
  const d = days(offset);
  if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 2);
  return d;
}

// The exact inverse of addWorkingDays: both skip weekends, so subtracting the
// lead time from a weekday due date gives back a dateReceived that computeDueDate
// maps to that same due date.
function subtractWorkingDays(start: Date, count: number): Date {
  const d = new Date(start);
  let removed = 0;
  while (removed < count) {
    d.setUTCDate(d.getUTCDate() - 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) removed++;
  }
  return d;
}

// Back-solves dateReceived so the document falls due `offset` WORKING days from
// today. Some rows are pinned this way rather than by their arrival date
// because what makes them worth seeding is where they sit against the ARTA
// clock (src/lib/artaAlerts.ts counts anything due within 2 days as due-soon),
// and an arrival offset lands somewhere different every weekday the seed runs.
function receivedForDueIn(offset: number, complexity: DocComplexity): Date {
  const due = new Date(TODAY);
  for (let i = 0; i < offset; ) {
    due.setUTCDate(due.getUTCDate() + 1);
    const day = due.getUTCDay();
    if (day !== 0 && day !== 6) i++;
  }
  return subtractWorkingDays(due, LEAD_DAYS[complexity]);
}

const LEAD_DAYS: Record<DocComplexity, number> = { SIMPLE: 3, COMPLEX: 7, HIGHLY_TECHNICAL: 20 };

// ---------------------------------------------------------------------------
// The records. Written out rather than generated at random: a fixed set is
// reviewable, and re-running --undo then the seed gives the same ledger back.
//
// `received` is an offset in days from today. The ARTA state of each row falls
// out of that offset and the complexity, so the spread below is the point:
// three overdue, three inside the due-soon window, the rest closed or
// comfortably open.
// ---------------------------------------------------------------------------

type IncomingSpec = {
  // Exactly one of these. `received` is an offset in days from today;
  // `dueIn` pins the ARTA due date instead and back-solves the arrival.
  received?: number;
  dueIn?: number;
  type: DocumentTypeCode;
  title: string;
  origin: DocumentOrigin;
  agency: string;
  signatory?: string;
  complexity: DocComplexity;
  completed?: number;
  routedTo: number[];
  instructions?: string;
  progress?: string;
  filed?: boolean;
};

const INCOMING: IncomingSpec[] = [
  // --- overdue: past due date, nothing recorded as completed ---
  {
    received: -22, type: "L", origin: "EXTERNAL", complexity: "COMPLEX",
    title: "Request for assistance — repatriated worker, Butuan City",
    agency: "Walk-in client", signatory: "Rosalinda M. Adlaon",
    routedTo: [1, 2], instructions: "Interview the client and prepare the case folder.",
    progress: "Case folder started; waiting on the employment contract copy.",
  },
  {
    received: -16, type: "E", origin: "EXTERNAL", complexity: "SIMPLE",
    title: "Endorsement of complaint against licensed recruitment agency",
    agency: "OWWA Regional Welfare Office XIII", signatory: "Dir. Feliciano B. Ruiz",
    routedTo: [3], instructions: "Verify the agency's licence status before replying.",
    progress: "Awaiting verification from Licensing.",
  },
  {
    received: -12, type: "R", origin: "EXTERNAL", complexity: "SIMPLE",
    title: "Request for certification of employment — former household service worker",
    agency: "Surigao del Norte Provincial Employment Office", signatory: "Ma. Lourdes T. Ompoc",
    routedTo: [4],
  },

  // --- due soon: pinned to the next working days, not to an arrival date ---
  {
    dueIn: 1, type: "IA", origin: "EXTERNAL", complexity: "SIMPLE",
    title: "Inspection Authority — licensed recruitment agency, Surigao City",
    agency: "DMW Central Office — Ortigas", signatory: "Usec. Bernard P. Olalia",
    routedTo: [5, 6], instructions: "Schedule the inspection within the week and coordinate with the field office.",
    progress: "Inspection team assigned; travel order being prepared.",
  },
  {
    dueIn: 2, type: "A", origin: "EXTERNAL", complexity: "SIMPLE",
    title: "Advisory on updated pre-departure orientation seminar guidelines",
    agency: "DMW Central Office — Ortigas", signatory: "Atty. Marivic T. Sunga",
    routedTo: [2], progress: "For dissemination to accredited PDOS providers.",
  },
  {
    received: -4, type: "M", origin: "INTERNAL", complexity: "COMPLEX",
    title: "Memorandum — submission of Q3 protection caseload summary",
    agency: "Office of the Regional Director", signatory: "RD Ana Marie L. Pastrana",
    routedTo: [1, 3, 4], instructions: "Consolidate the division's figures and submit by month-end.",
    progress: "Consolidating per-staff counts.",
  },

  // --- closed: completed on or before the due date ---
  {
    received: -30, type: "L", origin: "EXTERNAL", complexity: "SIMPLE",
    title: "Letter of appeal — denied overseas employment certificate",
    agency: "Walk-in client", signatory: "Jonathan R. Ecleo",
    routedTo: [2], completed: -27, filed: true,
    progress: "Resolved; appellant notified in writing.",
  },
  {
    received: -26, type: "MOM", origin: "INTERNAL", complexity: "SIMPLE",
    title: "Minutes of Meeting — Regional Anti-Trafficking Task Force",
    agency: "DILG Caraga", signatory: "Dir. Marivic C. Jalad",
    routedTo: [3], completed: -24, filed: true,
  },
  {
    received: -19, type: "C", origin: "EXTERNAL", complexity: "SIMPLE",
    title: "Request for certification of pending case — agency accreditation renewal",
    agency: "Pacific Skills Manpower Services Inc.", signatory: "Elmer G. Tabada",
    routedTo: [4], completed: -15, filed: true,
    progress: "Certification released to the requesting agency.",
  },
  {
    received: -35, type: "HRR", origin: "INTERNAL", complexity: "SIMPLE",
    title: "Request for additional plantilla item — ADAS III",
    agency: "Financial and Administrative Division", signatory: "Chief Elsa D. Bagsic",
    routedTo: [1], completed: -31, filed: true,
  },

  // --- open, comfortably inside the lead time ---
  {
    received: -6, type: "MO", origin: "EXTERNAL", complexity: "HIGHLY_TECHNICAL",
    title: "Memorandum Order — joint inspection of manning agencies, Region XIII",
    agency: "DMW Central Office — Ortigas", signatory: "Usec. Bernard P. Olalia",
    routedTo: [5, 6, 2], instructions: "Draft the regional implementation plan and inspection schedule.",
    progress: "Draft plan circulating for comment.",
  },
  {
    received: 0, type: "L", origin: "EXTERNAL", complexity: "COMPLEX",
    title: "Complaint on unpaid salaries — seafarer, Agusan del Norte",
    agency: "Walk-in client", signatory: "Michael Anthony C. Deloso",
    routedTo: [2, 3], instructions: "Set the case for SENA conference.",
    progress: "Received at the desk; conference date being set.",
  },
];

type OutgoingSpec = {
  released: number;
  type: DocumentTypeCode;
  title: string;
  receivingOffice: string;
  receivedBy?: string;
  receivedDate?: number;
  receivedTime?: string;
  relatedIncoming?: number; // index into INCOMING
  progress?: string;
  filed?: boolean;
};

// Kept in release order, the way the ledger reads — the routing numbers are
// claimed in this order, so the sequence has to march with the dates. Where a
// row answers an incoming document, its release offset is strictly later than
// that document's arrival: a reply filed before the letter it answers is the
// kind of thing a records officer spots immediately.
const OUTGOING: OutgoingSpec[] = [
  {
    released: -27, type: "L", title: "Reply to appeal — denied overseas employment certificate",
    receivingOffice: "Records Section", receivedBy: "Jonathan R. Ecleo", receivedDate: -26,
    receivedTime: "10:20 AM", relatedIncoming: 6, filed: true, // INCOMING[6] arrived -30
    progress: "Served personally; acknowledgement on file.",
  },
  {
    released: -20, type: "M", title: "Memorandum — designation of inspection team, Surigao City",
    receivingOffice: "MWPTD Field Staff", receivedBy: "Al S. Polinar", receivedDate: -20,
    receivedTime: "09:05 AM", filed: true,
  },
  {
    released: -15, type: "C", title: "Certification of no pending case — Pacific Skills Manpower Services Inc.",
    receivingOffice: "Pacific Skills Manpower Services Inc.", receivedBy: "Elmer G. Tabada",
    receivedDate: -14, receivedTime: "02:45 PM", relatedIncoming: 8, filed: true, // INCOMING[8] arrived -19
  },
  {
    released: -13, type: "E", title: "Endorsement to Legal — complaint against licensed recruitment agency",
    receivingOffice: "Legal Unit", receivedBy: "Atty. Marinelle Aycee M. Perral",
    receivedDate: -13, receivedTime: "11:30 AM", relatedIncoming: 1, // INCOMING[1] arrived -16
    progress: "Endorsed for evaluation; awaiting legal opinion.",
  },
  {
    released: -11, type: "NR", title: "Narrative report — joint inspection, Butuan City manning agencies",
    receivingOffice: "Office of the Regional Director", receivedBy: "Cherryl C. Oculam",
    receivedDate: -10, receivedTime: "04:15 PM", filed: true,
  },
  {
    released: -1, type: "R", title: "Request for travel authority — Surigao City inspection",
    receivingOffice: "Financial and Administrative Division", receivedBy: "Apple Mae C. Tandoy",
    receivedDate: 0, receivedTime: "08:50 AM", relatedIncoming: 3, // INCOMING[3] is due-pinned, arrives ~-2
    progress: "For approval of the Regional Director.",
  },
  {
    released: 0, type: "A", title: "Dissemination — updated PDOS guidelines to accredited providers",
    receivingOffice: "Accredited PDOS Providers", relatedIncoming: 4, // INCOMING[4] is due-pinned, arrives ~-1
    progress: "Released; acknowledgements still being collected.",
  },
  {
    released: 0, type: "M", title: "Notice of SENA conference — unpaid salaries case",
    receivingOffice: "Records Section", relatedIncoming: 11, // INCOMING[11] arrived today
    progress: "For service to both parties.",
  },
];

type ActivitySpec = {
  start: number;
  end?: number;
  name: string;
  category: ActivityCategory;
  categoryOther?: string;
  location?: string;
  assignees: number[];
  remarks?: string;
};

const ACTIVITIES: ActivitySpec[] = [
  { start: -24, name: "Inspection of licensed recruitment agency", category: "INSPECTION", location: "Butuan City", assignees: [5, 6] },
  { start: -21, end: -20, name: "Joint inspection with DOLE — manning agencies", category: "INSPECTION", location: "Surigao City", assignees: [5, 2] },
  { start: -18, name: "Quick response — distressed worker turnover", category: "QUICK_RESPONSE_TEAM", location: "Bancasi Airport, Butuan City", assignees: [3, 4] },
  { start: -14, end: -12, name: "Regional training on case management", category: "CONFERENCE_TRAINING", location: "Cabadbaran City", assignees: [1, 2, 3] },
  { start: -10, name: "Division staff meeting", category: "MEETINGS", location: "MWPTD Conference Room", assignees: [0, 1, 2, 3, 4] },
  { start: -8, name: "Anti-Trafficking Task Force quarterly meeting", category: "MEETINGS", location: "DILG Caraga Regional Office", assignees: [3] },
  { start: -3, name: "Pre-departure orientation seminar monitoring", category: "INSPECTION", location: "Butuan City", assignees: [2, 6] },
  { start: -1, name: "Skeleton force — regional holiday", category: "SKELETON_FORCE", assignees: [4, 5] },
  { start: 2, name: "Scheduled inspection — Surigao City agencies", category: "INSPECTION", location: "Surigao City", assignees: [5, 6] },
  { start: 5, end: 6, name: "Regional consultation on migrant workers' welfare", category: "CONFERENCE_TRAINING", location: "Butuan City", assignees: [1, 3] },
  { start: 9, name: "Records disposal and filing day", category: "OTHERS", categoryOther: "Records management", location: "MWPTD Office", assignees: [4] },
];

type LeaveSpec = { start: number; end?: number; filed?: number; type: LeaveType; typeOther?: string; personnel: number };

const LEAVES: LeaveSpec[] = [
  { start: -17, end: -16, filed: -22, type: "VACATION", personnel: 2 },
  { start: -9, filed: -11, type: "SICK", personnel: 4 },
  { start: -4, filed: -4, type: "EMERGENCY", personnel: 6 },
  { start: 3, end: 4, filed: -2, type: "CTO", personnel: 5 },
  { start: 7, filed: -1, type: "OTHER", typeOther: "Special privilege leave", personnel: 3 },
];

type SenaSpec = {
  date: number;
  time: string;
  number: number;
  mediator: number;
  complainant: string;
  respondent: string;
  status: SenaStatus;
  settled?: number;
  followsUp?: number; // index into SENA
};

const SENA: SenaSpec[] = [
  { date: -20, time: "09:00 AM", number: 1, mediator: 1, complainant: "Rosalinda M. Adlaon", respondent: "Goldstar Overseas Placement Inc.", status: "SETTLED", settled: 45000 },
  { date: -13, time: "10:00 AM", number: 1, mediator: 2, complainant: "Jonathan R. Ecleo", respondent: "Pacific Skills Manpower Services Inc.", status: "FOR_SECOND_CONFERENCE" },
  { date: -6, time: "01:30 PM", number: 2, mediator: 2, complainant: "Jonathan R. Ecleo", respondent: "Pacific Skills Manpower Services Inc.", status: "NOT_SETTLED", followsUp: 1 },
  { date: -2, time: "09:30 AM", number: 1, mediator: 1, complainant: "Michael Anthony C. Deloso", respondent: "Northsea Crew Management Corp.", status: "SCHEDULED" },
  { date: 4, time: "10:00 AM", number: 1, mediator: 3, complainant: "Grace L. Montefalcon", respondent: "Almaris Recruitment Services", status: "SCHEDULED" },
  { date: -28, time: "02:00 PM", number: 1, mediator: 1, complainant: "Ferdinand B. Cagampang", respondent: "Vista Manpower Corp.", status: "WITHDRAWN" },
];

const CALL_LOGS: { date: number; phone: string; caller: string; concern: string; remarks?: string }[] = [
  { date: -18, phone: "0917-555-0142", caller: "Marites B. Olvido", concern: "Follow-up on repatriation assistance for a relative in the Middle East", remarks: "Referred to OWWA for the repatriation fund." },
  { date: -15, phone: "085-342-7781", caller: "Renato C. Ampoloquio", concern: "Asking which agencies are licensed to deploy household service workers" },
  { date: -13, phone: "0999-555-0188", caller: "Jocelyn P. Deles", concern: "Complaint on excessive placement fee collected by a local recruiter", remarks: "Advised to file a formal complaint; forms emailed." },
  { date: -11, phone: "0918-555-0107", caller: "Arnold T. Sabellano", concern: "Verification of an overseas job offer received on social media", remarks: "Warned of possible illegal recruitment; no licence on record." },
  { date: -9, phone: "085-815-2204", caller: "PESO Cabadbaran", concern: "Coordination for the upcoming jobs fair orientation" },
  { date: -7, phone: "0927-555-0163", caller: "Elena M. Bagong", concern: "Status of a pending SENA case", remarks: "Conference set; both parties notified." },
  { date: -5, phone: "0916-555-0129", caller: "Danilo R. Estrera", concern: "Request for a copy of the employment contract on file" },
  { date: -3, phone: "085-341-9920", caller: "OWWA Regional Welfare Office XIII", concern: "Joint handling of a distressed worker arriving this week" },
  { date: -1, phone: "0905-555-0174", caller: "Cristina L. Bagitbit", concern: "Asking about requirements for an overseas employment certificate" },
  { date: 0, phone: "0936-555-0151", caller: "Roberto S. Nallos", concern: "Reporting a suspected illegal recruitment activity in Bayugan City", remarks: "Details taken; endorsed to the inspection team." },
];

// ---------------------------------------------------------------------------

type Manifest = {
  seededAt: string;
  officeCode: string;
  database: string;
  ids: {
    incoming: string[];
    outgoing: string[];
    activities: string[];
    leaves: string[];
    sena: string[];
    callLogs: string[];
  };
};

function redact(url: string): string {
  return url.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@");
}

async function main() {
  const envFile = arg("env") ?? ".env.local";
  const fileEnv = readEnvFile(envFile);
  const databaseUrl = arg("database-url") ?? fileEnv.DATABASE_URL ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(`No DATABASE_URL in ${envFile}, and none passed as --database-url.`);
  }

  // The guard that keeps invented casework out of the office's real ledger.
  // Port 5433 is the deployment per CLAUDE.md; anything that isn't the local
  // dev database has to be asked for explicitly.
  const looksLocal = /localhost:5432\b/.test(databaseUrl) || /_local\b/.test(databaseUrl);
  if (!looksLocal && !has("force")) {
    console.error(`Refusing to run against ${redact(databaseUrl)}`);
    console.error("That does not look like the local dev database (localhost:5432 / *_local).");
    console.error("This script invents documents and consumes routing numbers — running it against");
    console.error("the deployment puts fictional cases in the office's live registers.");
    console.error("Re-run with --force if that is genuinely what you want.");
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    if (has("undo")) {
      await undo(prisma);
      return;
    }

    const officeCode = arg("office") ?? "MWPTD-CARAGA";
    const office = await prisma.office.findUnique({ where: { code: officeCode } });
    if (!office) {
      throw new Error(`No office with code "${officeCode}". Run npm run prisma:seed first.`);
    }

    const staff = await prisma.user.findMany({
      where: { officeId: office.id, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    if (staff.length === 0) {
      throw new Error(`Office "${officeCode}" has no active users — run npm run prisma:seed first.`);
    }
    // Roster positions in the specs above are indexes into the seeded staff
    // list; wrap so a shorter roster still resolves to a real person.
    const person = (i: number) => staff[i % staff.length];

    if (existsSync(MANIFEST_PATH)) {
      console.error(`A manifest already exists at ${MANIFEST_PATH}.`);
      console.error("Run `npm run seed-temp -- --undo` first, or delete the file if those rows are already gone.");
      process.exit(1);
    }

    if (has("dry-run")) {
      console.log(`Would seed into ${redact(databaseUrl)}, office ${officeCode}:`);
      console.log(`  ${INCOMING.length} incoming, ${OUTGOING.length} outgoing, ${ACTIVITIES.length} activities,`);
      console.log(`  ${LEAVES.length} leave records, ${SENA.length} SENA conferences, ${CALL_LOGS.length} call-log entries.`);
      console.log(`  Roster: ${staff.length} active users, starting with ${staff[0].name}.`);
      return;
    }

    const ids: Manifest["ids"] = { incoming: [], outgoing: [], activities: [], leaves: [], sena: [], callLogs: [] };
    const officePrefix = office.code.split("-")[0];

    // --- Incoming -------------------------------------------------------
    // Numbers are claimed the same way POST /api/incoming claims them: the
    // office counter increments, and the split flag decides the format. Both
    // counters are written back once at the end rather than per row.
    let seq = office.incomingSeqCounter;
    let internalSeq = office.incomingInternalSeqCounter;
    const incomingIds: string[] = [];

    for (const spec of INCOMING) {
      const received =
        spec.dueIn !== undefined
          ? receivedForDueIn(spec.dueIn, spec.complexity)
          : workday(spec.received ?? 0);
      const isInternal = office.splitIncomingLedgers && spec.origin === "INTERNAL";
      const routingNumber = isInternal
        ? buildInternalRoutingNumber(received, spec.type, ++internalSeq)
        : buildRoutingNumber(received, spec.type, ++seq);

      const doc = await prisma.incomingDocument.create({
        data: {
          officeId: office.id,
          dateReceived: received,
          timeReceived: ["08:15", "09:40", "10:05", "13:20", "14:45", "15:30"][incomingIds.length % 6],
          receivedById: person(4).id,
          origin: spec.origin,
          originAgency: spec.agency,
          signatory: spec.signatory ?? null,
          documentType: spec.type,
          routingNumber,
          documentTitle: spec.title,
          instructions: spec.instructions ?? null,
          complexity: spec.complexity,
          leadTimeDays: LEAD_DAYS[spec.complexity],
          dueDate: computeDueDate(received, spec.complexity),
          progressRemarks: spec.progress ?? null,
          notes: MARKER,
          dateCompleted: spec.completed !== undefined ? workday(spec.completed) : null,
          filed: spec.filed ?? false,
          routedTo: {
            create: spec.routedTo.map((i) => ({ userId: person(i).id })),
          },
        },
      });
      incomingIds.push(doc.id);
    }
    ids.incoming = incomingIds;

    // --- Outgoing -------------------------------------------------------
    let outSeq = office.outgoingSeqCounter;
    for (const spec of OUTGOING) {
      const released = workday(spec.released);
      const doc = await prisma.outgoingDocument.create({
        data: {
          officeId: office.id,
          dateReleased: released,
          routingNumber: buildOutgoingRoutingNumber(released, officePrefix, spec.type, ++outSeq),
          documentType: spec.type,
          documentTitle: spec.title,
          receivingOffice: spec.receivingOffice,
          receivedBy: spec.receivedBy ?? null,
          receivedDate: spec.receivedDate !== undefined ? workday(spec.receivedDate) : null,
          receivedTime: spec.receivedTime ?? null,
          progressRemarks: spec.progress ? `${spec.progress} ${MARKER}` : MARKER,
          filed: spec.filed ?? false,
          relatedIncomingId: spec.relatedIncoming !== undefined ? incomingIds[spec.relatedIncoming] : null,
        },
      });
      ids.outgoing.push(doc.id);
    }

    await prisma.office.update({
      where: { id: office.id },
      data: {
        incomingSeqCounter: seq,
        incomingInternalSeqCounter: internalSeq,
        outgoingSeqCounter: outSeq,
      },
    });

    // --- Activities -----------------------------------------------------
    for (const spec of ACTIVITIES) {
      const activity = await prisma.activity.create({
        data: {
          officeId: office.id,
          date: workday(spec.start),
          endDate: spec.end !== undefined ? workday(spec.end) : null,
          activityName: spec.name,
          category: spec.category,
          categoryOther: spec.categoryOther ?? null,
          location: spec.location ?? null,
          remarks: MARKER,
          assignees: { create: spec.assignees.map((i) => ({ userId: person(i).id })) },
        },
      });
      ids.activities.push(activity.id);
    }

    // --- Leave ----------------------------------------------------------
    for (const spec of LEAVES) {
      const leave = await prisma.leave.create({
        data: {
          officeId: office.id,
          dateFiled: spec.filed !== undefined ? workday(spec.filed) : null,
          leaveStart: workday(spec.start),
          leaveEnd: spec.end !== undefined ? workday(spec.end) : null,
          type: spec.type,
          typeOther: spec.typeOther ?? null,
          personnelId: person(spec.personnel).id,
        },
      });
      ids.leaves.push(leave.id);
    }

    // --- SENA -----------------------------------------------------------
    // Created in array order so a follow-up's parent already exists; --undo
    // deletes in reverse for the same reason.
    const senaIds: string[] = [];
    for (const spec of SENA) {
      const conference = await prisma.senaConference.create({
        data: {
          officeId: office.id,
          conferenceDate: workday(spec.date),
          conferenceTime: spec.time,
          conferenceNumber: spec.number,
          mediatorId: person(spec.mediator).id,
          complainant: spec.complainant,
          respondent: spec.respondent,
          status: spec.status,
          amountSettled: spec.settled ?? null,
          previousConferenceId: spec.followsUp !== undefined ? senaIds[spec.followsUp] : null,
        },
      });
      senaIds.push(conference.id);
    }
    ids.sena = senaIds;

    // --- Call log -------------------------------------------------------
    for (const spec of CALL_LOGS) {
      const call = await prisma.callLog.create({
        data: {
          officeId: office.id,
          callDate: workday(spec.date),
          phoneNumber: spec.phone,
          callerName: spec.caller,
          concern: spec.concern,
          remarks: spec.remarks ? `${spec.remarks} ${MARKER}` : MARKER,
        },
      });
      ids.callLogs.push(call.id);
    }

    const manifest: Manifest = {
      seededAt: new Date().toISOString(),
      officeCode,
      database: redact(databaseUrl),
      ids,
    };
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const open = await prisma.incomingDocument.findMany({
      where: { id: { in: ids.incoming }, dateCompleted: null },
      select: { dueDate: true },
    });
    const dueSoonCutoff = new Date(TODAY);
    dueSoonCutoff.setUTCDate(dueSoonCutoff.getUTCDate() + 2); // matches DUE_SOON_DAYS in src/lib/artaAlerts.ts
    const overdue = open.filter((d) => d.dueDate && d.dueDate < TODAY).length;
    const dueSoon = open.filter((d) => d.dueDate && d.dueDate >= TODAY && d.dueDate <= dueSoonCutoff).length;
    console.log(`Seeded temporary records into ${redact(databaseUrl)} (office ${officeCode}):`);
    console.log(`  incoming    ${ids.incoming.length}  (${overdue} overdue, ${dueSoon} due within 2 days — the ARTA banner's two states)`);
    console.log(`  outgoing    ${ids.outgoing.length}  (${OUTGOING.filter((o) => o.relatedIncoming !== undefined).length} linked back to an incoming document)`);
    console.log(`  activities  ${ids.activities.length}`);
    console.log(`  leave       ${ids.leaves.length}`);
    console.log(`  SENA        ${ids.sena.length}`);
    console.log(`  call log    ${ids.callLogs.length}`);
    console.log(`\nManifest: ${MANIFEST_PATH}`);
    console.log("Remove it all with: npm run seed-temp -- --undo");
  } finally {
    await prisma.$disconnect();
  }
}

async function undo(prisma: PrismaClient) {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`No manifest at ${MANIFEST_PATH} — nothing recorded to undo.`);
    console.error(`Anything left behind carries "${MARKER}" in its notes/remarks and can be found by hand.`);
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const { ids } = manifest;

  // Join rows first, then the children that hold foreign keys, then the
  // parents. Outgoing references incoming; SENA follow-ups reference earlier
  // conferences, so those go in reverse creation order.
  await prisma.incomingRoutedStaff.deleteMany({ where: { incomingId: { in: ids.incoming } } });
  await prisma.activityAssignee.deleteMany({ where: { activityId: { in: ids.activities } } });
  await prisma.incomingDocumentActivity.deleteMany({ where: { incomingId: { in: ids.incoming } } });
  await prisma.outgoingDocumentActivity.deleteMany({ where: { outgoingId: { in: ids.outgoing } } });

  const outgoing = await prisma.outgoingDocument.deleteMany({ where: { id: { in: ids.outgoing } } });
  const incoming = await prisma.incomingDocument.deleteMany({ where: { id: { in: ids.incoming } } });
  const activities = await prisma.activity.deleteMany({ where: { id: { in: ids.activities } } });
  const leaves = await prisma.leave.deleteMany({ where: { id: { in: ids.leaves } } });

  let sena = 0;
  for (const id of [...ids.sena].reverse()) {
    sena += (await prisma.senaConference.deleteMany({ where: { id } })).count;
  }
  const callLogs = await prisma.callLog.deleteMany({ where: { id: { in: ids.callLogs } } });

  unlinkSync(MANIFEST_PATH);

  console.log(`Removed the temporary records seeded ${manifest.seededAt}:`);
  console.log(`  incoming ${incoming.count}, outgoing ${outgoing.count}, activities ${activities.count},`);
  console.log(`  leave ${leaves.count}, SENA ${sena}, call log ${callLogs.count}`);
  console.log("\nOffice routing-number counters are left where they are — they are monotonic by");
  console.log("design, so the next real document simply takes the next number.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
