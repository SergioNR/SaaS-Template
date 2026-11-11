-- Shared failure memory of the pending-upload sweep: set the first time a
-- row's bucket delete failed. Nullable without default, so adding it is a
-- metadata-only change on PostgreSQL
-- AlterTable
ALTER TABLE "File" ADD COLUMN "cleanup_failed_at" TIMESTAMP(3);
