-- CreateEnum
CREATE TYPE "DipcrSemester" AS ENUM ('FIRST', 'SECOND');

-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "tracksDipcr" BOOLEAN NOT NULL DEFAULT false;

-- The D/IPCR is MWPTD's. Keyed off tracksArta rather than a hard-coded code, as
-- the other office flags are.
UPDATE "Office" SET "tracksDipcr" = true WHERE "tracksArta" = true;

-- CreateTable
CREATE TABLE "DipcrIndicator" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "semester" "DipcrSemester" NOT NULL,
    "section" TEXT NOT NULL,
    "pap" TEXT NOT NULL,
    "successIndicator" TEXT NOT NULL,
    "allottedBudget" DECIMAL(14,2),
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DipcrIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DipcrAccountable" (
    "indicatorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DipcrAccountable_pkey" PRIMARY KEY ("indicatorId","userId")
);

-- CreateTable
CREATE TABLE "DipcrAccomplishment" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "narrative" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DipcrAccomplishment_pkey" PRIMARY KEY ("id")
);

-- Every view of this module is one office's one semester.
CREATE INDEX "DipcrIndicator_officeId_year_semester_idx" ON "DipcrIndicator"("officeId", "year", "semester");

-- One cell per indicator per month.
CREATE UNIQUE INDEX "DipcrAccomplishment_indicatorId_month_key" ON "DipcrAccomplishment"("indicatorId", "month");

-- AddForeignKey
ALTER TABLE "DipcrIndicator" ADD CONSTRAINT "DipcrIndicator_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cascade: the children are cells of their row, meaningless without it. This is
-- the same reason ActivityAssignee rows go with their activity.
-- AddForeignKey
ALTER TABLE "DipcrAccountable" ADD CONSTRAINT "DipcrAccountable_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "DipcrIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DipcrAccountable" ADD CONSTRAINT "DipcrAccountable_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DipcrAccomplishment" ADD CONSTRAINT "DipcrAccomplishment_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "DipcrIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
