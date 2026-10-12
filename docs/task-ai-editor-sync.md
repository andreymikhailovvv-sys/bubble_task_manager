# Fix: Task AI edits overwritten by stale focused-task drafts

## Root cause
Task chat AI applies `rename_task` and `reschedule_task` immediately in the server; no manual Save is required. Previously the web `closeFocusedTask()` always called a full `PATCH /api/tasks/:id` with the focused editor's old title and due date. The Telegram Mini App did the same in `saveTask()` on tapping X. When the form did not refresh after AI applied changes, X silently reverted the model's successful work. Web background autosave could also overwrite unrelated server-side edits because it sent the entire form snapshot.

## Change
- **Web**: save only fields changed locally compared with the editor's last server snapshot; skip PATCH on unchanged X. Background autosave uses a targeted patch. Refreshed server task fields merge into clean editor fields while preserving unsaved manual changes.
- **Mini App**: snapshot the draft on opening, send only manually changed fields in `saveTask`, skip PATCH if none changed, reconcile after AI refresh without clobbering dirty manual fields.
- Editing description after AI changes title must save *only* description; new title/due date remain intact.
- AI action storage on the server is unchanged. Continue reading `actionReports` in AI chat to determine whether model issued and server applied an action.

## Manual smoke test
1. Open a **private task** on the web, ask **task AI** to rename it and change its deadline. Confirm chat action report says changes were applied. The focused editor should display new title/time.
2. Close with X; reopen. Both changes must remain. Repeat in Telegram Mini App.
3. Open a task and close via X without editing. It should not trigger a PATCH or revert the task's server data.
4. Change only description manually, then ask AI to rename or reschedule task. Wait for UI refresh and close. Manual description and AI title/deadline should all be retained.
5. Check normal manual edits (title, deadline, importance, notification, recurrence and sector) persist on X and still autosave on the web. Test subtask edits on Mini App.
6. If AI action report says no action was performed, capture runtime chat logs for the provider/action parsing case. Deployment build logs do not diagnose model output.

## Scope
No migrations, backend changes, new env vars, AI billing changes, Android source code changes, Google login or collaboration permissions. Web and Mini App share a small pure draft comparison helper, covered by unit/source regression tests in GitHub Actions.
