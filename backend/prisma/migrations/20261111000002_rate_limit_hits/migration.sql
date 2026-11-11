-- Shared counters of the credential-path rate limiters (RATE_LIMIT_STORE=postgres).
-- reset_at is timestamptz because it is written and compared with the
-- database's now()
-- CreateTable
CREATE TABLE "RateLimitHit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "reset_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimitHit_reset_at_idx" ON "RateLimitHit"("reset_at");
