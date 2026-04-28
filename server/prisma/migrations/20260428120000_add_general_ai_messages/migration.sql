-- CreateTable
CREATE TABLE "GeneralAiMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneralAiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneralAiMessage_userId_idx" ON "GeneralAiMessage"("userId");

-- CreateIndex
CREATE INDEX "GeneralAiMessage_userId_createdAt_idx" ON "GeneralAiMessage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "GeneralAiMessage" ADD CONSTRAINT "GeneralAiMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
