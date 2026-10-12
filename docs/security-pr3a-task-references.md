# Security rollout PR 3a: task sphere and parent authorization

## What changes

- Creating a task, event or subtask with a non-null `sphereId` now verifies that the sphere belongs to the authenticated user. The check runs before the task is written.
- Updating any task's `sphereId`, including moving a shared root task into a participant's own sector, requires that sphere's `userId` match the caller.
- Updating a task's `parentTaskId` to a non-null value requires a **root** parent accessible in the same security context:
  - Private task: the target must be a private root task owned by the same user.
  - Shared task/subtask: the target must belong to **the same collaboration** and the current user must still be a member.
  - A task cannot become its own parent; crossing private/shared collaborations or other users' data is rejected.
- Clearing `sphereId` and clearing `parentTaskId` still work as before. Existing records are **not** modified or migrated.
- The normal collaborative subtask *creation* path stays intact: users may add a subtask under a root task whose collaboration they belong to, even when another member created the root.

## What does not change

No new environment variables, Prisma migrations, UI changes, JWT/cookie changes, payment logic, AI models, cron, Telegram bot, Android code, or share link changes.

The server currently converts Prisma `findFirstOrThrow` not-found to HTTP 404 for a guessed/inaccessible sector or parent. This avoids confirming whether a foreign ID exists. Existing malformed/unauthorized updates may now fail where they previously created a cross-account relation.

## Deployment smoke test

1. As a normal registered user: create tasks in a sphere; change task sphere; create an event; move a task into and out of another own sphere. Refresh and verify everything persists.
2. Create a task with several subtasks on the site, edit a subtask, complete one and delete a test subtask.
3. Repeat subtask creation in Telegram Mini App. Mini App sends the task's own sphere ID on subtask creation.
4. Collaborative task with users A and B: both users can see the root and subtasks, add their own subtask and update it; each can move the *shared root* to a sector they personally own.
5. Negative checks in staging/test accounts: send foreign `sphereId` in create/update, foreign `parentTaskId` in update, or parent from a different collaboration. Expect no write and HTTP 404. The foreign user's tasks, membership and sphere should remain unchanged.
6. AI task chat, task creation via AI, note workspace, reminders, payment and dashboard should behave as before.

## Risk / rollback

Risk is limited to task operations that supply `sphereId` and `parentTaskId`. The website and Mini App UIs do not change. Legacy malformed cross-user references remain in the database, but sending them again in an update may now be rejected. Revert the PR if legitimate collaborative workflows fail; this restores the former vulnerability, so investigate and reapply a corrected check rather than leaving rollback indefinitely.

## Upcoming stage 3b

Audit/restrict deletion and removal in collaborations, rotate share-link tokens on explicit member removal, and review access to notes, comments, attachments and share flows in separate small commits/PRs.
