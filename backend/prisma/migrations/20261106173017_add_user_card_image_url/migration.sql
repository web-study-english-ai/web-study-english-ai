-- DropIndex
DROP INDEX "kb_chunks_embedding_idx";

-- DropIndex
DROP INDEX "word_embeddings_embedding_idx";

-- AlterTable
ALTER TABLE "user_cards" ADD COLUMN     "image_url" TEXT;
