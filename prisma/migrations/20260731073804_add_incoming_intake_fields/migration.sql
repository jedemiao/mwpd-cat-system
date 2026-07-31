-- CreateEnum
CREATE TYPE "DocumentOrigin" AS ENUM ('INTERNAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "IncomingDocument" ADD COLUMN     "documentType" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "origin" "DocumentOrigin" NOT NULL DEFAULT 'EXTERNAL',
ADD COLUMN     "originAgency" TEXT,
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "signatory" TEXT,
ADD COLUMN     "timeReceived" TEXT;

-- CreateTable
CREATE TABLE "IncomingDocumentActivity" (
    "incomingId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,

    CONSTRAINT "IncomingDocumentActivity_pkey" PRIMARY KEY ("incomingId","activityId")
);

-- AddForeignKey
ALTER TABLE "IncomingDocument" ADD CONSTRAINT "IncomingDocument_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingDocumentActivity" ADD CONSTRAINT "IncomingDocumentActivity_incomingId_fkey" FOREIGN KEY ("incomingId") REFERENCES "IncomingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingDocumentActivity" ADD CONSTRAINT "IncomingDocumentActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

