-- Stripe subscription id moves out of the primary key into its own column,
-- plus the last synced Stripe status and the time that state was read
ALTER TABLE "Subscription" ADD COLUMN "stripe_subscription_id" TEXT,
ADD COLUMN "stripe_status" TEXT,
ADD COLUMN "stripe_synced_at" TIMESTAMP(3);

-- Paid rows used the Stripe `sub_` id as their primary key: copy it to the
-- new column and give the row a fresh uuid (no foreign key references
-- "Subscription"."id"). Trial rows keep their uuid and a NULL Stripe id
UPDATE "Subscription"
SET "stripe_subscription_id" = "id",
    "id" = gen_random_uuid()::text
WHERE "id" LIKE 'sub\_%';

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripe_subscription_id_key" ON "Subscription"("stripe_subscription_id");
