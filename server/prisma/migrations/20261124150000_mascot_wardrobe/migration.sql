-- Account-owned wardrobe choices. Expired premium selections are filtered on read.
ALTER TABLE "User" ADD COLUMN "plannerMascotSkin" TEXT NOT NULL DEFAULT 'classic',
ADD COLUMN "economicMascotSkin" TEXT NOT NULL DEFAULT 'classic';
