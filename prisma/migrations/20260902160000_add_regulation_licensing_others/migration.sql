-- AlterEnum
ALTER TYPE "RegulationLicensingService" ADD VALUE 'OTHERS';

-- AlterTable
ALTER TABLE "RegulationLicensing" ADD COLUMN     "othersDetail" TEXT;

