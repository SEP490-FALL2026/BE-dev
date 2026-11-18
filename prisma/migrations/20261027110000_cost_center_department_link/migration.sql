-- Cost Center belongs to one department, compatibility step (g0-g6-final-business-baseline-remediation, Task 1.1a; F01;
-- reviews P03-RV-03 and P03-RV-04; QĐ-87d(1): a department may exist with no Cost Center, a Cost Center never exists
-- without exactly one department for its whole life). This migration only ADDS and RELAXES, because H7 runs
-- `migrate deploy` before it recreates `api` and `worker` and recovers the previous image after a failed deploy: the
-- application of the previous release (which charges a department to a Cost Center through `departments.cost_center_id`
-- and never writes the new columns) must keep creating, updating and reading them on this schema.
--
-- What keeps both releases consistent:
--   * `cost_centers.department_id` / `linked_at` carry the new link, copied 1–1 from the old column;
--   * a department the previous release creates around a free Cost Center links it (`departments_cost_center_link_forward`);
--   * an ACTIVE Cost Center linked to a department becomes the one that department's old column points to
--     (`cost_centers_department_link_backward`), so the previous release always reads the current Cost Center and never
--     sees one that belongs to a department as "free";
--   * a Cost Center the previous release creates stays unlinked: the live inventory of `ops:preflight` lists it, and only
--     `ops:cost-center-direction link` (a basis Finance approved) gives it its department — nothing is inferred here.
-- The rules that make the link required (NOT NULL) and drop the old column belong to the final release.

-- AlterTable: the new link, nullable for now.
ALTER TABLE "cost_centers"
  ADD COLUMN "department_id" UUID,
  ADD COLUMN "linked_at" TIMESTAMPTZ(3);

-- The pairing as it stands: every department already has exactly one Cost Center, so it is copied one to one. The
-- previous release wrote that pairing once, when it inserted the department row around a Cost Center that already
-- existed, and never changed it, so the link begins at the LATER of the two creation moments: a link cannot exist
-- before both records do, and a cost before it is not charged to the Cost Center (QĐ-87d(3), F68). Free Cost Centers
-- (named by no department) stay unlinked.
UPDATE "cost_centers" c
   SET "department_id" = d."id", "linked_at" = GREATEST(c."created_at", d."created_at")
  FROM "departments" d
 WHERE d."cost_center_id" = c."id";

-- The link is whole or absent.
ALTER TABLE "cost_centers"
  ADD CONSTRAINT "cost_centers_link_together" CHECK (("department_id" IS NULL) = ("linked_at" IS NULL));

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A department has at most one ACTIVE Cost Center. The data of the previous release always satisfies it (one Cost Center
-- per department and no way to reactivate), so no write of that release breaks it; retired ones may repeat as history.
CREATE UNIQUE INDEX "cost_centers_one_active_per_department" ON "cost_centers"("department_id") WHERE "status" = 'ACTIVE';

-- Once a Cost Center has its department it keeps it for its whole life. The previous release never updates these
-- columns, so the trigger refuses nothing it can do.
CREATE FUNCTION cost_centers_department_link_once() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."department_id" IS NOT NULL
     AND (NEW."department_id" IS DISTINCT FROM OLD."department_id" OR NEW."linked_at" IS DISTINCT FROM OLD."linked_at") THEN
    RAISE EXCEPTION 'a cost center belongs to one department for its whole life'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'cost_centers_department_link_once';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cost_centers_department_link_once
  BEFORE UPDATE OF "department_id", "linked_at" ON "cost_centers"
  FOR EACH ROW EXECUTE FUNCTION cost_centers_department_link_once();

-- A department may have no Cost Center now: the old column is optional and its guard has nothing to check without one.
ALTER TABLE "departments" ALTER COLUMN "cost_center_id" DROP NOT NULL;

CREATE OR REPLACE FUNCTION departments_require_unit_cost_center() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  center_kind "CostCenterKind";
  center_status "CostCenterStatus";
BEGIN
  IF NEW."cost_center_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT kind, status INTO center_kind, center_status FROM cost_centers WHERE id = NEW."cost_center_id";
  IF center_kind IS DISTINCT FROM 'UNIT' THEN
    RAISE EXCEPTION 'a department must be charged to a UNIT cost center'
      USING ERRCODE = 'check_violation';
  END IF;
  IF center_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'a department cannot be charged to a cost center that is no longer in use'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- The previous release creates a department around a free Cost Center: the Cost Center gets that department, from the
-- moment of the write and never before either record's own creation (F68). It does not raise (it must not refuse a
-- write the previous release makes) and it never overwrites a link.
CREATE FUNCTION departments_cost_center_link_forward() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."cost_center_id" IS NOT NULL THEN
    UPDATE "cost_centers"
       SET "department_id" = NEW."id", "linked_at" = GREATEST(now(), "created_at", NEW."created_at")
     WHERE "id" = NEW."cost_center_id" AND "department_id" IS NULL;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER departments_cost_center_link_forward
  AFTER INSERT ON "departments"
  FOR EACH ROW EXECUTE FUNCTION departments_cost_center_link_forward();

