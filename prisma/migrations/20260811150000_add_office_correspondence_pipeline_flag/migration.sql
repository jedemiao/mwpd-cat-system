-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "tracksCorrespondencePipeline" BOOLEAN NOT NULL DEFAULT false;

-- The pipeline board is MWPTD's, in the same way the ARTA board is: it answers
-- a question about a correspondence workload the ARTA-exempt divisions do not
-- carry in the same shape. Switched on here for whichever office already tracks
-- ARTA rather than by hard-coding a code, so a database seeded for a different
-- division onboards correctly.
UPDATE "Office" SET "tracksCorrespondencePipeline" = true WHERE "tracksArta" = true;
