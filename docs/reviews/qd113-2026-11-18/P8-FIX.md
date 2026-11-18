# P8 - subscription owner department removed (QĐ-113g)

A subscription has no owning department; the cost follows the person who holds the right and each subscription has one responsible IT Admin.
The column `subscriptions.owner_department_id`, its trigger `subscriptions_owner_immutable`, the table `subscription_owner_assignments` and the command
`ops:assign-subscription-owner` are removed by migration `20261118130000_drop_subscription_owner_department` (the database is recreated from migrations and seed).

## Decisions

- D-1 Renewal reads. The department scope (head of the owner department) existed only for owner departments, so it is removed: the IT Admin and Finance read every case
  (Finance only reads), nobody else does. The IT Admin of a subscription is shown by `subscription.responsibleItAdmin`; no `mine` filter is added to the renewal list
  (it is not a filter of the other renewal routes). Seat ranking is read by the IT Admin only.
- D-2 Who is told of a renewal. `itAdminOf` = the responsible IT Admin while usable, else the first usable IT Admin; the IT Admin in charge of the owner department
  is dropped (policy `renewal-it-admin.policy.ts` deleted). Finance, the spending approver and the Super Admin are unchanged.
- D-3 Assignments. K1 seats of a department are found by the department of the holder (`owningDepartmentId`, else the holder's department), never through the
  subscription; the next-period carry buys a pool seat whenever none is free (no owner-department branch); the DB guard on seats was already dropped earlier and its
  error mapping `SUBSCRIPTION_DEPARTMENT_MISMATCH` is removed.
- D-4 Seat baseline import. The facts no longer carry an owner department; a personal seat is written with the department of the person. Error code
  `SUBSCRIPTION_DEPARTMENT_MISMATCH` removed from the row codes.
- D-5 Purchase invoices. An invoice for a subscription period may be submitted by any IT Admin; the missing-period flag of a subscription has `department: null`;
  `listPaymentSchedules` and `listPaidTerms` take no department list.
- D-6 Preflight. The subscription-owner gate (`SUBSCRIPTION_OWNER_*` blockers) is removed; the Cost Center and other gates are unchanged.

## Wire changes
See the report of the task: removed `ownerDepartmentId` from the subscription create body (a strict body now refuses it), subscription list/detail, renewal
case `subscription`, deadline event `subscription`; added `subscription.provisioningType` and `subscription.responsibleItAdmin` to the renewal and deadline-event objects.
