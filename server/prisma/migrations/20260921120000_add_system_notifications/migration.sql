CREATE TABLE "SystemNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "eventKey" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemNotification_eventKey_key" ON "SystemNotification"("eventKey");
CREATE INDEX "SystemNotification_userId_createdAt_idx" ON "SystemNotification"("userId", "createdAt");
CREATE INDEX "SystemNotification_userId_readAt_idx" ON "SystemNotification"("userId", "readAt");
ALTER TABLE "SystemNotification" ADD CONSTRAINT "SystemNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
