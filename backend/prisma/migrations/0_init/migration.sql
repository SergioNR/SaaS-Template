-- Baseline: the whole pre-squash history (20261019000000_init ..
-- 20261112100000_email_verification) folded into one migration. Generated with
-- `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`,
-- plus what the schema cannot express: the citext extension, the superadmin
-- CHECK constraint and the reference rows (roles, permissions, grants).
-- Databases that ran the old history are bridged by
-- prisma/baselineSquashedMigrations.js (start.sh), never by re-running this.

-- citext backs the case-insensitive User.email / TeamInvites.email columns
CREATE EXTENSION IF NOT EXISTS citext;


-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('pending', 'ready');

-- CreateEnum
CREATE TYPE "UserRoles" AS ENUM ('user', 'superadmin');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRoles" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),
    "email_verified_at" TIMESTAMP(3),
    "company_id" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "stripe_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "TeamInvites" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "invited_by" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_expires" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamInvites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetTokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_expires" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetTokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationTokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_expires" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationTokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sid" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "stripe_subscription_id" TEXT,
    "stripe_status" TEXT,
    "stripe_synced_at" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "s3_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanup_failed_at" TIMESTAMP(3),

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "reset_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_company_id_idx" ON "User"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "Company_stripe_id_key" ON "Company"("stripe_id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvites_token_hash_key" ON "TeamInvites"("token_hash");

-- CreateIndex
CREATE INDEX "TeamInvites_invited_by_idx" ON "TeamInvites"("invited_by");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvites_company_id_email_key" ON "TeamInvites"("company_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetTokens_token_hash_key" ON "PasswordResetTokens"("token_hash");

-- CreateIndex
CREATE INDEX "PasswordResetTokens_user_id_idx" ON "PasswordResetTokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationTokens_token_hash_key" ON "EmailVerificationTokens"("token_hash");

-- CreateIndex
CREATE INDEX "EmailVerificationTokens_user_id_idx" ON "EmailVerificationTokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sid_key" ON "Session"("sid");

-- CreateIndex
CREATE INDEX "Session_user_id_idx" ON "Session"("user_id");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_company_id_key" ON "Subscription"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripe_subscription_id_key" ON "Subscription"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "File_s3_key_key" ON "File"("s3_key");

-- CreateIndex
CREATE INDEX "File_company_id_created_at_idx" ON "File"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "File_status_created_at_idx" ON "File"("status", "created_at");

-- CreateIndex
CREATE INDEX "RateLimitHit_reset_at_idx" ON "RateLimitHit"("reset_at");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvites" ADD CONSTRAINT "TeamInvites_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvites" ADD CONSTRAINT "TeamInvites_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvites" ADD CONSTRAINT "TeamInvites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetTokens" ADD CONSTRAINT "PasswordResetTokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationTokens" ADD CONSTRAINT "EmailVerificationTokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Superadmins belong to no company: a superadmin can never be (re)attached to
-- a company, nor a company member promoted without detaching them first
ALTER TABLE "User"
ADD CONSTRAINT "User_superadmin_has_no_company_check"
CHECK ("role" <> 'superadmin' OR "company_id" IS NULL);

-- SeedData
-- Reference rows with deterministic UUIDs so every environment converges on
-- the same ids. ON CONFLICT DO NOTHING keeps the inserts idempotent
INSERT INTO "Role" ("id", "name") VALUES
    ('00000000-0000-4000-8000-000000000001', 'company_owner'),
    ('00000000-0000-4000-8000-000000000002', 'company_admin'),
    ('00000000-0000-4000-8000-000000000003', 'company_member')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "Permission" ("id", "name") VALUES
    ('00000000-0000-4000-8000-000000000101', 'team.view'),
    ('00000000-0000-4000-8000-000000000102', 'team.invite'),
    ('00000000-0000-4000-8000-000000000103', 'team.remove'),
    ('00000000-0000-4000-8000-000000000104', 'team.manage_roles'),
    ('00000000-0000-4000-8000-000000000105', 'files.view'),
    ('00000000-0000-4000-8000-000000000106', 'files.upload'),
    ('00000000-0000-4000-8000-000000000107', 'files.delete'),
    ('00000000-0000-4000-8000-000000000108', 'billing.manage')
ON CONFLICT ("name") DO NOTHING;

-- Role-permission grants are joined by name
INSERT INTO "RolePermission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
    ('company_owner', 'team.view'),
    ('company_owner', 'team.invite'),
    ('company_owner', 'team.remove'),
    ('company_owner', 'team.manage_roles'),
    ('company_owner', 'files.view'),
    ('company_owner', 'files.upload'),
    ('company_owner', 'files.delete'),
    ('company_owner', 'billing.manage'),
    ('company_admin', 'team.view'),
    ('company_admin', 'team.invite'),
    ('company_admin', 'team.remove'),
    ('company_admin', 'team.manage_roles'),
    ('company_admin', 'files.view'),
    ('company_admin', 'files.upload'),
    ('company_admin', 'files.delete'),
    ('company_member', 'team.view'),
    ('company_member', 'files.view'),
    ('company_member', 'files.upload')
) AS seed("role_name", "permission_name")
JOIN "Role" r ON r."name" = seed."role_name"
JOIN "Permission" p ON p."name" = seed."permission_name"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
