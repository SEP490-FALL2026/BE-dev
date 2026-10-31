# ADR-0005: Database invariants beyond Prisma

Status: Accepted technical principle. Reviewed SQL outside Prisma is part of the schema: a text search of
`prisma/migrations` (125 migration folders, 31/10/2026) finds 5 `EXCLUDE USING` constraints, 161 `CREATE TRIGGER`
statements, 8 `CREATE CONSTRAINT TRIGGER` statements, 140 function definitions and 341 `CHECK (` clauses (case-sensitive,
so function names ending in `_check(` are not counted). They are text matches, not live objects: a later migration can
replace or drop what an earlier one created.

> _Implementation annotation (22/10/2026, `delivery-gate-hardening`, `DB-17`):_ the second sentence of the status (now
> replaced by the count above) was superseded. Reviewed SQL outside Prisma now exists in committed migrations (text search of `prisma/migrations` at
> `0198456`: 5 `EXCLUDE USING` constraints, 42 `CREATE TRIGGER` and 2 `CREATE CONSTRAINT TRIGGER` statements, 85 `CHECK (`
> clauses). The CI workflow now also runs a schema-to-migrations drift check (added in the same item; no remote run
> verified yet). The principle above is unchanged.

> _Implementation annotation (23/10/2026, `finance-reporting-currency-integrity`, `catalog-licensing-write-integrity`):_
> two further migrations add reviewed SQL outside Prisma. `20261022100000_reporting_currency_integrity`: a foreign key
> `organizations.reporting_currency → currencies(code)` (the column became `CHAR(3)`, as the key it references), and
> `FOR SHARE` reads of the organization row in the exchange-rate trigger and the new trigger
> `subscriptions_price_in_reporting_currency`, so that a change of the reporting currency and a value frozen in it cannot both
> commit (write skew under READ COMMITTED). `20261022110000_catalog_licensing_write_integrity`: `vendors_dictionary_group_fixed`,
> `plans_keep_children_valid`, forward-only heads and next-version guards for tax profiles and cost allocations, and a
> READ COMMITTED assertion in `license_assignment_check_capacity`. Each has an integration test that holds two real
> transactions and waits on `pg_locks`, or writes directly and expects the SQLSTATE. The principle above is unchanged.

Use Prisma schema for supported columns, relations and unique constraints.
When a User Story requires a constraint Prisma cannot express, create a migration
with --create-only, add reviewed SQL with explicit object names, and apply it to
a disposable PostgreSQL database.

Never rewrite an applied migration. Test both object existence and observable
behavior, including races where relevant. A zero Prisma schema diff alone cannot
prove custom triggers, grants or constraints are correct.

Enable preview features only when a concrete requirement needs them and the
installed Prisma version supports them. Do not enable them for a speculative model.
Production API credentials should not have migration-owner privileges.

See [database rules](../rules/database-business.md) and [tests](../../test/README.md).
