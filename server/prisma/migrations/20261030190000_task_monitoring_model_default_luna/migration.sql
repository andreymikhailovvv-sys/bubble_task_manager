-- Change the default only for future tasks. Existing manually chosen models
-- (including Terra and Sol) remain untouched.
ALTER TABLE "Task" ALTER COLUMN "aiMonitoringModel" SET DEFAULT 'gpt-6-luna';
