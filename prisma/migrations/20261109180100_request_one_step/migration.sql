ALTER TABLE access_requests ADD COLUMN routing_mode "RequestRoutingMode" NOT NULL DEFAULT 'VIA_HEAD', ADD COLUMN one_step_reason text, ADD COLUMN one_step_blocked_reason text;
ALTER TABLE access_requests ADD CONSTRAINT access_requests_one_step_blocked_reason CHECK (one_step_blocked_reason IS NULL OR (routing_mode = 'ONE_STEP' AND one_step_blocked_reason IN ('PRICE_MISSING','RATE_MISSING')));
ALTER TABLE access_requests ADD CONSTRAINT access_requests_one_step_reason CHECK (one_step_reason IS NULL OR one_step_reason IN ('REQUESTER_IS_HEAD','NO_DEPARTMENT_HEAD','HEAD_LEFT'));
ALTER TABLE access_requests ADD CONSTRAINT access_requests_one_step_pair CHECK ((routing_mode = 'ONE_STEP') = (one_step_reason IS NOT NULL));
CREATE INDEX access_requests_department_routing_state_idx ON access_requests (department_id, routing_mode, state);
-- Old rows remain readable, and updates of historical rows do not rewrite their history.
CREATE FUNCTION access_request_steps_retired_flags() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.same_person_as_spend OR NEW.no_independent_review THEN
    RAISE EXCEPTION 'Retired approval flags cannot be written' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER access_request_steps_retired_flags BEFORE INSERT ON access_request_steps FOR EACH ROW EXECUTE FUNCTION access_request_steps_retired_flags();
ALTER TABLE access_request_steps DROP CONSTRAINT access_request_steps_holder_check;
ALTER TABLE access_request_steps ADD CONSTRAINT access_request_steps_holder_check CHECK (
 (state = 'PENDING' AND assignee_employee_id IS NOT NULL AND assigned_at IS NOT NULL AND waiting_reason IS NULL AND decided_at IS NULL)
 OR (state = 'WAITING' AND assignee_employee_id IS NULL AND assigned_at IS NULL AND waiting_reason IS NOT NULL AND decided_at IS NULL)
 OR (state IN ('APPROVED','REJECTED','COMPLETED') AND assignee_employee_id IS NOT NULL AND assigned_at IS NOT NULL AND waiting_reason IS NULL AND decided_at IS NOT NULL)
 OR (state = 'CLOSED' AND (assignee_employee_id IS NULL) = (assigned_at IS NULL) AND waiting_reason IS NULL AND decided_at IS NOT NULL)
 OR (state = 'NOT_REQUIRED' AND kind = 'NEED' AND assignee_employee_id IS NULL AND assigned_at IS NULL AND waiting_reason IS NULL AND decided_at IS NULL)
);
UPDATE access_requests r SET routing_mode = 'ONE_STEP', one_step_reason = CASE WHEN EXISTS (SELECT 1 FROM access_request_steps s WHERE s.request_id = r.id AND s.kind = 'NEED' AND s.routing_row IN (2,8)) THEN 'REQUESTER_IS_HEAD' ELSE 'NO_DEPARTMENT_HEAD' END
WHERE r.state NOT IN ('DRAFT','REJECTED','IT_REJECTED','COMPLETED','FAILED','WITHDRAWN','CANCELLED') AND EXISTS (SELECT 1 FROM access_request_steps s WHERE s.request_id = r.id AND s.kind = 'NEED' AND (s.routing_row IN (2,8) OR (s.routing_row = 4 AND s.state IN ('PENDING','WAITING') AND NOT EXISTS (SELECT 1 FROM department_head_periods hp WHERE hp.department_id = r.department_id AND hp.valid_from > CURRENT_DATE))));
UPDATE access_request_steps s SET state = 'NOT_REQUIRED', assignee_employee_id = NULL, assigned_at = NULL, waiting_reason = NULL, waiting_since = NULL, same_person_as_spend = false, no_independent_review = false WHERE s.kind = 'NEED' AND s.state IN ('PENDING','WAITING') AND EXISTS (SELECT 1 FROM access_requests r WHERE r.id = s.request_id AND r.routing_mode = 'ONE_STEP' AND NOT EXISTS (SELECT 1 FROM access_request_steps sp WHERE sp.request_id = r.id AND sp.kind = 'SPEND_APPROVAL' AND sp.state IN ('PENDING','WAITING')));

-- Retired decision roles remain in enums for historical records, but new decisions use current roles only.
ALTER TABLE approval_records ADD CONSTRAINT approval_records_current_role CHECK (decider_role IN ('MANAGER','SPENDING_APPROVER')) NOT VALID;
UPDATE access_request_lines l SET state = 'NEED_CONFIRMED' WHERE state = 'AWAITING_NEED' AND EXISTS (SELECT 1 FROM access_requests r WHERE r.id = l.request_id AND r.routing_mode = 'ONE_STEP' AND NOT EXISTS (SELECT 1 FROM access_request_steps sp WHERE sp.request_id = r.id AND sp.kind = 'SPEND_APPROVAL' AND sp.state IN ('PENDING','WAITING')));
ALTER TABLE access_request_line_decisions ADD CONSTRAINT access_request_line_decisions_current_role CHECK (decider_role IN ('MANAGER','SPENDING_APPROVER')) NOT VALID;
