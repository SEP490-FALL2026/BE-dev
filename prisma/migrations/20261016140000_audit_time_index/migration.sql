-- Serves the Audit Trail page that has no actor filter (US-01-06): the newest events first, in the order the
-- query sorts by, so an unfiltered or time-window page needs no sort. The query carries no organization
-- predicate (one installation, one organization), so the (organization_id, occurred_at) index cannot serve it.
-- Adds an index only; no data and no constraint changes.
CREATE INDEX "audit_events_occurred_at_id_idx" ON "audit_events"("occurred_at" DESC, "id" DESC);
