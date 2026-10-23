-- Quick AI mirror messages can link directly back to their monitored task.
ALTER TABLE "GeneralAiMessage" ADD COLUMN "monitoringTaskId" TEXT;
