DROP INDEX IF EXISTS "kb_chunks_embedding_idx";
ALTER TABLE "kb_chunks" ALTER COLUMN "embedding" TYPE vector(384) USING NULL::vector(384);
ALTER TABLE "kb_chunks" ADD COLUMN "embedding_model" TEXT;
CREATE INDEX "kb_chunks_embedding_idx" ON "kb_chunks" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE "word_embeddings" (
    "word_id"    TEXT NOT NULL,
    "embedding"  vector(384) NOT NULL,
    "model"      TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "word_embeddings_pkey" PRIMARY KEY ("word_id")
);
ALTER TABLE "word_embeddings" ADD CONSTRAINT "word_embeddings_word_id_fkey"
    FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "word_embeddings_embedding_idx" ON "word_embeddings" USING hnsw ("embedding" vector_cosine_ops);
