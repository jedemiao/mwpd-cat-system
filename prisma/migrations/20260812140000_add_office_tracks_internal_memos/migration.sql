-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "tracksInternalMemos" BOOLEAN NOT NULL DEFAULT false;

-- The internal memorandum register is MWPTD's. Keyed off tracksArta rather than
-- a hard-coded code, as the other office flags are, so a database seeded for a
-- different division onboards correctly.
--
-- Deliberately NOT keyed off "has memos already": that would be true only of
-- MWPTD today, but it would silently re-enable the module for any office that
-- happened to create one, which is the opposite of a deliberate opt-in.
UPDATE "Office" SET "tracksInternalMemos" = true WHERE "tracksArta" = true;
