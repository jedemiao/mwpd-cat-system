-- Rename, not drop-and-add: the generated diff would recreate the column and
-- silently reset every office's setting back to the default.
ALTER TABLE "Office" RENAME COLUMN "detailedIncomingColumns" TO "detailedLedgerColumns";

-- AlterTable: receipt acknowledgement on outgoing documents, plus the type code
-- the incoming side already stores.
ALTER TABLE "OutgoingDocument" ADD COLUMN     "documentType" TEXT,
ADD COLUMN     "receivingOffice" TEXT,
ADD COLUMN     "receivedDate" TIMESTAMP(3),
ADD COLUMN     "receivedTime" TEXT;
