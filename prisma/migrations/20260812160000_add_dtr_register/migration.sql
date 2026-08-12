-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "tracksDtr" BOOLEAN NOT NULL DEFAULT false;

-- The DTR filing register is MWPTD's practice. Keyed off tracksArta rather than
-- a hard-coded code, as the other office flags are.
UPDATE "Office" SET "tracksDtr" = true WHERE "tracksArta" = true;

-- CreateTable
CREATE TABLE "DtrRecord" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "periodMonth" TIMESTAMP(3) NOT NULL,
    "dateReceived" TIMESTAMP(3),
    "dateFiled" TIMESTAMP(3),
    "dateSubmittedToHr" TIMESTAMP(3),
    "personnelId" TEXT NOT NULL,
    "submittedAndChecked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DtrRecord_pkey" PRIMARY KEY ("id")
);

-- One DTR per person per month, per office.
CREATE UNIQUE INDEX "DtrRecord_officeId_periodMonth_personnelId_key" ON "DtrRecord"("officeId", "periodMonth", "personnelId");

-- The roster view always reads one office's rows for one month.
CREATE INDEX "DtrRecord_officeId_periodMonth_idx" ON "DtrRecord"("officeId", "periodMonth");

-- AddForeignKey
ALTER TABLE "DtrRecord" ADD CONSTRAINT "DtrRecord_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DtrRecord" ADD CONSTRAINT "DtrRecord_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
