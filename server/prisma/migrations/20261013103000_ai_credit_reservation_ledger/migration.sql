CREATE TABLE "AiCreditReservationRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "includedMilli" INTEGER NOT NULL,
  "bonusMilli" INTEGER NOT NULL,
  "purchasedMilli" INTEGER NOT NULL,
  "totalMilli" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "chargedMilli" INTEGER NOT NULL DEFAULT 0,
  "refundedMilli" INTEGER NOT NULL DEFAULT 0,
  "expiredIncludedMilli" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "AiCreditReservationRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiCreditReservationRecord_amounts_check"
    CHECK ("includedMilli" >= 0 AND "bonusMilli" >= 0 AND "purchasedMilli" >= 0
      AND "totalMilli" = "includedMilli" + "bonusMilli" + "purchasedMilli"
      AND "totalMilli" > 0 AND "chargedMilli" >= 0 AND "refundedMilli" >= 0
      AND "expiredIncludedMilli" >= 0
      AND "chargedMilli" + "refundedMilli" + "expiredIncludedMilli" <= "totalMilli"),
  CONSTRAINT "AiCreditReservationRecord_status_check"
    CHECK ("status" IN ('RESERVED','SETTLED','REFUNDED'))
);
CREATE INDEX "AiCreditReservationRecord_userId_status_idx" ON "AiCreditReservationRecord"("userId", "status");
ALTER TABLE "AiCreditReservationRecord" ADD CONSTRAINT "AiCreditReservationRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
