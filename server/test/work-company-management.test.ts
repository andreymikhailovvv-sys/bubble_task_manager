import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canAssignRole, canManageOrganization, createInvitationToken, invitationTokenHash,
  isInvitableRole, isWorkRole, normalizeDepartmentName, validInvitationToken,
  INVITATION_LIFETIME_MS
} from '../src/lib/work-company-roles.js';

const read = (relative: string) => readFile(new URL(relative, import.meta.url),'utf8');
test('permissions never grant administration to managers, members or viewers',()=>{
  for(const role of ['MANAGER','MEMBER','VIEWER'] as const){
    assert.equal(canManageOrganization(role),false);
    assert.equal(canAssignRole(role,'MEMBER','ADMIN'),false);
  }
  assert.equal(canManageOrganization('OWNER'),true);
  assert.equal(canManageOrganization('ADMIN'),true);
  assert.equal(canAssignRole('ADMIN','OWNER','MEMBER'),false);
  assert.equal(canAssignRole('ADMIN','ADMIN','MEMBER'),false);
  assert.equal(canAssignRole('ADMIN','MEMBER','OWNER'),false);
  assert.equal(canAssignRole('ADMIN','MEMBER','ADMIN'),false);
  assert.equal(canAssignRole('ADMIN','MEMBER','MANAGER'),true);
  assert.equal(canAssignRole('OWNER','MEMBER','OWNER'),true);
  assert.equal(isWorkRole('SYSTEM_ADMIN'),false);
  assert.equal(isInvitableRole('OWNER'),false);
  assert.equal(isInvitableRole('VIEWER'),true);
});

test('bearer invite tokens are cryptographically random, well-formed and saved only as digests',()=>{
  const first=createInvitationToken();
  const second=createInvitationToken();
  assert.notEqual(first,second);
  assert.equal(validInvitationToken(first),true);
  assert.equal(validInvitationToken(first.slice(1)),false);
  assert.notEqual(invitationTokenHash(first),first);
  assert.match(invitationTokenHash(first),/^[a-f0-9]{64}$/);
  assert.equal(invitationTokenHash(first),invitationTokenHash(first));
  assert.equal(INVITATION_LIFETIME_MS,7*24*3600*1000);
});

test('department name rejects controls and unbounded text',()=>{
  assert.equal(normalizeDepartmentName(' A '),null);
  assert.equal(normalizeDepartmentName(' A\nB '),null);
  assert.equal(normalizeDepartmentName('x'.repeat(81)),null);
  assert.equal(normalizeDepartmentName('  Отдел    продаж '),'Отдел продаж');
});

test('company APIs enforce tenant membership, role gates and serializable last-owner checks', async()=>{
  const [company,invitations,api]=await Promise.all([
    read('../src/routes/business-company-management.ts'),
    read('../src/routes/business-invitations.ts'),
    read('../src/routes/api.ts')
  ]);
  assert.match(company,/organizationId_userId: \{ organizationId, userId: req\.user!\.id \}/);
  assert.match(company,/canManageOrganization\(actor\.role\)/);
  assert.match(company,/canAssignRole\(currentActor\.role, current\.role, nextRole\)/);
  assert.match(company,/owners <= 1/);
  assert.ok(company.split('TransactionIsolationLevel.Serializable').length>=3);
  assert.match(company,/where: \\{ id: req\\.params\\.departmentId, organizationId: req\\.params\\.organizationId \\}/);
  assert.match(company,/where: \\{ id: req\\.body\\.departmentId, organizationId \\}/);
  assert.match(company,/role === 'ADMIN' && actor\.role !== 'OWNER'/);
  assert.match(company,/15 ссылок за час/);
  assert.match(invitations,/tokenHash: invitationTokenHash\(req\.params\.token\)/);
  assert.match(invitations,/updated\.count !== 1/);
  assert.match(invitations,/usedAt: null, revokedAt: null, expiresAt:/);
  assert.match(invitations,/isGuestAccount\(actor\)/);
  assert.match(api,/organizationMember\.findFirst\(\{/);
  assert.doesNotMatch(company,/prisma\.task\./);
});

test('organization changes are additive and never rewrite personal data',async()=>{
  const [schema,sql,client,work]=await Promise.all([
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20261031170000_work_company_management/migration.sql'),
    read('../../client/src/WorkCompanyView.tsx'),
    read('../../client/src/BusinessApp.tsx')
  ]);
  assert.match(schema,/model OrganizationDepartment \{/);
  assert.match(schema,/model OrganizationInvitation \{/);
  assert.match(schema,/@@unique\(\[organizationId, name\]\)/);
  assert.match(schema,/@@index\(\[departmentId\]\)/);
  assert.doesNotMatch(sql,/ALTER TABLE "Task"/);
  assert.doesNotMatch(sql,/ALTER TABLE "Sphere"/);
  assert.match(client,/Сотрудники/);
  assert.match(client,/Приглашения/);
  assert.match(client,/Подразделения/);
  assert.match(work,/onClick=\{\(\)=>openOrganization\(org\.id\)\}/);
});
