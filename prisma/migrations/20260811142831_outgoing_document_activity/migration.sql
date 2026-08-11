-- CreateTable
CREATE TABLE "OutgoingDocumentActivity" (
    "outgoingId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,

    CONSTRAINT "OutgoingDocumentActivity_pkey" PRIMARY KEY ("outgoingId","activityId")
);

-- AddForeignKey
ALTER TABLE "OutgoingDocumentActivity" ADD CONSTRAINT "OutgoingDocumentActivity_outgoingId_fkey" FOREIGN KEY ("outgoingId") REFERENCES "OutgoingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingDocumentActivity" ADD CONSTRAINT "OutgoingDocumentActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

