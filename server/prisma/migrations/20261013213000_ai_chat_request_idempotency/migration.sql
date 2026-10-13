CREATE TABLE "AiChatRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "payloadSha256" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "responseJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AiChatRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiChatRequest_status_check" CHECK ("status" IN ('PROCESSING','SUCCEEDED','FAILED'))
);
CREATE UNIQUE INDEX "AiChatRequest_userId_clientRequestId_key" ON "AiChatRequest"("userId", "clientRequestId");
CREATE INDEX "AiChatRequest_status_createdAt_idx" ON "AiChatRequest"("status", "createdAt");
ALTER TABLE "AiChatRequest"
  ADD CONSTRAINT "AiChatRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
