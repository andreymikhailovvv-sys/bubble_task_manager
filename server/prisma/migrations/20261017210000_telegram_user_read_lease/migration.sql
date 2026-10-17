-- Account-level MTProto read coordination across application replicas.
-- No dialog, message, session, or credentials are stored in this lease.
CREATE TABLE "TelegramUserReadLease" (
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramUserReadLease_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "TelegramUserReadLease" ADD CONSTRAINT "TelegramUserReadLease_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
