-- Case-insensitive emails: citext makes the unique indexes and every
-- `email = ...` lookup case-insensitive in the database itself
CREATE EXTENSION IF NOT EXISTS citext;

-- Fail with a clear message instead of a bare unique violation when existing
-- rows only differ by case - they must be merged by hand first
DO $$
BEGIN
  IF EXISTS (SELECT lower("email") FROM "User" GROUP BY lower("email") HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'User emails that differ only by case exist - merge them before applying this migration';
  END IF;
  IF EXISTS (SELECT "company_id", lower("email") FROM "TeamInvites" GROUP BY "company_id", lower("email") HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Team invites that differ only by email case exist in one company - delete the duplicates before applying this migration';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "TeamInvites" ALTER COLUMN "email" SET DATA TYPE CITEXT;

-- DropIndex (redundant next to the primary key)
DROP INDEX "TeamInvites_id_key";

-- DropIndex (redundant next to the primary key)
DROP INDEX "PasswordResetTokens_id_key";

-- DropIndex (redundant next to the primary key)
DROP INDEX "Subscription_id_key";

-- CreateIndex
CREATE INDEX "User_company_id_idx" ON "User"("company_id");

-- CreateIndex
CREATE INDEX "TeamInvites_invited_by_idx" ON "TeamInvites"("invited_by");

-- CreateIndex
CREATE INDEX "PasswordResetTokens_user_id_idx" ON "PasswordResetTokens"("user_id");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- Rows pointing at users that no longer exist cannot satisfy the new
-- foreign keys. Invites of a deleted inviter were already void (the deletion
-- flow removes them) and orphaned sessions can never be used again
DELETE FROM "TeamInvites" WHERE "invited_by" NOT IN (SELECT "id" FROM "User");
DELETE FROM "Session" WHERE "user_id" IS NOT NULL AND "user_id" NOT IN (SELECT "id" FROM "User");

-- AddForeignKey
ALTER TABLE "TeamInvites" ADD CONSTRAINT "TeamInvites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
