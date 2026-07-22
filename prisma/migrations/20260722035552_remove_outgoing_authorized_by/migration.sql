/*
  Warnings:

  - You are about to drop the column `authorizedBy` on the `OutgoingDocument` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "OutgoingDocument" DROP COLUMN "authorizedBy";
