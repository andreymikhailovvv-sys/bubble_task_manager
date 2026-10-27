-- Preserve actual provider search evidence for Quick AI, Android and web history.
ALTER TABLE "GeneralAiMessage"
  ADD COLUMN "webSearchUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "webSources" JSONB,
  ADD COLUMN "webCitations" JSONB;
