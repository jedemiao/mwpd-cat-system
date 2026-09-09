-- The office log (src/app/(dashboard)/office-log) is the first reader of this
-- table: newest-first, scoped to one office. AuditLog only ever grows, so give
-- that access path an index rather than leaving it on a sequential scan.
CREATE INDEX "AuditLog_officeId_createdAt_idx" ON "AuditLog"("officeId", "createdAt");
