import { Client } from 'pg';

/**
 * Until the routes of the lots exist and the declaration of a perpetual purchase is closed (redesign wave 3, P14 and P21), a suite still buys a license
 * key purchase the way wave 2 did: a perpetual subscription of a K4 plan. Since M6 (W3-24) the licenses of a K4 plan are counted on lots, and a lot born from
 * a perpetual purchase has the id of that subscription. This bridge, installed in the test databases only, writes that lot whenever such a subscription is
 * active or its quantity changes, so the suites keep their fixtures: it is what the migration does to the rows that exist, applied to the rows a suite adds.
 * It is removed with the suites that need it when they buy through the lot routes.
 */
export const LEGACY_PERPETUAL_LOT_BRIDGE_SQL = `
CREATE OR REPLACE FUNCTION test_legacy_perpetual_lot() RETURNS trigger AS $$
BEGIN
  INSERT INTO license_lots (id, organization_id, plan_id, workspace_id, purchased_on, license_count, unit_price_minor, purpose,
                            responsible_it_admin_employee_id, legacy_subscription_id, updated_at)
  SELECT NEW.id, NEW.organization_id, NEW.plan_id, NEW.workspace_id, COALESCE(NEW.start_date, CURRENT_DATE),
         GREATEST(COALESCE(NEW.purchased_quantity, 0), 1), COALESCE(NEW.unit_price_minor, 0), 'OPENING',
         NEW.responsible_it_admin_employee_id, NEW.id, now()
    FROM plans p
   WHERE p.id = NEW.plan_id AND p.provisioning_type = 'K4' AND p.key_binding IS DISTINCT FROM 'DEVICE_BUNDLED'
  ON CONFLICT (id) DO UPDATE SET license_count = EXCLUDED.license_count, updated_at = now();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS test_legacy_perpetual_lot ON subscriptions;
CREATE TRIGGER test_legacy_perpetual_lot AFTER INSERT OR UPDATE OF status, purchased_quantity ON subscriptions
  FOR EACH ROW WHEN (NEW.kind = 'PERPETUAL' AND NEW.status = 'ACTIVE')
  EXECUTE FUNCTION test_legacy_perpetual_lot();
`;

/** Installs the bridge in a migrated test database. */
export async function installLegacyPerpetualLotBridge(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(LEGACY_PERPETUAL_LOT_BRIDGE_SQL);
  } finally {
    await client.end();
  }
}
