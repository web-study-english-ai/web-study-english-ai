/*
  Warnings:

  - A unique constraint covering the columns `[client_event_id]` on the table `reviews` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "client_event_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "reviews_client_event_id_key" ON "reviews"("client_event_id");
