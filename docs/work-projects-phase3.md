# Work Phase 3 · company-owned projects and independent Work entry

## Product changes

- Work projects and tasks belong to an organization. **No company rows are placed in personal Task/Sphere.** Personal planner data and existing personal routes do not change.
- A manager (OWNER, ADMIN, MANAGER) creates/projects and tasks, assigns an existing organization member, changes priority and due date and archives a project. Archiving locks task mutations until unarchived.
- An assigned MEMBER can update **only status** of their own task. A VIEWER sees, never changes tasks. A MEMBER with no assignment cannot update others' tasks.
- Deleting a company membership nulls active task assignments due to a foreign key with `onDelete: SetNull`. A task belongs to the project, not the user.
- First iteration is intentionally scoped to basic task CRUD, status, priority, due dates and employee assignment. Task comments, attachments, subtasks, automonitoring, AI dispatcher, project-level permissions, complex approval rules and task notifications have **not yet** been connected. To be introduced using tenant-aware permissions, without silently reusing personal task APIs.
- List endpoints indicate `hasMore` when exceeding 200 projects or 500 tasks, rather than silently suggesting completeness. Pagination is a follow-on for scale.

## Work login optimization

- `client/work.html` and `src/work-entry.tsx` are a separate Vite multi-page entrypoint; `work.planirovych.ru` serves only that HTML from Express. No personal `App`, `MiniApp`, planning stores, personal CSS or BusinessApp module is loaded when an unauthenticated visitor arrives.
- The login form appears immediately from the small Work bundle while the browser checks a preexisting session in the background. The user's click on **Войти** starts the Work loading overlay; after login and bootstrap the corporate app is loaded via `React.lazy`.
- If a preexisting Work session is valid, the workspace loads automatically with the Work overlay. Invitation `/join/<token>` continues loading the dedicated invitation UI.
- Branded overlay: **Планировыч.Work**, subtitle **Твоя компания под контролем**, muted lavender/blue/teal. It is not displayed on the first unauthenticated visit. React removes it when the corporate workspace has mounted. 25 second timeout shows an explicit retry rather than an infinite spinner.
- The personal `index.html` loader and home page behavior are preserved.

## Backend

- New additive Prisma models `OrganizationProject`, `OrganizationWorkTask`; new status and priority enum. Only new tables and foreign keys, existing Task/Sphere untouched. Additive migration `20261031190000_work_projects_tasks`.
- Authenticated membership is checked for all reads and writes; projectId is always constrained by organizationId. AssignedMemberId must belong to same organization. Cross-tenant IDs return 404 or 400. Editing an assigned task is rechecked on the write.
- Standard Rate Limits, audit log and workflow automations for Work tasks not included in this PR.

## Production checklist

- Take a Timeweb PostgreSQL backup before merge/deploy.
- Verify `work.planirovych.ru` in an incognito window opens login without loader; click **Войти** to see Work-branded loader and organization workspace.
- Verify personal `planirovych.ru` and mini-app unchanged.
- Test two organizations with two accounts: create a project and tasks in Org A, verify B cannot access. Test OWNER/MANAGER/MEMBER/VIEWER and non-member.
- Test invitation links still work and logout falls back to login.
- Confirm migrations deploy successfully and validate Timeweb memory/cold start separately.

**No data-store split:** everything remains in the same PostgreSQL database, with segregated organization-owned tables and membership checks.
