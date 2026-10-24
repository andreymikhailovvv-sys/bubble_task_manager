CREATE TABLE "BirthdayWishlistReservation" (
  "id" TEXT NOT NULL,
  "giftId" VARCHAR(60) NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BirthdayWishlistReservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BirthdayWishlistReservation_giftId_key"
  ON "BirthdayWishlistReservation"("giftId");
