-- qd103-ghost-seat-g1-g2 Task 1: module optimization — khuyến nghị seat lãng phí G1 (kho Trống) và G2 (người đã nghỉ).
-- Enum khai các giá trị mà hạng mục này cần để kiểm trên DB thật (G3/G4, PAUSED, KEPT/NEGATED… dành cho g3-g4 và
-- manager-decision nhưng khai sớm để luật thay thế G2 và KPI-5 chạy được: xem TẠM CHỌN ở plan.md).

CREATE TYPE "GhostSeatGroup" AS ENUM ('G1', 'G2', 'G3', 'G4');
CREATE TYPE "GhostSeatTier" AS ENUM ('MONITOR', 'REVIEW', 'ACTION');
CREATE TYPE "GhostSeatState" AS ENUM ('OPEN', 'PAUSED', 'RECLAIM_DECIDED', 'CLOSED');
CREATE TYPE "GhostSeatCloseReason" AS ENUM (
    'ACCEPTED', 'SUPERSEDED', 'SEAT_ENDED', 'FREE_SEATS_GONE', 'OUT_OF_SCOPE', 'KEPT', 'NEGATED', 'TRANSFER_SEAT_REVOKED'
);
CREATE TYPE "GhostSeatRuleSet" AS ENUM ('G1_G2', 'G3_G4');
CREATE TYPE "GhostSeatRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "GhostSeatGate" AS ENUM ('PER_SEAT', 'INTERNAL_SOFTWARE', 'OPEN_RECOMMENDATION');
CREATE TYPE "GhostSeatSkipSubject" AS ENUM ('SUBSCRIPTION', 'ASSIGNMENT');

-- Lượt chạy của luật: một dòng cho mỗi (tổ chức, bộ luật, kỳ); claim bằng INSERT ... ON CONFLICT DO NOTHING.
CREATE TABLE "ghost_seat_rule_runs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "rule_set" "GhostSeatRuleSet" NOT NULL,
    "period_key" text NOT NULL,
    "status" "GhostSeatRunStatus" NOT NULL DEFAULT 'RUNNING',
    "attempt" smallint NOT NULL DEFAULT 1,
    "started_at" timestamptz(3) NOT NULL DEFAULT now(),
    "finished_at" timestamptz(3),
    "created_count" integer NOT NULL DEFAULT 0,
    "updated_count" integer NOT NULL DEFAULT 0,
    "closed_count" integer NOT NULL DEFAULT 0,
    "skipped_count" integer NOT NULL DEFAULT 0,
    "failed_count" integer NOT NULL DEFAULT 0,
    "error" text,
    CONSTRAINT "ghost_seat_rule_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ghost_seat_rule_runs_period" UNIQUE ("organization_id", "rule_set", "period_key"),
    CONSTRAINT "ghost_seat_rule_runs_attempt" CHECK ("attempt" >= 1),
    CONSTRAINT "ghost_seat_rule_runs_counts" CHECK (
        "created_count" >= 0 AND "updated_count" >= 0 AND "closed_count" >= 0 AND "skipped_count" >= 0 AND "failed_count" >= 0
    ),
    CONSTRAINT "ghost_seat_rule_runs_finished" CHECK (("status" = 'RUNNING') = ("finished_at" IS NULL))
);

-- Lý do một đối tượng bị luật bỏ qua (chỉ ghi thêm).
CREATE TABLE "ghost_seat_rule_skips" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "run_id" uuid NOT NULL,
    "subject_type" "GhostSeatSkipSubject" NOT NULL,
    "subject_id" uuid NOT NULL,
    "gate" "GhostSeatGate" NOT NULL,
    "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamptz(3) NOT NULL DEFAULT now(),
    CONSTRAINT "ghost_seat_rule_skips_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ghost_seat_rule_skips_subject" UNIQUE ("run_id", "subject_type", "subject_id"),
    CONSTRAINT "ghost_seat_rule_skips_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ghost_seat_rule_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE FUNCTION "ghost_seat_rule_skips_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ghost_seat_rule_skips is append-only'
        USING ERRCODE = '55000', CONSTRAINT = 'ghost_seat_rule_skips_append_only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ghost_seat_rule_skips_append_only"
    BEFORE UPDATE OR DELETE ON "ghost_seat_rule_skips"
    FOR EACH ROW EXECUTE FUNCTION "ghost_seat_rule_skips_append_only"();

