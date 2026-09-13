-- CreateEnum
CREATE TYPE "PartOfSpeech" AS ENUM ('NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'PREPOSITION', 'PRONOUN', 'CONJUNCTION', 'INTERJECTION', 'NUMERAL');

-- CreateEnum
CREATE TYPE "CardState" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- CreateEnum
CREATE TYPE "DictionaryStatus" AS ENUM ('FOUND', 'NOT_FOUND');

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "words" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "cefr" "CefrLevel" NOT NULL,
    "pos" "PartOfSpeech" NOT NULL,
    "ipa" TEXT,
    "meaning_vi" TEXT NOT NULL,
    "example_en" TEXT,
    "is_concrete_noun" BOOLEAN NOT NULL DEFAULT false,
    "freq_per_million" INTEGER,
    "sfi" DECIMAL(5,2),
    "topic_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_cards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "state" "CardState" NOT NULL DEFAULT 'NEW',
    "difficulty" DOUBLE PRECISION,
    "stability" DOUBLE PRECISION,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "due_at" TIMESTAMP(3),
    "last_reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_entries" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "phonetic_text" TEXT,
    "audio_url" TEXT,
    "definitions" JSONB,
    "source" TEXT NOT NULL DEFAULT 'dictionaryapi.dev',
    "status" "DictionaryStatus" NOT NULL DEFAULT 'FOUND',
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dictionary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "words_term_key" ON "words"("term");

-- CreateIndex
CREATE UNIQUE INDEX "words_rank_key" ON "words"("rank");

-- CreateIndex
CREATE INDEX "words_cefr_idx" ON "words"("cefr");

-- CreateIndex
CREATE INDEX "words_topic_id_idx" ON "words"("topic_id");

-- CreateIndex
CREATE INDEX "words_rank_idx" ON "words"("rank");

-- CreateIndex
CREATE INDEX "user_cards_user_id_state_idx" ON "user_cards"("user_id", "state");

-- CreateIndex
CREATE INDEX "user_cards_user_id_due_at_idx" ON "user_cards"("user_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_cards_user_id_word_id_key" ON "user_cards"("user_id", "word_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entries_term_key" ON "dictionary_entries"("term");

-- AddForeignKey
ALTER TABLE "words" ADD CONSTRAINT "words_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
