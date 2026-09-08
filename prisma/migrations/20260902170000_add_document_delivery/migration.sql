-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'RECEIVED');

-- CreateTable
CREATE TABLE "DocumentDelivery" (
    "id" TEXT NOT NULL,
    "outgoingId" TEXT NOT NULL,
    "toOfficeId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "receivedIncomingId" TEXT,
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentDelivery_receivedIncomingId_key" ON "DocumentDelivery"("receivedIncomingId");

-- CreateIndex
CREATE INDEX "DocumentDelivery_toOfficeId_status_idx" ON "DocumentDelivery"("toOfficeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentDelivery_outgoingId_toOfficeId_key" ON "DocumentDelivery"("outgoingId", "toOfficeId");

-- AddForeignKey
ALTER TABLE "DocumentDelivery" ADD CONSTRAINT "DocumentDelivery_outgoingId_fkey" FOREIGN KEY ("outgoingId") REFERENCES "OutgoingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDelivery" ADD CONSTRAINT "DocumentDelivery_toOfficeId_fkey" FOREIGN KEY ("toOfficeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDelivery" ADD CONSTRAINT "DocumentDelivery_receivedIncomingId_fkey" FOREIGN KEY ("receivedIncomingId") REFERENCES "IncomingDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDelivery" ADD CONSTRAINT "DocumentDelivery_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

