-- AlterTable
ALTER TABLE "user_cards" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
-- Đảm bảo giữ nguyên chỉ mục HNSW cho pgvector (WSEA-110)
CREATE INDEX IF NOT EXISTS "kb_chunks_embedding_idx" ON "kb_chunks" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "word_embeddings_embedding_idx" ON "word_embeddings" USING hnsw ("embedding" vector_cosine_ops);