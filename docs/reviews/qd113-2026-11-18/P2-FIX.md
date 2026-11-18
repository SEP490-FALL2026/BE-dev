# P2 fix after review (QĐ-113a)

Fixes to commit 059e432e. Rule (QĐ-113a): a request amount and the budget check use the price of the subscription that prices the plan first and the
reference price of the plan only when no subscription prices it. The reference price is never used for the cost of a seat, the point of an adjustment,
invoice matching or avoided/potential savings.

## Callers of the plan price

| Caller | Use | Reads |
| --- | --- | --- |
| `request-facts.service` `priceFor` | price of a request (preview, submit) | `getPlanPrice` (reference allowed) |
| `repricing.service` | reprice of a request | `getPlanPrice` (reference allowed) |
| `year-start-commitments-batch.service` `pricesOf` | amount of a request commitment at 01/01 | `getPlanPrice` (reference allowed) |
| `budget-review-price.service` `monthlyPrices` | comparison of the price a request commitment was made at (itself from `getPlanPrice`) with the price now | `getPlanPrice` (reference allowed; compares like with like) |
| `requestable-software.service` (`pricedCyclesOfPlans`) | whether a plan can be priced for a request | subscription, then reference |
| `usage-rules-context.service` `priceOf` | potential saving of a ghost seat | `getSubscriptionPlanPrice` (subscription only) |
| `originalPriceOfPlan` | invoice matching | subscription only (unchanged) |

## Decisions

- D-1: the subscription-only read is its own method (`SubscriptionPriceService.subscriptionPriceOfPlan`, `CatalogApi.getSubscriptionPlanPrice`), not a
  flag on `priceOfPlan`: a caller cannot forget the flag and get the reference price by default for cost.
- D-2: the price source is not stored. `PricingRecord.priceSource` (`SUBSCRIPTION` | `PLAN_REFERENCE`) is set by `pricingRecordFor`, shown as `priceSource` in
  the request preview and written as `priceSource` in the audit of the submitted request (`ACCESS_REQUEST.SUBMITTED`, renewal, group request). No DB column:
  the source of a stored amount is not read back by any rule, and the audit trail already carries it from the day the request was priced. A column would be
  needed only if a later screen has to show the source of a request that was already stored; then add it with the amount at the same write.
- D-3: a reference price must be above zero everywhere: the service refuses 0 and less with `PLAN.REFERENCE_PRICE_NOT_POSITIVE` (422), the adoption of a quote
  skips a 0 quote, `findCyclesOfPlans` and `findOfPlan` require `> 0` and VND, and the migration CHECK is `reference_price_minor > 0` (edited in place; the
  migration is not merged).
- D-4: the kind and the existence of the plan are judged before the money is read (`PLAN.REFERENCE_PRICE_NOT_APPLICABLE`, 404), then the currency, then the amount.
