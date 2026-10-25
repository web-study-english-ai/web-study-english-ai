-- CreateIndex
CREATE INDEX "user_cards_user_id_state_due_at_stability_idx" ON "user_cards"("user_id", "state", "due_at", "stability");

-- CreateIndex
CREATE INDEX "user_cards_user_id_created_at_idx" ON "user_cards"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "user_cards_user_id_last_reviewed_at_idx" ON "user_cards"("user_id", "last_reviewed_at");

-- CreateIndex
CREATE INDEX "words_topic_id_cefr_rank_idx" ON "words"("topic_id", "cefr", "rank");
