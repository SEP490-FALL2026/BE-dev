-- qd103-ghost-seat-manager-decision Task 1 (2/2): định tuyến tới trưởng phòng, quyết định (chỉ ghi thêm), IT trả lại, miễn trừ.

CREATE TYPE "GhostSeatChoice" AS ENUM ('KEEP', 'RECLAIM', 'EXEMPT');

-- TẠM CHỌN: paused_at / pause_transfer_id thuộc qd103-ghost-seat-g3-g4 (DA6-19); hạng mục đó chưa có nên thêm ở đây.
-- Chỉ ràng buộc cặp cùng có hoặc cùng không (dòng PAUSED có sẵn từ g1-g2 không có hai cột này).
ALTER TABLE "ghost_seat_recommendations"
    ADD COLUMN "decider_department_id" uuid,
    ADD COLUMN "routed_at" timestamptz(3),
    ADD COLUMN "decision_due_on" date,
    ADD COLUMN "overdue_noticed_at" timestamptz(3),
    ADD COLUMN "return_count" smallint NOT NULL DEFAULT 0,
    ADD COLUMN "revocation_not_before" date,
    ADD COLUMN "paused_at" timestamptz(3),
    ADD COLUMN "pause_transfer_id" uuid,
    ADD CONSTRAINT "ghost_seat_recommendations_return_count" CHECK ("return_count" BETWEEN 0 AND 1),
    ADD CONSTRAINT "ghost_seat_recommendations_pause" CHECK (("paused_at" IS NULL) = ("pause_transfer_id" IS NULL)),
    ADD CONSTRAINT "ghost_seat_recommendations_due" CHECK (
        "state" NOT IN ('AWAITING_DECISION', 'RETURNED_TO_HEAD', 'WAITING_FOR_HEAD') OR "decision_due_on" IS NOT NULL
    ),
    ADD CONSTRAINT "ghost_seat_recommendations_decider" CHECK (
        "state" NOT IN ('AWAITING_DECISION', 'RETURNED_TO_HEAD') OR "decider_department_id" IS NOT NULL
    );

CREATE INDEX "ghost_seat_recommendations_decider" ON "ghost_seat_recommendations"("decider_department_id", "state")
    WHERE "decider_department_id" IS NOT NULL;

-- Quyết định của trưởng phòng: chỉ ghi thêm (US-10-06 AC-13); quyết lại sau trả lại là bản ghi mới.
CREATE TABLE "ghost_seat_decisions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "recommendation_id" uuid NOT NULL,
    "choice" "GhostSeatChoice" NOT NULL,
    "reason" text NOT NULL,
    "exempt_until" date,
    "decided_on" date NOT NULL,
    "decided_at" timestamptz(3) NOT NULL DEFAULT now(),
    "decided_by_employee_id" uuid NOT NULL,
    "decided_by_app_user_id" uuid NOT NULL,
    "decider_department_id" uuid NOT NULL,
    "decider_roles" text[] NOT NULL,
    "self_decided" boolean NOT NULL DEFAULT false,
    "batch_id" uuid,
    CONSTRAINT "ghost_seat_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ghost_seat_decisions_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "ghost_seat_recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ghost_seat_decisions_reason" CHECK (char_length("reason") BETWEEN 3 AND 1000),
    CONSTRAINT "ghost_seat_decisions_exempt" CHECK (("choice" = 'EXEMPT') = ("exempt_until" IS NOT NULL)),
    CONSTRAINT "ghost_seat_decisions_exempt_window" CHECK (
        "exempt_until" IS NULL OR ("exempt_until" > "decided_on" AND "exempt_until" <= "decided_on" + interval '12 months')
    )
);
CREATE INDEX "ghost_seat_decisions_recommendation" ON "ghost_seat_decisions"("recommendation_id", "decided_at");
CREATE INDEX "ghost_seat_decisions_self" ON "ghost_seat_decisions"("organization_id", "decided_at") WHERE "self_decided";

CREATE FUNCTION "ghost_seat_decisions_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ghost_seat_decisions is append-only'
        USING ERRCODE = '55000', CONSTRAINT = 'ghost_seat_decisions_append_only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ghost_seat_decisions_append_only"
    BEFORE UPDATE OR DELETE ON "ghost_seat_decisions"
    FOR EACH ROW EXECUTE FUNCTION "ghost_seat_decisions_append_only"();

-- IT trả lại tối đa một lần cho mỗi khuyến nghị (OI-02).
CREATE TABLE "ghost_seat_returns" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "recommendation_id" uuid NOT NULL,
    "reason" text NOT NULL,
    "returned_by_app_user_id" uuid NOT NULL,
    "returned_at" timestamptz(3) NOT NULL DEFAULT now(),
    "task_id" uuid,
    CONSTRAINT "ghost_seat_returns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ghost_seat_returns_recommendation_key" UNIQUE ("recommendation_id"),
    CONSTRAINT "ghost_seat_returns_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "ghost_seat_recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ghost_seat_returns_reason" CHECK (char_length("reason") BETWEEN 3 AND 1000)
);

-- TẠM CHỌN: bảng miễn trừ (cổng 7) thuộc g3-g4; manager-decision ghi, g3-g4 đọc. Hình dạng theo spec g3-g4.
CREATE TABLE "ghost_seat_exemptions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "seat_chain_id" uuid NOT NULL,
    "recommendation_id" uuid NOT NULL,
    "decision_id" uuid NOT NULL,
    "exempt_until" date NOT NULL,
    "created_at" timestamptz(3) NOT NULL DEFAULT now(),
    "reminded_at" timestamptz(3),
    "ended_at" timestamptz(3),
    CONSTRAINT "ghost_seat_exemptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ghost_seat_exemptions_decision_key" UNIQUE ("decision_id"),
    CONSTRAINT "ghost_seat_exemptions_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "ghost_seat_recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ghost_seat_exemptions_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "ghost_seat_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ghost_seat_exemptions_chain" ON "ghost_seat_exemptions"("seat_chain_id", "exempt_until");
