CREATE TABLE "StandaloneNoteGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8b5cf6',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StandaloneNoteGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StandaloneNote" ADD COLUMN "groupId" TEXT;

CREATE UNIQUE INDEX "StandaloneNoteGroup_userId_name_key" ON "StandaloneNoteGroup"("userId", "name");
CREATE INDEX "StandaloneNoteGroup_userId_createdAt_idx" ON "StandaloneNoteGroup"("userId", "createdAt");
CREATE INDEX "StandaloneNote_userId_groupId_idx" ON "StandaloneNote"("userId", "groupId");

ALTER TABLE "StandaloneNoteGroup" ADD CONSTRAINT "StandaloneNoteGroup_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StandaloneNote" ADD CONSTRAINT "StandaloneNote_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "StandaloneNoteGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
