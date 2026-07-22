-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "internalMemoSeqCounter" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "InternalMemo_officeId_memorandumNumber_key" ON "InternalMemo"("officeId", "memorandumNumber");
