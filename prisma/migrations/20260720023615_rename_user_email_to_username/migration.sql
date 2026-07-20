-- Only seed/test accounts and their audit trail exist at this point (no
-- Incoming/Outgoing/Activity/Leave records reference these users), so the
-- login identifier is switched from email to a "first_name.last_name"
-- username by clearing and re-seeding rather than transforming old values.
DELETE FROM "AuditLog";
DELETE FROM "User";

ALTER TABLE "User" DROP COLUMN "email";
ALTER TABLE "User" ADD COLUMN "username" TEXT NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
