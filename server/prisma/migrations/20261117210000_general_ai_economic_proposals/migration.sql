-- Keep only opaque proposal IDs in the durable Quick AI message.
-- Statuses and details are always rehydrated from owner-scoped EconomicAiProposal.
ALTER TABLE "GeneralAiMessage" ADD COLUMN "economicProposalIds" JSONB;
