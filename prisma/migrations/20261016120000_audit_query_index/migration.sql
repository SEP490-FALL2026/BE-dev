-- Serves the Audit Trail filter by actor (US-01-06): the newest events of one account first,
-- in the same order the query sorts by, so a page needs no sort step. Adds an index only; no data
-- and no constraint changes, and the append-only triggers are untouched.
CREATE INDEX "audit_events_actor_app_user_id_occurred_at_id_idx"
  ON "audit_events"("actor_app_user_id", "occurred_at" DESC, "id" DESC);
