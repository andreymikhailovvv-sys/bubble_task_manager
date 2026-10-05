ALTER TABLE "Task" ADD COLUMN "collaborationId" TEXT;

CREATE TABLE "CollaborativeTask" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "rootTaskId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborativeTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollaborativeTaskMember" (
  "id" TEXT NOT NULL,
  "collaborationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sphereId" TEXT,
  "color" TEXT NOT NULL DEFAULT '#8b5cf6',
  "statusOverride" "TaskStatus",
  "isHidden" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaborativeTaskMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollaborativeTask_token_key" ON "CollaborativeTask"("token");
CREATE UNIQUE INDEX "CollaborativeTask_rootTaskId_key" ON "CollaborativeTask"("rootTaskId");
CREATE INDEX "Task_collaborationId_idx" ON "Task"("collaborationId");
CREATE UNIQUE INDEX "CollaborativeTaskMember_collaborationId_userId_key" ON "CollaborativeTaskMember"("collaborationId", "userId");
CREATE INDEX "CollaborativeTaskMember_userId_idx" ON "CollaborativeTaskMember"("userId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "CollaborativeTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollaborativeTaskMember" ADD CONSTRAINT "CollaborativeTaskMember_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "CollaborativeTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollaborativeTaskMember" ADD CONSTRAINT "CollaborativeTaskMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
