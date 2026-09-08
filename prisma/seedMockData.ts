// Seeds sample Incoming/Outgoing/Activity/Leave/Internal records for local
// demo/testing purposes — layered on top of the office + staff roster from
// seed.ts (run that first).
//
// IMPORTANT: this is meant for the LOCAL DEV database only (the one behind
// `npm run dev`, i.e. .env.local's DATABASE_URL), never the deployed
// office-server database. Always run it with an explicit override, e.g.:
//
//   DATABASE_URL=$(grep DATABASE_URL .env.local | cut -d= -f2-) npx ts-node prisma/seedMockData.ts
//
// Running it bare (`npx ts-node prisma/seedMockData.ts`) would fall back to
// .env's DATABASE_URL, which is the real deployed database — don't do that.

import { PrismaClient, DocComplexity, LeaveType } from "@prisma/client";

const prisma = new PrismaClient();

function formatRoutingDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}${dd}${yy}`;
}

const ARTA_LEAD_DAYS: Record<DocComplexity, number> = { SIMPLE: 3, COMPLEX: 7, HIGHLY_TECHNICAL: 20 };

function addWorkingDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

async function main() {
  const office = await prisma.office.findFirst({ where: { code: "MWPTD" } });
  if (!office) throw new Error('Office "MWPTD" not found — run `npm run prisma:seed` first.');

  const officeId = office.id;
  const users = await prisma.user.findMany({ where: { officeId }, orderBy: { name: "asc" } });
  if (users.length === 0) throw new Error("No staff accounts found — run `npm run prisma:seed` first.");
  const u = (i: number) => users[i % users.length];

  let incomingSeq = office.incomingSeqCounter;
  let outgoingSeq = office.outgoingSeqCounter;
  const officePrefix = office.code.split("-")[0];

  async function createIncoming(opts: {
    dateReceived: Date;
    type: string;
    documentTitle: string;
    complexity: DocComplexity;
    routedTo: number[];
    completed?: boolean;
    filed?: boolean;
  }) {
    incomingSeq++;
    const routingNumber = `${formatRoutingDate(opts.dateReceived)}-${opts.type}-${String(incomingSeq).padStart(3, "0")}`;
    const dueDate = addWorkingDays(opts.dateReceived, ARTA_LEAD_DAYS[opts.complexity]);
    return prisma.incomingDocument.create({
      data: {
        officeId,
        dateReceived: opts.dateReceived,
        routingNumber,
        documentTitle: opts.documentTitle,
        complexity: opts.complexity,
        leadTimeDays: ARTA_LEAD_DAYS[opts.complexity],
        dueDate,
        instructions: "Please review and process accordingly.",
        dateCompleted: opts.completed ? addWorkingDays(opts.dateReceived, 1) : null,
        filed: opts.filed ?? false,
        routedTo: { create: opts.routedTo.map((i) => ({ userId: u(i).id })) },
      },
    });
  }

  async function createOutgoing(opts: {
    dateReleased: Date;
    type: string;
    documentTitle: string;
    filed?: boolean;
    relatedIncomingId?: string;
  }) {
    outgoingSeq++;
    const routingNumber = `${formatRoutingDate(opts.dateReleased)}-${officePrefix}-${opts.type}-${String(outgoingSeq).padStart(3, "0")}`;
    return prisma.outgoingDocument.create({
      data: {
        officeId,
        dateReleased: opts.dateReleased,
        routingNumber,
        documentTitle: opts.documentTitle,
        receivedBy: "Regional Office",
        filed: opts.filed ?? false,
        relatedIncomingId: opts.relatedIncomingId,
      },
    });
  }

  console.log("Seeding Incoming documents…");
  const incoming1 = await createIncoming({
    dateReceived: new Date(2026, 5, 10),
    type: "L",
    documentTitle: "Request for Assistance - Repatriation Case",
    complexity: "SIMPLE",
    routedTo: [1],
    completed: true,
    filed: true,
  });
  await createIncoming({
    dateReceived: new Date(2026, 5, 25),
    type: "E",
    documentTitle: "Endorsement of Illegal Recruitment Complaint",
    complexity: "COMPLEX",
    routedTo: [2],
  });
  await createIncoming({
    dateReceived: new Date(2026, 6, 1),
    type: "M",
    documentTitle: "Memorandum on Regional Compliance Audit",
    complexity: "SIMPLE",
    routedTo: [1, 3],
  });
  await createIncoming({
    dateReceived: new Date(2026, 6, 15),
    type: "A",
    documentTitle: "Advisory on Updated OFW Documentary Requirements",
    complexity: "SIMPLE",
    routedTo: [4],
  });
  await createIncoming({
    dateReceived: new Date(2026, 6, 18),
    type: "C",
    documentTitle: "Certification Request - Length of Service",
    complexity: "HIGHLY_TECHNICAL",
    routedTo: [2],
  });
  await createIncoming({
    dateReceived: new Date(2026, 6, 20),
    type: "IA",
    documentTitle: "Inspection Authority for Recruitment Agency Renewal",
    complexity: "SIMPLE",
    routedTo: [],
  });
  await createIncoming({
    dateReceived: new Date(2026, 6, 21),
    type: "HRR",
    documentTitle: "HR Request - Additional Casual Staff",
    complexity: "SIMPLE",
    routedTo: [3, 5],
  });
  const incoming8 = await createIncoming({
    dateReceived: new Date(2026, 6, 10),
    type: "NR",
    documentTitle: "Narrative Report - Q2 Field Monitoring",
    complexity: "COMPLEX",
    routedTo: [1],
    completed: true,
    filed: true,
  });
  await createIncoming({
    dateReceived: new Date(2026, 5, 30),
    type: "PAFR",
    documentTitle: "Post-Activity Feedback Report - Orientation Seminar",
    complexity: "SIMPLE",
    routedTo: [4],
    completed: true,
  });
  await createIncoming({
    dateReceived: new Date(2026, 6, 5),
    type: "R",
    documentTitle: "Request for Certified True Copy of Records",
    complexity: "SIMPLE",
    routedTo: [1],
  });

  console.log("Seeding Outgoing documents…");
  await createOutgoing({
    dateReleased: new Date(2026, 6, 1),
    type: "M",
    documentTitle: "Reply to Repatriation Assistance Request",
    filed: true,
    relatedIncomingId: incoming1.id,
  });
  await createOutgoing({
    dateReleased: new Date(2026, 6, 11),
    type: "L",
    documentTitle: "Transmittal of Q2 Field Monitoring Report",
    relatedIncomingId: incoming8.id,
  });
  await createOutgoing({ dateReleased: new Date(2026, 6, 15), type: "E", documentTitle: "Endorsement to Regional Office" });
  await createOutgoing({ dateReleased: new Date(2026, 6, 18), type: "C", documentTitle: "Reply to Certification Request" });
  await createOutgoing({ dateReleased: new Date(2026, 5, 20), type: "A", documentTitle: "Advisory Dissemination to Partner Agencies", filed: true });
  await createOutgoing({ dateReleased: new Date(2026, 6, 20), type: "R", documentTitle: "Transmittal of Requested Records" });

  console.log("Seeding Activities…");
  const activities: { date: Date; activityName: string; assignees: number[] }[] = [
    { date: new Date(2026, 5, 15), activityName: "Case Conference on Illegal Recruitment", assignees: [3] },
    { date: new Date(2026, 6, 3), activityName: "Inspection of Recruitment Agency XYZ", assignees: [2, 3] },
    { date: new Date(2026, 6, 8), activityName: "Orientation Seminar for OFWs", assignees: [4] },
    { date: new Date(2026, 6, 10), activityName: "Site Visit - Overseas Employment Corp", assignees: [1] },
    { date: new Date(2026, 6, 14), activityName: "Community Awareness Drive", assignees: [2, 5] },
    { date: new Date(2026, 6, 17), activityName: "Monitoring Visit - Partner Manning Agency", assignees: [3] },
    { date: new Date(2026, 6, 20), activityName: "Joint Inspection with DOLE", assignees: [1, 4] },
    { date: new Date(2026, 6, 22), activityName: "Division Staff Meeting", assignees: [2] },
    { date: new Date(2026, 6, 27), activityName: "Pre-Departure Orientation Seminar", assignees: [5] },
    { date: new Date(2026, 7, 3), activityName: "Quarterly Program Review", assignees: [1, 2] },
  ];
  for (const a of activities) {
    await prisma.activity.create({
      data: {
        officeId,
        date: a.date,
        activityName: a.activityName,
        remarks: "Conducted as scheduled.",
        assignees: { create: a.assignees.map((i) => ({ userId: u(i).id })) },
      },
    });
  }

  console.log("Seeding Leave records…");
  const leaves: { user: number; type: LeaveType; start: Date; end: Date | null; filed?: Date }[] = [
    { user: 3, type: "VACATION", start: new Date(2026, 6, 10), end: new Date(2026, 6, 12), filed: new Date(2026, 6, 1) },
    { user: 5, type: "SICK", start: new Date(2026, 6, 21), end: null, filed: new Date(2026, 6, 21) },
    { user: 2, type: "CTO", start: new Date(2026, 6, 25), end: new Date(2026, 6, 25), filed: new Date(2026, 6, 15) },
    { user: 4, type: "EMERGENCY", start: new Date(2026, 5, 5), end: new Date(2026, 5, 6), filed: new Date(2026, 5, 5) },
    { user: 1, type: "OTHER", start: new Date(2026, 7, 1), end: new Date(2026, 7, 3), filed: new Date(2026, 6, 20) },
  ];
  for (const l of leaves) {
    await prisma.leave.create({
      data: {
        officeId,
        personnelId: u(l.user).id,
        type: l.type,
        leaveStart: l.start,
        leaveEnd: l.end,
        dateFiled: l.filed,
      },
    });
  }

  console.log("Seeding Internal memos…");
  const memos = [
    { number: 1, date: new Date(2026, 6, 1), title: "Office Memo on Attendance Policy" },
    { number: 2, date: new Date(2026, 6, 10), title: "Revised Flag Ceremony Schedule" },
    { number: 3, date: new Date(2026, 6, 15), title: "Reminder on Submission of DTRs" },
    { number: 4, date: new Date(2026, 6, 20), title: "Assignment of Duty Officer for the Week" },
  ];
  for (const m of memos) {
    await prisma.internalMemo.create({
      data: {
        officeId,
        dateReleased: m.date,
        memorandumNumber: m.number,
        documentTitle: m.title,
      },
    });
  }

  await prisma.office.update({
    where: { id: office.id },
    data: { incomingSeqCounter: incomingSeq, outgoingSeqCounter: outgoingSeq },
  });

  console.log(`Done: ${incomingSeq} incoming, ${outgoingSeq} outgoing, ${activities.length} activities, ${leaves.length} leaves, ${memos.length} internal memos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
