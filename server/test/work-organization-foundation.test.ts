import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeOrganizationName, organizationMemberWhere } from '../src/lib/organization-access.js';

test('name validation rejects non-text, control characters and out-of-range names', () => {
  assert.equal(normalizeOrganizationName(null), null);
  assert.equal(normalizeOrganizationName(' '), null);
  assert.equal(normalizeOrganizationName('A'), null);
  assert.equal(normalizeOrganizationName('A'.repeat(101)), null);
  assert.equal(normalizeOrganizationName('Team\nA'), null);
  assert.equal(normalizeOrganizationName('  Компания    Альфа  '), 'Компания Альфа');
  assert.equal(normalizeOrganizationName('Компания Альфа'), 'Компания Альфа');
});

test('tenant lookups are constrained by current authenticated membership', () => {
  assert.deepEqual(organizationMemberWhere('user-one'), { members: { some: { userId: 'user-one' } } });
  assert.notDeepEqual(organizationMemberWhere('user-one'), organizationMemberWhere('user-two'));
});

test('Work routes do not expose organizations by guessing their IDs or alter personal tasks', async () => {
  const src = await readFile(new URL('../src/routes/business-organizations.ts', import.meta.url), 'utf8');
  assert.match(src, /organizationMember\.findMany\(/);
  assert.match(src, /where: \{ userId: req\.user!\.id \}/);
  assert.match(src, /organizationMemberWhere\(req\.user!\.id\)/);
  assert.match(src, /organization\.create\(/);
  assert.match(src, /role: 'OWNER'/);
  assert.match(src, /isBusinessAdmin\(actorId, admins\)/);
  assert.doesNotMatch(src, /prisma\.task\./);
});

test('new B2B schema is additive and leaves personal task ownership unchanged', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../prisma/migrations/20261031130000_work_organization_foundation/migration.sql', import.meta.url), 'utf8');
  assert.match(schema, /model Organization\s*\{/);
  assert.match(schema, /model OrganizationMember\s*\{/);
  assert.match(schema, /@@unique\(\[organizationId, userId\]\)/);
  assert.match(schema, /userId\s+String\s*\n\s*user\s+User\s+@relation\(fields: \[userId\]/);
  assert.doesNotMatch(migration, /ALTER TABLE "Task"/);
  assert.doesNotMatch(migration, /ALTER TABLE "User"/);
  assert.match(migration, /CREATE TABLE "Organization"/);
  assert.match(migration, /CREATE TABLE "OrganizationMember"/);
});