-- An ACTIVE Cost Center that has its department is the one the old column points to: the previous release reads the
-- current Cost Center of every department and never sees one that belongs to a department as free.
CREATE FUNCTION cost_centers_department_link_backward() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."department_id" IS NOT NULL AND NEW."status" = 'ACTIVE' THEN
    UPDATE "departments"
       SET "cost_center_id" = NEW."id"
     WHERE "id" = NEW."department_id" AND "cost_center_id" IS DISTINCT FROM NEW."id";
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER cost_centers_department_link_backward
  AFTER INSERT OR UPDATE OF "department_id", "status" ON "cost_centers"
  FOR EACH ROW EXECUTE FUNCTION cost_centers_department_link_backward();

-- CreateTable: the record of a link made by procedure (QĐ-87d(1)): the basis Finance approved. Added to, never changed.
CREATE TABLE "cost_center_department_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "basis_reference" TEXT NOT NULL,
    "approver_ref" TEXT NOT NULL,
    "operator_ref" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_center_department_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cost_center_department_links_basis_length" CHECK (char_length(btrim("basis_reference")) BETWEEN 2 AND 200),
    CONSTRAINT "cost_center_department_links_environment_known" CHECK ("environment" IN ('LOCAL_TEST', 'SHARED'))
);

-- CreateTable: one irreversible row per organization: this installation runs the compatibility release.
CREATE TABLE "cost_center_direction_activations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "release_evidence" TEXT NOT NULL,
    "approver_ref" TEXT NOT NULL,
    "operator_ref" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "activated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_center_direction_activations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cost_center_direction_activations_evidence_length" CHECK (char_length(btrim("release_evidence")) BETWEEN 2 AND 200),
    CONSTRAINT "cost_center_direction_activations_environment_known" CHECK ("environment" IN ('LOCAL_TEST', 'SHARED'))
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_center_department_links_cost_center_id_key" ON "cost_center_department_links"("cost_center_id");

-- CreateIndex
CREATE INDEX "cost_center_department_links_department_id_idx" ON "cost_center_department_links"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_center_direction_activations_organization_id_key" ON "cost_center_direction_activations"("organization_id");

-- AddForeignKey
ALTER TABLE "cost_center_department_links" ADD CONSTRAINT "cost_center_department_links_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_center_department_links" ADD CONSTRAINT "cost_center_department_links_cost_center_id_fkey"
  FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_center_department_links" ADD CONSTRAINT "cost_center_department_links_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_center_direction_activations" ADD CONSTRAINT "cost_center_direction_activations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Both records are evidence: nothing rewrites or removes a row, whoever holds the privilege (the owner role included).
CREATE FUNCTION cost_center_direction_records_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% rejected)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER cost_center_department_links_no_update_delete
  BEFORE UPDATE OR DELETE ON "cost_center_department_links"
  FOR EACH ROW EXECUTE FUNCTION cost_center_direction_records_reject_change();

CREATE TRIGGER cost_center_department_links_no_truncate
  BEFORE TRUNCATE ON "cost_center_department_links"
  FOR EACH STATEMENT EXECUTE FUNCTION cost_center_direction_records_reject_change();

CREATE TRIGGER cost_center_direction_activations_no_update_delete
  BEFORE UPDATE OR DELETE ON "cost_center_direction_activations"
  FOR EACH ROW EXECUTE FUNCTION cost_center_direction_records_reject_change();

CREATE TRIGGER cost_center_direction_activations_no_truncate
  BEFORE TRUNCATE ON "cost_center_direction_activations"
  FOR EACH STATEMENT EXECUTE FUNCTION cost_center_direction_records_reject_change();

-- A Cost Center that already has its department needs no link record: it would record a basis for nothing. The check
-- reads the Cost Center under a share lock so that a link made in between cannot slip past it.
CREATE FUNCTION cost_center_department_links_require_unlinked() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "cost_centers" WHERE "id" = NEW."cost_center_id" AND "department_id" IS NOT NULL FOR SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'the cost center already has its department'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'cost_center_department_links_unlinked_only';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cost_center_department_links_unlinked_only
  BEFORE INSERT ON "cost_center_department_links"
  FOR EACH ROW EXECUTE FUNCTION cost_center_department_links_require_unlinked();

-- The Cost Center is not given a department its own history contradicts: a request or a seat charged to it that belongs to
-- another department, or any budget proposal, version or commitment (they carry no department of their own). It runs on the
-- record of the link only, which the previous release never writes, so it refuses nothing that release can do.
CREATE FUNCTION cost_center_department_links_require_consistent_references() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "access_requests"
              WHERE "cost_center_id" = NEW."cost_center_id" AND "department_id" <> NEW."department_id")
     OR EXISTS (SELECT 1 FROM "license_assignments"
                 WHERE "cost_center_id" = NEW."cost_center_id"
                   AND "owning_department_id" IS DISTINCT FROM NEW."department_id")
     OR EXISTS (SELECT 1 FROM "budget_proposals" WHERE "cost_center_id" = NEW."cost_center_id")
     OR EXISTS (SELECT 1 FROM "budget_versions" WHERE "cost_center_id" = NEW."cost_center_id")
     OR EXISTS (SELECT 1 FROM "budget_commitments" WHERE "cost_center_id" = NEW."cost_center_id") THEN
    RAISE EXCEPTION 'the cost center has history that contradicts this department'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'cost_center_department_links_references_conflict';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cost_center_department_links_references_consistent
  BEFORE INSERT ON "cost_center_department_links"
  FOR EACH ROW EXECUTE FUNCTION cost_center_department_links_require_consistent_references();
