-- Work phase 2. Additive expansion; existing personal tables untouched.
CREATE TABLE "OrganizationDepartment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationDepartment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationDepartment_organizationId_name_key"
  ON "OrganizationDepartment"("organizationId", "name");
CREATE INDEX "OrganizationDepartment_organizationId_createdAt_idx"
  ON "OrganizationDepartment"("organizationId", "createdAt");

ALTER TABLE "OrganizationMember" ADD COLUMN "departmentId" TEXT;
CREATE INDEX "OrganizationMember_departmentId_idx" ON "OrganizationMember"("departmentId");

CREATE TABLE "OrganizationInvitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation"("tokenHash");
CREATE INDEX "OrganizationInvitation_organizationId_expiresAt_idx"
  ON "OrganizationInvitation"("organizationId", "expiresAt");

ALTER TABLE "OrganizationDepartment"
  ADD CONSTRAINT "OrganizationDepartment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationMember"
  ADD CONSTRAINT "OrganizationMember_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "OrganizationDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrganizationInvitation"
  ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationInvitation"
  ADD CONSTRAINT "OrganizationInvitation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
