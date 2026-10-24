-- CreateEnum
CREATE TYPE "ReadingAttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "reading_passages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "cefr" "CefrLevel" NOT NULL,
    "estimated_minutes" INTEGER NOT NULL DEFAULT 5,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_questions" (
    "id" TEXT NOT NULL,
    "passage_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "options" TEXT[],
    "correct_option_index" INTEGER NOT NULL,
    "explanation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "passage_id" TEXT NOT NULL,
    "status" "ReadingAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "answers" JSONB NOT NULL DEFAULT '[]',
    "answered_count" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER,
    "total_questions" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reading_passages_slug_key" ON "reading_passages"("slug");

-- CreateIndex
CREATE INDEX "reading_passages_cefr_idx" ON "reading_passages"("cefr");

-- CreateIndex
CREATE INDEX "reading_passages_topic_idx" ON "reading_passages"("topic");

-- CreateIndex
CREATE INDEX "reading_passages_cefr_topic_sort_order_idx" ON "reading_passages"("cefr", "topic", "sort_order");

-- CreateIndex
CREATE INDEX "reading_questions_passage_id_idx" ON "reading_questions"("passage_id");

-- CreateIndex
CREATE UNIQUE INDEX "reading_questions_passage_id_order_index_key" ON "reading_questions"("passage_id", "order_index");

-- CreateIndex
CREATE INDEX "reading_attempts_user_id_passage_id_status_idx" ON "reading_attempts"("user_id", "passage_id", "status");

-- CreateIndex
CREATE INDEX "reading_attempts_user_id_updated_at_idx" ON "reading_attempts"("user_id", "updated_at");

-- AddForeignKey
ALTER TABLE "reading_questions" ADD CONSTRAINT "reading_questions_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "reading_passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_attempts" ADD CONSTRAINT "reading_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_attempts" ADD CONSTRAINT "reading_attempts_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "reading_passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
