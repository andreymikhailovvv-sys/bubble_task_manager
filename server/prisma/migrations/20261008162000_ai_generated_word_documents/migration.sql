CREATE TABLE "AiGeneratedDocument" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "taskId" TEXT,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  "size" INTEGER NOT NULL,
  "contentBase64" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiGeneratedDocument_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TaskAiMessage" ADD COLUMN "generatedDocumentId" TEXT;

CREATE UNIQUE INDEX "TaskAiMessage_generatedDocumentId_key" ON "TaskAiMessage"("generatedDocumentId");
CREATE INDEX "AiGeneratedDocument_userId_createdAt_idx" ON "AiGeneratedDocument"("userId", "createdAt");
CREATE INDEX "AiGeneratedDocument_taskId_createdAt_idx" ON "AiGeneratedDocument"("taskId", "createdAt");

ALTER TABLE "AiGeneratedDocument"
  ADD CONSTRAINT "AiGeneratedDocument_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiGeneratedDocument"
  ADD CONSTRAINT "AiGeneratedDocument_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskAiMessage"
  ADD CONSTRAINT "TaskAiMessage_generatedDocumentId_fkey"
  FOREIGN KEY ("generatedDocumentId") REFERENCES "AiGeneratedDocument"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
