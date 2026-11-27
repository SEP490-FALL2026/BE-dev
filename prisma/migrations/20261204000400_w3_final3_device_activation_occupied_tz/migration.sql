-- K-7 (T-5): evaluate legacy assignment `valid_until` in the organization's time zone inside `device_activation_occupied` instead of UTC `CURRENT_DATE`.
--
-- Pre-check SELECT:
--   SELECT count(*) AS orgs_without_tz FROM "organizations" WHERE "time_zone" IS NULL;
--
-- Reversal (restore from 20261203000200_w3_license_lots):
--   CREATE OR REPLACE FUNCTION device_activation_occupied(purchase uuid) RETURNS bigint AS $$
--     SELECT
--       (SELECT count(*)
--          FROM device_activations a
--          JOIN license_keys k ON k.id = a.license_key_id
--         WHERE k.license_lot_id = purchase AND (a.deactivated_at IS NULL OR a.license_released = false))
--       + (SELECT count(*) FROM license_keys k WHERE k.license_lot_id = purchase AND k.status = 'ASSIGNED')
--       + (SELECT count(*)
--            FROM license_lots l
--            JOIN license_assignments a ON a.subscription_id = l.legacy_subscription_id AND a.plan_id = l.plan_id
--           WHERE l.id = purchase AND a.failed_at IS NULL AND a.cancelled_at IS NULL
--             AND (a.valid_until IS NULL OR a.valid_until > CURRENT_DATE)
--             AND NOT EXISTS (SELECT 1 FROM license_keys k WHERE k.assignment_id = a.id));
--   $$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION "device_activation_occupied"(purchase uuid) RETURNS bigint AS $$
  SELECT
    (SELECT count(*)
       FROM "device_activations" a
       JOIN "license_keys" k ON k."id" = a."license_key_id"
      WHERE k."license_lot_id" = purchase AND (a."deactivated_at" IS NULL OR a."license_released" = false))
    + (SELECT count(*) FROM "license_keys" k WHERE k."license_lot_id" = purchase AND k."status" = 'ASSIGNED')
    + (SELECT count(*)
         FROM "license_lots" l
         JOIN "organizations" o ON o."id" = l."organization_id"
         JOIN "license_assignments" a ON a."subscription_id" = l."legacy_subscription_id" AND a."plan_id" = l."plan_id"
        WHERE l."id" = purchase AND a."failed_at" IS NULL AND a."cancelled_at" IS NULL
          AND (a."valid_until" IS NULL OR a."valid_until" > (now() AT TIME ZONE o."time_zone")::date)
          AND NOT EXISTS (SELECT 1 FROM "license_keys" k WHERE k."assignment_id" = a."id"));
$$ LANGUAGE sql STABLE;
