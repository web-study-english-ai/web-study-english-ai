-- CreateEnum
CREATE TYPE "CefrLevel" AS ENUM ('A1', 'A2', 'B1', 'B2');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "level" "CefrLevel" NOT NULL DEFAULT 'A1',
ADD COLUMN     "max_reviews_per_day" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "new_words_per_day" INTEGER NOT NULL DEFAULT 20;