-- Khuyến nghị: khóa ngoại tới bảng của module khác (tổ chức, ứng dụng, gói, thuê bao, seat, người, tác vụ) là giá trị, không có FK:
-- Prisma sẽ buộc mô hình của các module đó nhắc tới module này (xem TẠM CHỌN ở plan.md).
-- G1 theo thuê bao, G2 (và G3/G4) theo chuỗi seat (Assignment gốc của chuỗi predecessor_id).
CREATE TABLE "ghost_seat_recommendations" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "group" "GhostSeatGroup" NOT NULL,
    "state" "GhostSeatState" NOT NULL DEFAULT 'OPEN',
    "close_reason" "GhostSeatCloseReason",
    "tier" "GhostSeatTier",
    "application_id" uuid NOT NULL,
    "plan_id" uuid NOT NULL,
    "subscription_id" uuid,
    "assignment_id" uuid,
    "seat_chain_id" uuid,
    "employee_id" uuid,
    "department_id" uuid,
    "free_seats" integer,
    "counts_toward_vacant_cost" boolean,
    "revocation_task_id" uuid,
    "holder_left_on" date,
    "evidence" jsonb NOT NULL,
    "created_run_id" uuid NOT NULL,
    "created_at" timestamptz(3) NOT NULL DEFAULT now(),
    "updated_at" timestamptz(3) NOT NULL DEFAULT now(),
    "closed_at" timestamptz(3),
    "closed_by_app_user_id" uuid,
    "superseded_by_id" uuid,
    CONSTRAINT "ghost_seat_recommendations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ghost_seat_recommendations_subject" CHECK (
        CASE WHEN "group" = 'G1'
            THEN "subscription_id" IS NOT NULL AND "assignment_id" IS NULL AND "tier" IS NULL AND "state" IN ('OPEN', 'CLOSED')
            ELSE "assignment_id" IS NOT NULL AND "seat_chain_id" IS NOT NULL AND "employee_id" IS NOT NULL AND "tier" IS NOT NULL
        END
    ),
    CONSTRAINT "ghost_seat_recommendations_g2" CHECK (
        "group" <> 'G2' OR ("tier" = 'ACTION' AND "state" IN ('OPEN', 'RECLAIM_DECIDED', 'CLOSED'))
    ),
    CONSTRAINT "ghost_seat_recommendations_closed" CHECK (
        ("state" = 'CLOSED') = ("close_reason" IS NOT NULL) AND ("state" = 'CLOSED') = ("closed_at" IS NOT NULL)
    ),
    CONSTRAINT "ghost_seat_recommendations_superseded" CHECK (
        "close_reason" IS DISTINCT FROM 'SUPERSEDED' OR "superseded_by_id" IS NOT NULL
    ),
    CONSTRAINT "ghost_seat_recommendations_free_seats" CHECK ("free_seats" IS NULL OR "free_seats" >= 0),
    CONSTRAINT "ghost_seat_recommendations_created_run_id_fkey" FOREIGN KEY ("created_run_id") REFERENCES "ghost_seat_rule_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ghost_seat_recommendations_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "ghost_seat_recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
        DEFERRABLE INITIALLY DEFERRED
);

-- (superseded_by_id hoãn kiểm tới cuối transaction: khuyến nghị cũ đóng SUPERSEDED trước, rồi khuyến nghị mới mới được ghi — chỉ mục cổng 8.)
-- Cổng 8: một khuyến nghị chưa đóng cho mỗi thuê bao (G1) và cho mỗi chuỗi seat (nhóm khác).
CREATE UNIQUE INDEX "ghost_seat_recommendations_g1_open" ON "ghost_seat_recommendations"("subscription_id")
    WHERE "group" = 'G1' AND "state" <> 'CLOSED';
CREATE UNIQUE INDEX "ghost_seat_recommendations_chain_open" ON "ghost_seat_recommendations"("seat_chain_id")
    WHERE "group" <> 'G1' AND "state" <> 'CLOSED';
CREATE INDEX "ghost_seat_recommendations_board" ON "ghost_seat_recommendations"("organization_id", "state", "group");
CREATE INDEX "ghost_seat_recommendations_task" ON "ghost_seat_recommendations"("revocation_task_id") WHERE "revocation_task_id" IS NOT NULL;
CREATE INDEX "ghost_seat_recommendations_run" ON "ghost_seat_recommendations"("created_run_id");
CREATE INDEX "ghost_seat_recommendations_created" ON "ghost_seat_recommendations"("organization_id", "created_at");

-- Bằng chứng bất biến sau khi ghi.
CREATE FUNCTION "ghost_seat_recommendations_evidence_final"() RETURNS trigger AS $$
BEGIN
    IF NEW."evidence" IS DISTINCT FROM OLD."evidence" THEN
        RAISE EXCEPTION 'The evidence of a recommendation is written once and never changed'
            USING ERRCODE = '55000', CONSTRAINT = 'ghost_seat_recommendations_evidence_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ghost_seat_recommendations_evidence_final"
    BEFORE UPDATE OF "evidence" ON "ghost_seat_recommendations"
    FOR EACH ROW EXECUTE FUNCTION "ghost_seat_recommendations_evidence_final"();
