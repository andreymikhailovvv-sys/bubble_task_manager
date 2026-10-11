CREATE TABLE "StandaloneNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandaloneNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StandaloneNote_userId_updatedAt_idx" ON "StandaloneNote"("userId", "updatedAt");

ALTER TABLE "StandaloneNote" ADD CONSTRAINT "StandaloneNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
