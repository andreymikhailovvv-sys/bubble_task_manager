CREATE TABLE "GiftWishlistReservation" (
  "id" TEXT NOT NULL,
  "ownerTokenHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GiftWishlistReservation_pkey" PRIMARY KEY ("id")
);
