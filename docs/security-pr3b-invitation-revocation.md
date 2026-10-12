# Security PR 3b: revoke collaboration invite links when a member is removed

## Scope and behavior

- When an owner removes someone via the existing "Исключить" action, their membership is removed as before.
- The collaboration's existing invitation token is rotated in the **same database transaction**. All invitations containing the old token immediately become invalid for preview and joining.
- Other **current** participants retain their membership and their task access. No task, subtask, comment or attachment is deleted by this PR.
- The owner can open the existing invite dialog again to retrieve the new URL. There is no new button or frontend change.
- Existing share URLs remain valid unless someone is explicitly excluded. Creating/opening a share normally does **not** rotate the URL.
- Accepting a share now serializes a guarded token check and the membership upsert in one transaction. A token rotated during the join cannot be reused after the removal committed.

## Risk and compatibility

- Important: old invite links previously sent to *other* potential invitees also stop working after an exclusion. Recopy and resend a fresh link if someone still needs to join.
- Possible change: attempting to join through an expired invitation yields a server error (currently the generic API error for a missing token). The UI may display its existing request error. No new modal or visual behavior was added.
- No new env variables, DB migration, client changes or Android work.
- This PR only prevents rejoining through an old invite. It **does not yet prove that all other access paths** to shared subtasks authored by an excluded user are closed. That more comprehensive access audit is planned for PR 3c, after the pending two-user collaboration smoke tests.

## Manual smoke test on disposable collaboration

1. Create a shared task as A; copy an invite L1; have B join with L1.
2. As owner A, exclude B. Check B disappears from the member list; A and any remaining members still see the task and their existing subtasks.
3. In a fresh browser/session, opening L1 must not allow joining the task. Note: B's existing authored subtasks may still appear due to a separate known access-control gap that PR 3c will address; this should not be mistaken for rejoining.
4. As A, reopen the invite dialog and copy L2. Verify L2 differs from L1 and a new, never-before-invited test user C can join with L2.
5. Previously joined participant D must **remain a member** even though their original invitation link was rotated.
6. Test ordinary shared-task text chat, comments, adding/finishing a subtask, moving personal sphere in web and Mini App.

## Rollback

Reverting PR 3b returns the previous token behavior for future removals. Already-rotated tokens are not restored. Existing members and data are not modified by a code rollback. Wait for CI and review manual collaboration checks before merging.
