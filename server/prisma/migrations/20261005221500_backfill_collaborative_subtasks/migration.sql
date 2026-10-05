-- Repair subtasks created by AI flows that bypassed taskService.create()
-- and therefore did not inherit the collaboration from their parent task.
UPDATE "Task" AS child
SET "collaborationId" = parent."collaborationId"
FROM "Task" AS parent
WHERE child."parentTaskId" = parent."id"
  AND child."collaborationId" IS NULL
  AND parent."collaborationId" IS NOT NULL;
