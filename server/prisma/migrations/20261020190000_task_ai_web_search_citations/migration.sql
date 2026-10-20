-- Persist the web-search evidence alongside task AI messages, including after refresh.
ALTER TABLE "TaskAiMessage"
  ADD COLUMN "webSearchUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "webSources" JSONB,
  ADD COLUMN "webCitations" JSONB;
