-- How many license keys an account has opened in a minute and in a day (post-merge review SEC-02). The row of a window is
-- raised by one statement that refuses at the limit, in the transaction that opens the key and writes the audit event, so
-- two requests for the last slot cannot both pass and a refused request leaves the count as it was.
-- The account is a value, not a foreign key, as it is on the keys themselves: the quota names whoever it counted.
CREATE TABLE "license_key_reveal_windows" (
    "app_user_id" UUID NOT NULL,
    "window_kind" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,
    CONSTRAINT "license_key_reveal_windows_pkey" PRIMARY KEY ("app_user_id", "window_kind", "window_start"),
    CONSTRAINT "license_key_reveal_windows_kind_check" CHECK ("window_kind" IN ('MINUTE', 'DAY')),
    CONSTRAINT "license_key_reveal_windows_count_check" CHECK ("count" > 0)
);
