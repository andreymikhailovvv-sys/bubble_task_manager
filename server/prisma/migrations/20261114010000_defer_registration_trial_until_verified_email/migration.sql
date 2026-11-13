-- Existing accounts, trials and purchased balances remain unchanged.
-- Only accounts created after this deployment set the flag to true.
ALTER TABLE "User" ADD COLUMN "trialCreditsPendingEmailVerification" BOOLEAN NOT NULL DEFAULT false;
