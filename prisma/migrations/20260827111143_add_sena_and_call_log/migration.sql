-- CreateEnum
CREATE TYPE "SenaStatus" AS ENUM ('SCHEDULED', 'SETTLED', 'FOR_SECOND_CONFERENCE', 'NOT_SETTLED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "tracksCallLog" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tracksSena" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SenaConference" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "conferenceDate" TIMESTAMP(3) NOT NULL,
    "conferenceTime" TEXT NOT NULL,
    "conferenceNumber" INTEGER NOT NULL DEFAULT 1,
    "mediatorId" TEXT NOT NULL,
    "complainant" TEXT NOT NULL,
    "respondent" TEXT NOT NULL,
    "status" "SenaStatus" NOT NULL DEFAULT 'SCHEDULED',
    "amountSettled" DECIMAL(12,2),
    "previousConferenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SenaConference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "callDate" TIMESTAMP(3) NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "callerName" TEXT NOT NULL,
    "concern" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SenaConference_officeId_conferenceDate_idx" ON "SenaConference"("officeId", "conferenceDate");

-- CreateIndex
CREATE INDEX "SenaConference_previousConferenceId_idx" ON "SenaConference"("previousConferenceId");

-- CreateIndex
CREATE INDEX "CallLog_officeId_callDate_idx" ON "CallLog"("officeId", "callDate");

-- AddForeignKey
ALTER TABLE "SenaConference" ADD CONSTRAINT "SenaConference_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenaConference" ADD CONSTRAINT "SenaConference_mediatorId_fkey" FOREIGN KEY ("mediatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenaConference" ADD CONSTRAINT "SenaConference_previousConferenceId_fkey" FOREIGN KEY ("previousConferenceId") REFERENCES "SenaConference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

