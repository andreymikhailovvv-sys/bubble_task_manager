CREATE TABLE "AiRequestRatingGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiRequestRatingGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiRequestRatingGrant_userId_requestKey_key" ON "AiRequestRatingGrant"("userId", "requestKey");
CREATE INDEX "AiRequestRatingGrant_createdAt_idx" ON "AiRequestRatingGrant"("createdAt");
ALTER TABLE "AiRequestRatingGrant" ADD CONSTRAINT "AiRequestRatingGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
