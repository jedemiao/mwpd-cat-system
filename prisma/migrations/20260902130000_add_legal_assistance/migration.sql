-- CreateEnum
CREATE TYPE "ClientSex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "LegalAssistanceForm" AS ENUM ('RV', 'MONEY_CLAIMS', 'DAW', 'DAE', 'IR', 'TIP', 'NON_SUPPORT', 'OTHERS');

-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "tracksLegalAssistance" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LegalAssistance" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "assistanceDate" TIMESTAMP(3) NOT NULL,
    "legalOfficerId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "sex" "ClientSex" NOT NULL,
    "forms" "LegalAssistanceForm"[],
    "scannedCopyUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalAssistance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalAssistance_officeId_assistanceDate_idx" ON "LegalAssistance"("officeId", "assistanceDate");

-- AddForeignKey
ALTER TABLE "LegalAssistance" ADD CONSTRAINT "LegalAssistance_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAssistance" ADD CONSTRAINT "LegalAssistance_legalOfficerId_fkey" FOREIGN KEY ("legalOfficerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

