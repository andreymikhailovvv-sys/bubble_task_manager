-- Existing personal note groups and note assignments remain unchanged.
-- Sector-linked groups are provisioned on authenticated list requests.
ALTER TABLE "StandaloneNoteGroup" ADD COLUMN "sphereId" TEXT;
CREATE UNIQUE INDEX "StandaloneNoteGroup_sphereId_key" ON "StandaloneNoteGroup"("sphereId");
ALTER TABLE "StandaloneNoteGroup" ADD CONSTRAINT "StandaloneNoteGroup_sphereId_fkey"
  FOREIGN KEY ("sphereId") REFERENCES "Sphere"("id") ON DELETE SET NULL ON UPDATE CASCADE;
