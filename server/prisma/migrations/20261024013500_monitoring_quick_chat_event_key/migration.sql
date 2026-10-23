ALTER TABLE "GeneralAiMessage" ADD COLUMN "monitoringEventKey" TEXT;
CREATE UNIQUE INDEX "GeneralAiMessage_monitoringEventKey_key" ON "GeneralAiMessage"("monitoringEventKey");
