-- Keep only lightweight verified document metadata in Quick AI chat history.
-- The file bytes remain private in AiGeneratedDocument.
ALTER TABLE "GeneralAiMessage" ADD COLUMN "generatedDocument" JSONB;
