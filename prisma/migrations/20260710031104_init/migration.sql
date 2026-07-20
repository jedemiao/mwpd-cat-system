-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DIVISION_CHIEF', 'RECORDS_STAFF', 'STAFF');

-- CreateEnum
CREATE TYPE "DocComplexity" AS ENUM ('SIMPLE', 'COMPLEX', 'HIGHLY_TECHNICAL');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('CTO', 'VACATION', 'SICK', 'EMERGENCY', 'OTHER');

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingDocument" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "dateReceived" TIMESTAMP(3) NOT NULL,
    "routingNumber" TEXT NOT NULL,
    "documentTitle" TEXT NOT NULL,
    "routedToId" TEXT,
    "instructions" TEXT,
    "complexity" "DocComplexity" NOT NULL DEFAULT 'SIMPLE',
    "leadTimeDays" INTEGER NOT NULL DEFAULT 3,
    "dueDate" TIMESTAMP(3),
    "numCorrections" INTEGER NOT NULL DEFAULT 0,
    "progressRemarks" TEXT,
    "dateCompleted" TIMESTAMP(3),
    "dcSignOffDate" TIMESTAMP(3),
    "scannedCopyUrl" TEXT,
    "filed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutgoingDocument" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "dateReleased" TIMESTAMP(3) NOT NULL,
    "routingNumber" TEXT NOT NULL,
    "documentTitle" TEXT NOT NULL,
    "instructions" TEXT,
    "authorizedBy" TEXT,
    "receivedBy" TEXT,
    "progressRemarks" TEXT,
    "scannedCopyUrl" TEXT,
    "filed" BOOLEAN NOT NULL DEFAULT false,
    "relatedIncomingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutgoingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "activityName" TEXT NOT NULL,
    "remarks" TEXT,
    "officeOrderUrl" TEXT,
    "memoUrl" TEXT,
    "inspectionReportUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityAssignee" (
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ActivityAssignee_pkey" PRIMARY KEY ("activityId","userId")
);

-- CreateTable
CREATE TABLE "Leave" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "dateFiled" TIMESTAMP(3),
    "leaveStart" TIMESTAMP(3) NOT NULL,
    "leaveEnd" TIMESTAMP(3),
    "type" "LeaveType" NOT NULL DEFAULT 'OTHER',
    "personnelId" TEXT NOT NULL,
    "scannedCopyUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Office_code_key" ON "Office"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingDocument_routingNumber_key" ON "IncomingDocument"("routingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OutgoingDocument_routingNumber_key" ON "OutgoingDocument"("routingNumber");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingDocument" ADD CONSTRAINT "IncomingDocument_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingDocument" ADD CONSTRAINT "IncomingDocument_routedToId_fkey" FOREIGN KEY ("routedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingDocument" ADD CONSTRAINT "OutgoingDocument_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingDocument" ADD CONSTRAINT "OutgoingDocument_relatedIncomingId_fkey" FOREIGN KEY ("relatedIncomingId") REFERENCES "IncomingDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityAssignee" ADD CONSTRAINT "ActivityAssignee_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityAssignee" ADD CONSTRAINT "ActivityAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
