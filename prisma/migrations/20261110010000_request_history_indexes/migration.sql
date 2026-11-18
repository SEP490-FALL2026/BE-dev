-- qd103-request-history-by-role: the histories of requests by role read pages of access_requests by department (the head) and over
-- the whole organization (IT Admin, spending approver, Finance), newest sent first then by id; the audit report of the Super Admin
-- reads the free internal requests sent through the one-step route. Indexes only: no data, no grant.

CREATE INDEX "access_requests_department_submitted_idx"
    ON "access_requests" ("department_id", "submitted_at" DESC, "id" DESC);

CREATE INDEX "access_requests_submitted_idx"
    ON "access_requests" ("submitted_at" DESC, "id" DESC);

CREATE INDEX "access_requests_no_need_approver_idx"
    ON "access_requests" ("submitted_at" DESC, "id" DESC)
    WHERE "routing_mode" = 'ONE_STEP' AND "branch" = 'INTERNAL_FREE';
