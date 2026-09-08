import { prisma } from "@/lib/prisma";
import type { RegulationLicensingService } from "@prisma/client";

// The Regulation and Licensing register is MWPTD's
// (Office.tracksRegulationLicensing). One function behind every consumer — both
// pages, both API routes and the nav — so an office either has the module or
// does not. Gates routes, not only what is drawn: hiding a nav entry is
// convenience, the 404 here is the boundary.
export async function officeTracksRegulationLicensing(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { tracksRegulationLicensing: true },
  });
  return office?.tracksRegulationLicensing ?? false;
}

// Sheet order, columns E through J — the order the tick-boxes run in, so anyone
// copying a row across reads them left to right.
export const RL_SERVICES: RegulationLicensingService[] = [
  "DEPLOYMENT_CERTIFICATE",
  "LRA_DIRECTORY",
  "LRA_VERIFICATION",
  "LRA_PERSONNEL_ACCREDITATION",
  "SRA_ASSISTANCE",
  "SUBMISSION_OF_REPORTS",
  "OTHERS",
];

// The column headings as they read on the sheet. LRA and SRA stay
// abbreviated — they are the office's own terms and appear that way in the
// register — while "accreditation" is spelled out properly.
export const RL_SERVICE_LABELS: Record<RegulationLicensingService, string> = {
  DEPLOYMENT_CERTIFICATE: "Issuance of deployment certificate",
  LRA_DIRECTORY: "Issuance of LRA directory",
  LRA_VERIFICATION: "Verification of licensed recruitment agency",
  LRA_PERSONNEL_ACCREDITATION: "Verification of accreditation of LRA personnel",
  SRA_ASSISTANCE: "SRA assistance / inquiry",
  SUBMISSION_OF_REPORTS: "Submission of reports",
  OTHERS: "Others",
};

// The register is ten columns wide before the ticks even start, so the table
// heads use these instead of the full wording above — which stays on the form,
// where there is room for it and where somebody is choosing rather than
// scanning.
export const RL_SERVICE_SHORT: Record<RegulationLicensingService, string> = {
  DEPLOYMENT_CERTIFICATE: "Deployment cert.",
  LRA_DIRECTORY: "LRA directory",
  LRA_VERIFICATION: "LRA verification",
  LRA_PERSONNEL_ACCREDITATION: "LRA personnel",
  SRA_ASSISTANCE: "SRA assistance",
  SUBMISSION_OF_REPORTS: "Reports",
  OTHERS: "Others",
};

export function isRlService(value: string): value is RegulationLicensingService {
  return (RL_SERVICES as string[]).includes(value);
}
