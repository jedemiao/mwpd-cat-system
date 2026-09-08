-- The office counts drafts, not corrections. "No. of corrections" was a
-- hand-typed number on the incoming record; the same quantity is now the number
-- of OutgoingVersion rows on the reply, reported as "No. of versions" and
-- counted from the version history itself rather than stored twice.
--
-- Dropped outright rather than renamed: no row in any database has ever carried
-- a non-zero value, so there is nothing here to migrate, and a kept column would
-- be a second answer to a question the version history already answers.
-- AlterTable
ALTER TABLE "IncomingDocument" DROP COLUMN "numCorrections";

