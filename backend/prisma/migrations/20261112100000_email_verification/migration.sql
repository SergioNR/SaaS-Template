-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email_verified_at" TIMESTAMP(3);

-- DataMigration
-- Every account that exists before email verification ships is treated as
-- verified at its creation time, so the rollout never locks anyone out
UPDATE "User" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;

-- CreateTable
CREATE TABLE "EmailVerificationTokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_expires" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationTokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationTokens_token_hash_key" ON "EmailVerificationTokens"("token_hash");

-- CreateIndex
CREATE INDEX "EmailVerificationTokens_user_id_idx" ON "EmailVerificationTokens"("user_id");

-- AddForeignKey
ALTER TABLE "EmailVerificationTokens" ADD CONSTRAINT "EmailVerificationTokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
