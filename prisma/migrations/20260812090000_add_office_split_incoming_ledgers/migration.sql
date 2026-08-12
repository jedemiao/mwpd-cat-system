-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "splitIncomingLedgers" BOOLEAN NOT NULL DEFAULT false;

-- The split registers arrived with MWPSD's adoption of their own tracker, in
-- the same commit as their register column layout — so the office already
-- reading its ledgers that way is the office that wants them apart. Keyed off
-- that flag rather than a hard-coded code, so a database seeded for a different
-- division onboards correctly.
--
-- Safe as a blanket default for everyone else: no office outside MWPSD has ever
-- filed an internal incoming document (every incomingInternalSeqCounter is 0),
-- so nothing existing is renumbered or stranded by merging the ledgers.
UPDATE "Office" SET "splitIncomingLedgers" = true WHERE "detailedLedgerColumns" = true;
