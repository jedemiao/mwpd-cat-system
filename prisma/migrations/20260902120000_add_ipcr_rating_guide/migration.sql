-- CreateEnum
CREATE TYPE "IpcrRatingDimension" AS ENUM ('QUALITY', 'EFFICIENCY', 'TIMELINESS');

-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "tracksIpcrRatingGuide" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "IpcrRatingGuideRow" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "semester" "DipcrSemester" NOT NULL,
    "section" TEXT NOT NULL,
    "pap" TEXT NOT NULL,
    "successIndicator" TEXT NOT NULL,
    "meansOfVerification" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpcrRatingGuideRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpcrRatingGuideAccountable" (
    "rowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "IpcrRatingGuideAccountable_pkey" PRIMARY KEY ("rowId","userId")
);

-- CreateTable
CREATE TABLE "IpcrRatingDescriptor" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "dimension" "IpcrRatingDimension" NOT NULL,
    "level5" TEXT,
    "level4" TEXT,
    "level3" TEXT,
    "level2" TEXT,
    "level1" TEXT,

    CONSTRAINT "IpcrRatingDescriptor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IpcrRatingGuideRow_officeId_year_semester_idx" ON "IpcrRatingGuideRow"("officeId", "year", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "IpcrRatingDescriptor_rowId_dimension_key" ON "IpcrRatingDescriptor"("rowId", "dimension");

-- AddForeignKey
ALTER TABLE "IpcrRatingGuideRow" ADD CONSTRAINT "IpcrRatingGuideRow_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpcrRatingGuideAccountable" ADD CONSTRAINT "IpcrRatingGuideAccountable_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "IpcrRatingGuideRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpcrRatingGuideAccountable" ADD CONSTRAINT "IpcrRatingGuideAccountable_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpcrRatingDescriptor" ADD CONSTRAINT "IpcrRatingDescriptor_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "IpcrRatingGuideRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

