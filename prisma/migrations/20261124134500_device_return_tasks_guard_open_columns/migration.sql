-- While a return task is OPEN, only due_on and overdue_noticed_on may change (SPEC §3.1).
-- Preserves the existing DELETE, identity-column, and closed-row checks and blocks changes to any other column while OPEN.
CREATE OR REPLACE FUNCTION device_return_tasks_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A job of taking a machine back is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'device_return_tasks_kept'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.device_id, NEW.registration_id, NEW.employee_id, NEW.offboarding_case_id, NEW.department_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.device_id, OLD.registration_id, OLD.employee_id, OLD.offboarding_case_id, OLD.department_id, OLD.created_at)
  THEN RAISE EXCEPTION 'A job of taking a machine back keeps what it is about'
     USING ERRCODE = '55000', CONSTRAINT = 'device_return_tasks_identity_fixed'; END IF;
  IF OLD.state <> 'OPEN' AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*)
  THEN RAISE EXCEPTION 'A job of taking a machine back that was closed does not change any more'
     USING ERRCODE = '55000', CONSTRAINT = 'device_return_tasks_closed_fixed'; END IF;
  IF OLD.state = 'OPEN' AND NEW.state = 'OPEN'
     AND (NEW.condition_on_receipt, NEW.software_removal, NEW.software_removal_note, NEW.outcome_note, NEW.handled_by_app_user_id, NEW.handled_at)
         IS DISTINCT FROM (OLD.condition_on_receipt, OLD.software_removal, OLD.software_removal_note, OLD.outcome_note, OLD.handled_by_app_user_id, OLD.handled_at)
  THEN RAISE EXCEPTION 'A job of taking a machine back that is open only moves its due date and reminder day'
     USING ERRCODE = '55000', CONSTRAINT = 'device_return_tasks_open_fixed'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
