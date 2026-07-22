-- CreateTable
CREATE TABLE "IncomingRoutedStaff" (
    "incomingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "IncomingRoutedStaff_pkey" PRIMARY KEY ("incomingId","userId")
);

-- Carry over existing single-assignee data before dropping the old column
INSERT INTO "IncomingRoutedStaff" ("incomingId", "userId")
SELECT "id", "routedToId" FROM "IncomingDocument" WHERE "routedToId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "IncomingDocument" DROP CONSTRAINT "IncomingDocument_routedToId_fkey";

-- AlterTable
ALTER TABLE "IncomingDocument" DROP COLUMN "routedToId";

-- AddForeignKey
ALTER TABLE "IncomingRoutedStaff" ADD CONSTRAINT "IncomingRoutedStaff_incomingId_fkey" FOREIGN KEY ("incomingId") REFERENCES "IncomingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingRoutedStaff" ADD CONSTRAINT "IncomingRoutedStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
