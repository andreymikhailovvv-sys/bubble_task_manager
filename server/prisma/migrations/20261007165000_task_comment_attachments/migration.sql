CREATE TABLE "TaskCommentAttachment" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "contentBase64" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskCommentAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskCommentAttachment_commentId_createdAt_idx"
  ON "TaskCommentAttachment"("commentId", "createdAt");

ALTER TABLE "TaskCommentAttachment"
  ADD CONSTRAINT "TaskCommentAttachment_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
