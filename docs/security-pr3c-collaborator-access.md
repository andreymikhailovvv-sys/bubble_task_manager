# Security PR 3c: revoke shared task access for excluded collaborators

## Why
Shared subtasks retain their creator's `userId`. The previous task and AI permissions allowed the creator's `userId` even after the user was excluded. That permitted unauthorized access via a guessed/remembered subtask ID.

## New authorization
- Private tasks (`collaborationId = null`): only the owner.
- Shared roots/subtasks (`collaborationId != null`): only active members (`isHidden = false`) regardless of original author.
- Consistent check is used by task list, create subtask, edit, remove, issue invite, attachments (including JWT download link), AI chat/history/assistant and subtask generation.
- Excluded or hidden subtask authors no longer receive completion notifications.
- Existing comments and direct participant message services already verify active membership, unchanged.

## Compatibility
No DB schema/migrations, env changes, website or Mini App code changes, billing changes or Android work. No task, attachment, comment or chat history records are deleted. A current member can still work with shared subtasks authored by someone since excluded. Personal tasks and their files remain accessible to their authors.

## Manual staging checks
1. User A creates shared task, B joins and creates subtask S, comments and file on S.
2. A removes B. A still sees S and its content; B no longer sees the shared root or S after refreshing both web and Mini App.
3. B attempts to open/edit/delete S by ID, read its task AI chat, download its attachment with an existing short-lived token, add a subtask or issue a share link. All must fail, without altering A's content.
4. User C joins via the fresh invitation link and sees S; A and C can still create/edit collaborative subtasks and send messages.
5. B's own private tasks, files and task chat remain accessible. Hiding a shared task for yourself continues to hide it.
6. Normal web/Mini App operation, document exports, credit spending, payments should not be affected.

## Known boundaries
This PR applies current membership checks to the principal task/attachment/AI routes. It does not systematically solve every other object reference, every background action or in-flight AI request that started before exclusion. Follow-up security audit should cover these without combining unrelated changes in one release. The checks do not delete existing data. Revert only for an urgent regression since rollback restores access weakness.
