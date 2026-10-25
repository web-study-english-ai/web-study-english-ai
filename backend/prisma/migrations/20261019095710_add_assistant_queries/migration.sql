-- CreateTable
CREATE TABLE "assistant_queries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "word_id" TEXT,
    "source_ids" TEXT[],
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "duration_ms" INTEGER,
    "client_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_queries_client_event_id_key" ON "assistant_queries"("client_event_id");

-- CreateIndex
CREATE INDEX "assistant_queries_user_id_created_at_idx" ON "assistant_queries"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "assistant_queries" ADD CONSTRAINT "assistant_queries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
