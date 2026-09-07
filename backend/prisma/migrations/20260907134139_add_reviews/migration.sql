-- CreateEnum
CREATE TYPE "SchedulerSource" AS ENUM ('FSRS_AI', 'FALLBACK_TS', 'SM2');

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "card_id" TEXT,
    "word_id" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL,
    "review_th" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "elapsed_days" DOUBLE PRECISION,
    "scheduled_days" DOUBLE PRECISION,
    "duration_ms" INTEGER NOT NULL,
    "state_before" "CardState" NOT NULL,
    "difficulty_before" DOUBLE PRECISION,
    "stability_before" DOUBLE PRECISION,
    "predicted_retrievability" DOUBLE PRECISION,
    "state_after" "CardState" NOT NULL,
    "difficulty_after" DOUBLE PRECISION,
    "stability_after" DOUBLE PRECISION,
    "next_interval_days" DOUBLE PRECISION,
    "scheduler" "SchedulerSource" NOT NULL,
    "model_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_user_id_reviewed_at_idx" ON "reviews"("user_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "reviews_scheduler_idx" ON "reviews"("scheduler");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_card_id_review_th_key" ON "reviews"("card_id", "review_th");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "user_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_elapsed_days_check"
  CHECK ("elapsed_days" IS NULL OR ("elapsed_days" >= 0 AND "elapsed_days" <= 1095));

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_check"
  CHECK ("rating" BETWEEN 1 AND 4);

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_review_th_check"
  CHECK ("review_th" >= 1);

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_predicted_retrievability_check"
  CHECK ("predicted_retrievability" IS NULL OR
         ("predicted_retrievability" >= 0 AND "predicted_retrievability" <= 1));

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_duration_ms_check"
  CHECK ("duration_ms" >= 0 AND "duration_ms" <= 600000);