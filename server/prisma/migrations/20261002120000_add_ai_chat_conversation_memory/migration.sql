CREATE TABLE IF NOT EXISTS "AiChatConversationMemory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "summarizedThroughMessageId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "formatVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiChatConversationMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiChatConversationMemory_userId_projectId_chatId_key"
  ON "AiChatConversationMemory"("userId", "projectId", "chatId");
CREATE INDEX IF NOT EXISTS "AiChatConversationMemory_userId_idx" ON "AiChatConversationMemory"("userId");
CREATE INDEX IF NOT EXISTS "AiChatConversationMemory_userId_updatedAt_idx" ON "AiChatConversationMemory"("userId", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "AiChatConversationMemory" ADD CONSTRAINT "AiChatConversationMemory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
