-- New chat uploads are user-owned and scoped to an originating task or conversation.
CREATE TABLE "AiConversationAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "projectId" TEXT,
    "chatId" TEXT,
    "messageId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentBase64" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiConversationAttachment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiConversationAttachment_userId_messageId_ordinal_key" ON "AiConversationAttachment"("userId", "messageId", "ordinal");
CREATE INDEX "AiConversationAttachment_userId_taskId_createdAt_idx" ON "AiConversationAttachment"("userId", "taskId", "createdAt");
CREATE INDEX "AiConversationAttachment_userId_projectId_chatId_createdAt_idx" ON "AiConversationAttachment"("userId", "projectId", "chatId", "createdAt");
CREATE INDEX "AiConversationAttachment_userId_messageId_idx" ON "AiConversationAttachment"("userId", "messageId");
ALTER TABLE "AiConversationAttachment" ADD CONSTRAINT "AiConversationAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiConversationAttachment" ADD CONSTRAINT "AiConversationAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
