-- Personal Economic ledger. No data is copied from Finance Bot.
CREATE TABLE "EconomicAccount" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "currency" TEXT NOT NULL DEFAULT 'RUB', "openingBalanceMinor" BIGINT NOT NULL DEFAULT 0,
 "isPrimary" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EconomicAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EconomicOperation" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "amountMinor" BIGINT NOT NULL, "sourceAccountId" TEXT NOT NULL, "targetAccountId" TEXT,
 "category" TEXT, "title" TEXT NOT NULL, "note" TEXT,
 "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EconomicOperation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EconomicCategory" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "EconomicCategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EconomicDebt" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "direction" TEXT NOT NULL,
 "counterparty" TEXT NOT NULL, "amountMinor" BIGINT NOT NULL, "note" TEXT, "dueAt" TIMESTAMP(3),
 "isClosed" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EconomicDebt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EconomicLoan" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "lender" TEXT,
 "principalMinor" BIGINT NOT NULL, "annualRateBps" INTEGER NOT NULL, "termMonths" INTEGER NOT NULL,
 "startDate" TIMESTAMP(3) NOT NULL, "isClosed" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EconomicLoan_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EconomicAssistantMessage" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "EconomicAssistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EconomicAccount_userId_name_key" ON "EconomicAccount"("userId","name");
CREATE INDEX "EconomicAccount_userId_isPrimary_idx" ON "EconomicAccount"("userId","isPrimary");
CREATE INDEX "EconomicOperation_userId_occurredAt_id_idx" ON "EconomicOperation"("userId","occurredAt","id");
CREATE INDEX "EconomicOperation_userId_kind_occurredAt_idx" ON "EconomicOperation"("userId","kind","occurredAt");
CREATE INDEX "EconomicOperation_sourceAccountId_kind_idx" ON "EconomicOperation"("sourceAccountId","kind");
CREATE INDEX "EconomicOperation_targetAccountId_kind_idx" ON "EconomicOperation"("targetAccountId","kind");
CREATE UNIQUE INDEX "EconomicCategory_userId_kind_name_key" ON "EconomicCategory"("userId","kind","name");
CREATE INDEX "EconomicCategory_userId_kind_idx" ON "EconomicCategory"("userId","kind");
CREATE INDEX "EconomicDebt_userId_isClosed_dueAt_idx" ON "EconomicDebt"("userId","isClosed","dueAt");
CREATE INDEX "EconomicLoan_userId_isClosed_idx" ON "EconomicLoan"("userId","isClosed");
CREATE INDEX "EconomicAssistantMessage_userId_createdAt_idx" ON "EconomicAssistantMessage"("userId","createdAt");

ALTER TABLE "EconomicAccount" ADD CONSTRAINT "EconomicAccount_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EconomicOperation" ADD CONSTRAINT "EconomicOperation_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EconomicOperation" ADD CONSTRAINT "EconomicOperation_sourceAccountId_fkey"
 FOREIGN KEY ("sourceAccountId") REFERENCES "EconomicAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EconomicOperation" ADD CONSTRAINT "EconomicOperation_targetAccountId_fkey"
 FOREIGN KEY ("targetAccountId") REFERENCES "EconomicAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EconomicCategory" ADD CONSTRAINT "EconomicCategory_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EconomicDebt" ADD CONSTRAINT "EconomicDebt_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EconomicLoan" ADD CONSTRAINT "EconomicLoan_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EconomicAssistantMessage" ADD CONSTRAINT "EconomicAssistantMessage_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
