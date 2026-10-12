# Security 3d: scope legacy AI actions and schedulers to active task membership

## Findings
The legacy general-assistant task actions and timeline workflows had independent `userId` checks instead of the new `taskAccessWhere` rule. Removed collaborators can still own previously created shared subtasks, so `userId` alone cannot authorize those actions. The legacy AI task-creation path also accepted an unverified `sphereId`.

## Fix
- Restrict the legacy assistant's personal task context, rebalance candidates, task and subtask operations, and undo to *user-owned AND actively accessible* tasks. This deliberately preserves the old legacy feature scope: it does not start modifying other members' shared tasks.
- Restrict AI nudge, timeline preparation, auto-postpone, timeline apply and final overdue writes to active task access, rechecking the predicate on write for the long-running scheduling actions.
- Validate sphere ownership before any legacy AI `create_task` insert. A non-existent or foreign sphere causes the AI action to be skipped with a clear action report, not to create the task.
- No database migration, new env vars, frontend/Mini App/Android code, payments or credit pricing changes.

## Checks
1. Create a private task through general AI actions, update its title, due date and sector, undo, reschedule: all work.
2. Exclude user B from shared task A after B authored subtask S. Try legacy general-assistant delete/update/undo with S ID: must be skipped and not modify S.
3. The legacy assistant must not receive descriptions of tasks authored by removed B in its personal context; timeline optimization and overdue scheduling must exclude those shared objects.
4. Creation into own existing sector works. Attempt `create_task` with unknown/foreign sector ID: task not created and report explains invalid sector.
5. Regular task-specific AI chat, unified AI planner tools, web/Mini App, billing and notifications continue to work.

## Limitations
Static regression tests verify query guards. No live database/integration test is included. Some unrelated modules and operations still require review; an AI request already in flight during a member removal may have additional race windows. Rollback restores the insecure behavior and is only for urgent recovery.
