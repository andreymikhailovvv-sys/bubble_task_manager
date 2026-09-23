CREATE TABLE "ProductUpdateBlock" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "imageData" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductUpdateBlock_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductUpdateBlock_position_idx" ON "ProductUpdateBlock"("position");
