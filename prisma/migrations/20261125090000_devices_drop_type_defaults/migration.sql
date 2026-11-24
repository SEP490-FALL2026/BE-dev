-- Every code that enters a machine now names its kind and where its code came from (the register, the initial record, the seed), so the stopgap
-- defaults of `20261124100100_devices_register_lifecycle` go (decision D-3, "Owner chốt"): an INSERT that forgets either column fails instead of
-- writing an `OTH` machine with a `LEGACY` code. Expand-only for the rows: every machine already has both values.
ALTER TABLE "managed_devices" ALTER COLUMN "device_type" DROP DEFAULT,
ALTER COLUMN "asset_code_origin" DROP DEFAULT;
