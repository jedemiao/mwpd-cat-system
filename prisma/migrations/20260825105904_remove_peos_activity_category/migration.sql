-- AlterEnum
BEGIN;
CREATE TYPE "ActivityCategory_new" AS ENUM ('JOB_FAIR', 'QUICK_RESPONSE_TEAM', 'CONFERENCE_TRAINING', 'MEETINGS', 'SKELETON_FORCE', 'PUBLIC_HOLIDAY', 'OTHERS');
ALTER TABLE "Activity" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "Activity" ALTER COLUMN "category" TYPE "ActivityCategory_new" USING ("category"::text::"ActivityCategory_new");
ALTER TYPE "ActivityCategory" RENAME TO "ActivityCategory_old";
ALTER TYPE "ActivityCategory_new" RENAME TO "ActivityCategory";
DROP TYPE "ActivityCategory_old";
ALTER TABLE "Activity" ALTER COLUMN "category" SET DEFAULT 'OTHERS';
COMMIT;

