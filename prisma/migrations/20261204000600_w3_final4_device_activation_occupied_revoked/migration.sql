-- FIX-W3-FINAL-4 (J-3): A completed REVOKE task frees its lot slot on the same day without waiting for valid_until > businessToday.
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
          AND NOT EXISTS (SELECT 1 FROM "license_keys" k WHERE k."assignment_id" = a."id")
          AND NOT EXISTS (
            SELECT 1 FROM "provisioning_tasks" pt
             WHERE pt."assignment_id" = a."id"
               AND pt."kind" = 'REVOKE'
               AND pt."status" = 'COMPLETED'
          ));
$$ LANGUAGE sql STABLE;
