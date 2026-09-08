-- CreateEnum
CREATE TYPE "OutgoingStatus" AS ENUM ('DRAFT', 'FOR_CHECKING', 'RETURNED', 'APPROVED', 'RELEASED');

-- CreateEnum
CREATE TYPE "OutgoingReviewOutcome" AS ENUM ('RETURNED', 'APPROVED');

-- AlterTable
ALTER TABLE "OutgoingDocument" ADD COLUMN     "status" "OutgoingStatus" NOT NULL DEFAULT 'DRAFT',
ALTER COLUMN "dateReleased" DROP NOT NULL,
ALTER COLUMN "routingNumber" DROP NOT NULL;

-- Backfill: every row that predates the review loop was, by definition, an
-- already-released dispatch — before this migration the outgoing register had
-- no other kind of row, and dateReleased and routingNumber were both required.
-- Without this the DRAFT default would move the entire existing register onto
-- the work board and leave /outgoing?view=released empty on deploy.
UPDATE "OutgoingDocument" SET "status" = 'RELEASED';

-- CreateTable
CREATE TABLE "OutgoingVersion" (
    "id" TEXT NOT NULL,
    "outgoingId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "staffNote" TEXT,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "OutgoingReviewOutcome",
    "chiefRemarks" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "OutgoingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutgoingNote" (
    "id" TEXT NOT NULL,
    "outgoingId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutgoingNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutgoingVersion_outgoingId_versionNumber_idx" ON "OutgoingVersion"("outgoingId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OutgoingVersion_outgoingId_versionNumber_key" ON "OutgoingVersion"("outgoingId", "versionNumber");

-- CreateIndex
CREATE INDEX "OutgoingNote_outgoingId_createdAt_idx" ON "OutgoingNote"("outgoingId", "createdAt");

-- AddForeignKey
ALTER TABLE "OutgoingVersion" ADD CONSTRAINT "OutgoingVersion_outgoingId_fkey" FOREIGN KEY ("outgoingId") REFERENCES "OutgoingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingVersion" ADD CONSTRAINT "OutgoingVersion_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingVersion" ADD CONSTRAINT "OutgoingVersion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingNote" ADD CONSTRAINT "OutgoingNote_outgoingId_fkey" FOREIGN KEY ("outgoingId") REFERENCES "OutgoingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingNote" ADD CONSTRAINT "OutgoingNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

