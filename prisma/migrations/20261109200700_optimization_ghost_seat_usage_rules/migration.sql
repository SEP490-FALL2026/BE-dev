-- qd103-ghost-seat-g3-g4 Task 1 (2/2): cột mới của khuyến nghị G3/G4 (mức tin cậy, trạng thái hoạt động, số ngày), ngưỡng theo ứng dụng,
-- trạng thái từng seat của bảng IT (FR-5.10). paused_at/pause_transfer_id và ghost_seat_exemptions đã có từ manager-decision (không tạo lại).

CREATE TYPE "GhostSeatConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "GhostSeatActivityStatus" AS ENUM ('NEVER_ACTIVE', 'INACTIVE');
CREATE TYPE "GhostSeatSeatStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'NO_DATA', 'UNMATCHED_IDENTITY', 'INSUFFICIENT_EVIDENCE', 'EXCLUDED');

ALTER TABLE "ghost_seat_recommendations"
    ADD COLUMN "confidence" "GhostSeatConfidence",
    ADD COLUMN "activity_status" "GhostSeatActivityStatus",
    ADD COLUMN "inactive_days" integer,
    ADD COLUMN "last_active_date" date,
    ADD COLUMN "previous_recommendation_id" uuid,
    ADD COLUMN "activity_after_decision_on" date,
    ADD CONSTRAINT "ghost_seat_recommendations_previous_recommendation_id_fkey"
        FOREIGN KEY ("previous_recommendation_id") REFERENCES "ghost_seat_recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ghost_seat_recommendations_usage" CHECK (
        CASE WHEN "group" IN ('G3', 'G4')
            THEN "confidence" IS NOT NULL AND "activity_status" IS NOT NULL
            ELSE "confidence" IS NULL AND "activity_status" IS NULL AND "inactive_days" IS NULL
        END
    ),
    ADD CONSTRAINT "ghost_seat_recommendations_g3" CHECK (
        "group" <> 'G3' OR ("activity_status" = 'NEVER_ACTIVE' AND "tier" = 'ACTION')
    ),
    ADD CONSTRAINT "ghost_seat_recommendations_inactive_days" CHECK ("inactive_days" IS NULL OR "inactive_days" >= 0),
    ADD CONSTRAINT "ghost_seat_recommendations_paused" CHECK ("state" <> 'PAUSED' OR "paused_at" IS NOT NULL);

CREATE INDEX "ghost_seat_recommendations_previous" ON "ghost_seat_recommendations"("previous_recommendation_id")
    WHERE "previous_recommendation_id" IS NOT NULL;

-- Bằng chứng chỉ được thay khi khuyến nghị còn ở tầng theo dõi và chưa tới trưởng phòng (nâng tầng chụp lại: US-10-03 AC-5).
CREATE OR REPLACE FUNCTION "ghost_seat_recommendations_evidence_final"() RETURNS trigger AS $$
BEGIN
    IF NEW."evidence" IS DISTINCT FROM OLD."evidence" AND NOT (COALESCE(OLD."tier" = 'MONITOR', false) AND OLD."state" = 'OPEN') THEN
        RAISE EXCEPTION 'The evidence of a recommendation is written once and never changed'
            USING ERRCODE = '55000', CONSTRAINT = 'ghost_seat_recommendations_evidence_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ngưỡng theo ứng dụng (FR-4.13): ứng dụng > tổ chức > mặc định; không theo phòng.
CREATE TABLE "ghost_seat_application_thresholds" (
    "organization_id" uuid NOT NULL,
    "application_id" uuid NOT NULL,
    "monitor_days" integer NOT NULL,
    "review_days" integer NOT NULL,
    "action_days" integer NOT NULL,
    "updated_by_app_user_id" uuid NOT NULL,
    "updated_at" timestamptz(3) NOT NULL DEFAULT now(),
    CONSTRAINT "ghost_seat_application_thresholds_pkey" PRIMARY KEY ("application_id"),
    CONSTRAINT "ghost_seat_application_thresholds_order" CHECK (
        1 <= "monitor_days" AND "monitor_days" < "review_days" AND "review_days" < "action_days" AND "action_days" <= 365
    )
);

-- Mỗi chuỗi seat đúng một trạng thái sau lượt tuần gần nhất (FR-5.10).
CREATE TABLE "ghost_seat_seat_states" (
    "seat_chain_id" uuid NOT NULL,
    "organization_id" uuid NOT NULL,
    "application_id" uuid NOT NULL,
    "assignment_id" uuid NOT NULL,
    "employee_id" uuid NOT NULL,
    "status" "GhostSeatSeatStatus" NOT NULL,
    "last_active_date" date,
    "inactive_days" integer,
    "gate" "GhostSeatGate",
    "assessed_run_id" uuid NOT NULL,
    "assessed_on" date NOT NULL,
    CONSTRAINT "ghost_seat_seat_states_pkey" PRIMARY KEY ("seat_chain_id"),
    CONSTRAINT "ghost_seat_seat_states_assessed_run_id_fkey" FOREIGN KEY ("assessed_run_id") REFERENCES "ghost_seat_rule_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ghost_seat_seat_states_days" CHECK (
        "inactive_days" IS NULL OR ("status" IN ('ACTIVE', 'INACTIVE') AND "inactive_days" >= 0)
    )
);
CREATE INDEX "ghost_seat_seat_states_board" ON "ghost_seat_seat_states"("organization_id", "application_id", "status");
CREATE INDEX "ghost_seat_seat_states_run" ON "ghost_seat_seat_states"("assessed_run_id");
