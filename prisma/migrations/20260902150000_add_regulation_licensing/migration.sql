-- CreateEnum
CREATE TYPE "RegulationLicensingService" AS ENUM ('DEPLOYMENT_CERTIFICATE', 'LRA_DIRECTORY', 'LRA_VERIFICATION', 'LRA_PERSONNEL_ACCREDITATION', 'SRA_ASSISTANCE', 'SUBMISSION_OF_REPORTS');

-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "tracksRegulationLicensing" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RegulationLicensing" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "personnelId" TEXT NOT NULL,
    "requestingParty" TEXT NOT NULL,
    "sex" "ClientSex" NOT NULL,
    "services" "RegulationLicensingService"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulationLicensing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegulationLicensing_officeId_serviceDate_idx" ON "RegulationLicensing"("officeId", "serviceDate");

-- AddForeignKey
ALTER TABLE "RegulationLicensing" ADD CONSTRAINT "RegulationLicensing_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulationLicensing" ADD CONSTRAINT "RegulationLicensing_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

