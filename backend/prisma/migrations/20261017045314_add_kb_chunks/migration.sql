CREATE EXTENSION IF NOT EXISTS vector;
-- CreateTable
CREATE TABLE "kb_chunks" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "topic" TEXT,
    "cefr" "CefrLevel",
    "embedding" vector(768),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kb_chunks_topic_idx" ON "kb_chunks"("topic");

-- CreateIndex
CREATE INDEX "kb_chunks_cefr_idx" ON "kb_chunks"("cefr");
-- Chỉ mục HNSW cho tìm kiếm lân cận gần đúng theo khoảng cách cosine.
-- Prisma không diễn đạt được chỉ mục này nên phải viết tay.
CREATE INDEX "kb_chunks_embedding_idx"
  ON "kb_chunks" USING hnsw ("embedding" vector_cosine_ops);