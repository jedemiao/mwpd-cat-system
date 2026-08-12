-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "incomingRegisterForm" BOOLEAN NOT NULL DEFAULT false;

-- MWPTD's register, supplied by the office. Keyed off tracksArta rather than a
-- hard-coded code, the same way the pipeline flag is, so a database seeded for
-- a different division onboards correctly.
--
-- Safe for their existing rows: every field this layout drops (timeReceived,
-- receivedById, originAgency, signatory, notes, dcSignOffDate) is empty on all
-- of their documents, so nothing recorded becomes unreachable from the form.
UPDATE "Office" SET "incomingRegisterForm" = true WHERE "tracksArta" = true;
