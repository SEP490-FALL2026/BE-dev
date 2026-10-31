# File manifest — review hậu merge G0→G4 (22/10/2026)

Sinh bằng lệnh chỉ đọc trên Git (`git diff --name-status`, `git grep`) và SHA-256 của tệp làm việc. Đi kèm
[README](README.md).

## 1. Lịch sử

| Commit    | Cha                 | Tác giả · ngày                   | Nội dung                                                         | Path                      |
| --------- | ------------------- | -------------------------------- | ---------------------------------------------------------------- | ------------------------- |
| `5f3b2b3` | `57b1e1c`           | HoaiBao200104 · 2026-10-20 22:48 | G2, G3, G4 processing                                            | 591                       |
| `459cb6f` | `5f3b2b3`           | HoaiBao200104 · 2026-10-21 09:04 | complete G2, G3, G4                                              | 95                        |
| `57b1e1c` | `1336bd5` `9a7164a` | Hoài Bảo · 2026-10-20 14:34      | Merge pull request #13 from SEP490-FALL2026/dev                  | merge; cây = `9a7164a`    |
| `4e7097f` | `9a7164a` `459cb6f` | Bảo Phi · 2026-10-21 13:59       | Merge pull request #14 from SEP490-FALL2026/Bao_dev_be           | merge (remerge diff rỗng) |
| `94e70ce` | `9a7164a`           | Chill · 2026-10-22 17:10         | feat: update roadmap                                             | 2                         |
| `69f4891` | `94e70ce` `4e7097f` | Chill · 2026-10-22 17:11         | Merge branch 'dev' of github.com:SEP490-FALL2026/BE-dev into dev | merge (remerge diff rỗng) |

## 2. Delta `9a7164a..4e7097f` theo vùng

| Vùng      | Thêm | Sửa | Xóa | Đổi tên | Ghi chú                                                |
| --------- | ---- | --- | --- | ------- | ------------------------------------------------------ |
| `(root)`  | 0    | 7   | 0   | 0       |                                                        |
| `docs`    | 48   | 151 | 0   | 0       | 133 là spike dịch chỉ đổi định dạng; 66 tài liệu G2–G4 |
| `prisma`  | 26   | 3   | 0   | 0       | 24 migration + 5 model                                 |
| `scripts` | 0    | 1   | 0   | 0       |                                                        |
| `src`     | 227  | 48  | 12  | 2       | sản phẩm                                               |
| `test`    | 71   | 10  | 1   | 0       | e2e, integration, support                              |
| **Tổng**  |      |     |     |         | 607 path                                               |

## 3. Migration → hạng mục

| Migration                                                 | Hạng mục (spec/plan nhắc tên)                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `20261020090000_drop_catalog_sample`                      | `g3-catalog-foundation`                                                                       |
| `20261020100000_finance_money_and_exchange_rates`         | `g3-money-and-exchange-rates`                                                                 |
| `20261020100500_exchange_rates_immutable`                 | `g3-money-and-exchange-rates`                                                                 |
| `20261020110000_catalog_vendor_dictionary`                | `g3-vendor-dictionary`                                                                        |
| `20261020120000_catalog_applications`                     | `g3-catalog-entry`                                                                            |
| `20261020130000_catalog_plans`                            | `g3-plan-declaration`                                                                         |
| `20261020140000_finance_vendor_tax_profiles`              | `g3-vendor-tax-profile`                                                                       |
| `20261020150000_catalog_subscriptions`                    | `g3-subscription-purchase`                                                                    |
| `20261020160000_catalog_plan_terms`                       | `g3-vendor-terms-checklist`                                                                   |
| `20261020170000_catalog_application_business_owners`      | `g3-business-owner-replacement`                                                               |
| `20261020180000_finance_subscription_cost_allocations`    | `g3-shared-cost-allocation`                                                                   |
| `20261020190000_data_import_seat_baseline`                | `g4-seat-baseline-import`                                                                     |
| `20261020190100_licensing_assignments`                    | `g4-seat-baseline-import`                                                                     |
| `20261020200000_reporting_currency_locked_by_prices`      | `g2-operating-parameters`                                                                     |
| `20261020210000_catalog_standard_toolsets`                | `g3-standard-toolset`                                                                         |
| `20261020220000_licensing_provisioning_tasks`             | `g4-provisioning-queue-manual`                                                                |
| `20261020230000_licensing_provisioning_failure_values`    | `g4-provisioning-failure-handling`                                                            |
| `20261020230100_licensing_provisioning_failure_handling`  | `g4-provisioning-failure-handling`                                                            |
| `20261020240000_catalog_application_retirement`           | `g3-catalog-retire`                                                                           |
| `20261020250000_catalog_contracts_and_documents`          | `g3-contract-documents`                                                                       |
| `20261020260000_licensing_license_keys`                   | `g3-license-key-vault`                                                                        |
| `20261021100000_licensing_provisioning_task_max_attempts` | `g2-operating-parameters`, `g4-provisioning-failure-handling`, `g4-provisioning-queue-manual` |
| `20261021110000_catalog_standard_toolset_history_guard`   | `g3-standard-toolset`                                                                         |
| `20261021120000_licensing_provisioning_task_transitions`  | `g4-provisioning-failure-handling`, `g4-provisioning-queue-manual`                            |

Model Prisma: `catalog.prisma` (M), `data-import.prisma` (M), `finance.prisma` (A), `licensing.prisma` (A), `organization.prisma` (M).

## 4. Capability `src` → hạng mục

| Capability / tệp                                                                                     | Hạng mục                                                                                                |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `catalog/catalog-entry`                                                                              | g3-catalog-entry, g3-business-owner-replacement, g3-catalog-retire                                      |
| `catalog/contract`                                                                                   | g3-contract-documents                                                                                   |
| `catalog/functional-group`                                                                           | g3-catalog-entry                                                                                        |
| `catalog/plan`                                                                                       | g3-plan-declaration, g3-subscription-seat-guards                                                        |
| `catalog/plan-terms`                                                                                 | g3-vendor-terms-checklist                                                                               |
| `catalog/standard-toolset`                                                                           | g3-standard-toolset                                                                                     |
| `catalog/subscription`                                                                               | g3-subscription-purchase, g3-subscription-seat-guards, g3-shared-cost-allocation                        |
| `catalog/vendor`                                                                                     | g3-vendor-tax-profile, g3-catalog-entry                                                                 |
| `catalog/vendor-dictionary`                                                                          | g3-vendor-dictionary                                                                                    |
| `catalog/(root, dto, errors, mappers)`                                                               | g3-catalog-foundation (mẫu cũ gỡ: 12 tệp D)                                                             |
| `finance/*`                                                                                          | g3-money-and-exchange-rates, g3-vendor-tax-profile, g3-shared-cost-allocation                           |
| `licensing/assignment`                                                                               | g4-seat-baseline-import; `department-tools` của g2-department-profile (AC-13)                           |
| `licensing/license-key`                                                                              | g3-license-key-vault                                                                                    |
| `licensing/provisioning`                                                                             | g4-provisioning-queue-manual, g4-provisioning-failure-handling                                          |
| `licensing/seat-baseline`                                                                            | g4-seat-baseline-import                                                                                 |
| `data-import/seat-baseline-import`                                                                   | g4-seat-baseline-import                                                                                 |
| `data-import/employee-import (M)`                                                                    | g2-employee-import-preview-confirm (ngày vào, hàng đợi xem xét)                                         |
| `operating-parameters (M, A)`                                                                        | g2-operating-parameters (AC-9 tiền tệ báo cáo, AC-13 thử lại)                                           |
| `onboarding (M)`                                                                                     | g2-onboarding-checklist (bước 2→4, AC-5)                                                                |
| `organization/* (M)`                                                                                 | g2-department-profile, g2-job-title-catalogue-and-manual-employee (liên quan hire date)                 |
| `identity-access/accounts (M)`                                                                       | đếm IT Admin dùng được cho `QĐ-77m` (g4-provisioning-queue-manual)                                      |
| `core/money, core/seat-occupancy, core/search-key, core/account-identifier, core/csv (R)`            | g3-money-and-exchange-rates; g3-subscription-seat-guards; g3-vendor-dictionary; g4-seat-baseline-import |
| `infrastructure/object-storage, infrastructure/http, infrastructure/config, infrastructure/database` | g3-contract-documents (ADR-0014), g3-license-key-vault (khóa kho), operating-parameters                 |
| `app/app.module.ts, module-graph/architecture specs`                                                     | g3-catalog-foundation (ADR-0013)                                                                        |

Route mới và trạng thái mount: [README mục 3](README.md#3-disposition-g0g4-và-bằng-chứng-storyac); mọi controller mới đăng ký trong
module được `src/app/app.module.ts` import; `GRANT_REQUEST_GATE` gắn `RefusingGrantRequestGate`.

## 5. Tài liệu trong delta (không tính spike)

| Trạng thái | Path                                                                      |
| ---------- | ------------------------------------------------------------------------- |
| M          | `.env.example`                                                            |
| M          | `AGENTS.md`                                                               |
| M          | `ARCHITECTURE.md`                                                         |
| M          | `CONTRIBUTING.md`                                                         |
| M          | `README.md`                                                               |
| M          | `compose.yaml`                                                            |
| M          | `docs/README.md`                                                          |
| M          | `docs/decisions/0007-money-representation.md`                             |
| A          | `docs/decisions/0013-catalog-finance-licensing-contexts.md`               |
| A          | `docs/decisions/0014-object-storage-mounted-for-contract-documents.md`    |
| M          | `docs/guides/containers.md`                                               |
| M          | `docs/guides/kien-truc-backend-va-cach-viet-code.md`                      |
| A          | `docs/guides/license-key-vault.md`                                        |
| A          | `docs/reviews/g2-g4-completion-2026-10-21/README.md`                      |
| M          | `docs/roadmap.md`                                                         |
| M          | `docs/rules/api-contract.md`                                              |
| M          | `docs/rules/security-jobs.md`                                             |
| M          | `docs/workspace/items/README.md`                                          |
| M          | `docs/workspace/items/g2-cost-center-catalogue/spec.md`                   |
| M          | `docs/workspace/items/g2-department-profile/plan.md`                      |
| M          | `docs/workspace/items/g2-department-profile/spec.md`                      |
| M          | `docs/workspace/items/g2-employee-import-preview-confirm/plan.md`         |
| M          | `docs/workspace/items/g2-employee-import-preview-confirm/spec.md`         |
| M          | `docs/workspace/items/g2-job-title-catalogue-and-manual-employee/spec.md` |
| M          | `docs/workspace/items/g2-onboarding-checklist/plan.md`                    |
| M          | `docs/workspace/items/g2-onboarding-checklist/spec.md`                    |
| M          | `docs/workspace/items/g2-operating-parameters/plan.md`                    |
| M          | `docs/workspace/items/g2-operating-parameters/spec.md`                    |
| A          | `docs/workspace/items/g3-business-owner-replacement/plan.md`              |
| A          | `docs/workspace/items/g3-business-owner-replacement/spec.md`              |
| A          | `docs/workspace/items/g3-catalog-entry/plan.md`                           |
| A          | `docs/workspace/items/g3-catalog-entry/spec.md`                           |
| A          | `docs/workspace/items/g3-catalog-foundation/plan.md`                      |
| A          | `docs/workspace/items/g3-catalog-foundation/spec.md`                      |
| A          | `docs/workspace/items/g3-catalog-retire/plan.md`                          |
| A          | `docs/workspace/items/g3-catalog-retire/spec.md`                          |
| A          | `docs/workspace/items/g3-contract-documents/plan.md`                      |
| A          | `docs/workspace/items/g3-contract-documents/spec.md`                      |
| A          | `docs/workspace/items/g3-downstream-finance-integration/plan.md`          |
| A          | `docs/workspace/items/g3-downstream-finance-integration/spec.md`          |
| A          | `docs/workspace/items/g3-license-key-vault/plan.md`                       |
| A          | `docs/workspace/items/g3-license-key-vault/spec.md`                       |
| A          | `docs/workspace/items/g3-money-and-exchange-rates/plan.md`                |
| A          | `docs/workspace/items/g3-money-and-exchange-rates/spec.md`                |
| A          | `docs/workspace/items/g3-plan-declaration/plan.md`                        |
| A          | `docs/workspace/items/g3-plan-declaration/spec.md`                        |
| A          | `docs/workspace/items/g3-shared-cost-allocation/plan.md`                  |
| A          | `docs/workspace/items/g3-shared-cost-allocation/spec.md`                  |
| A          | `docs/workspace/items/g3-standard-toolset/plan.md`                        |
| A          | `docs/workspace/items/g3-standard-toolset/spec.md`                        |
| A          | `docs/workspace/items/g3-subscription-purchase/plan.md`                   |
| A          | `docs/workspace/items/g3-subscription-purchase/spec.md`                   |
| A          | `docs/workspace/items/g3-subscription-seat-guards/plan.md`                |
| A          | `docs/workspace/items/g3-subscription-seat-guards/spec.md`                |
| A          | `docs/workspace/items/g3-vendor-dictionary/plan.md`                       |
| A          | `docs/workspace/items/g3-vendor-dictionary/spec.md`                       |
| A          | `docs/workspace/items/g3-vendor-tax-profile/plan.md`                      |
| A          | `docs/workspace/items/g3-vendor-tax-profile/spec.md`                      |
| A          | `docs/workspace/items/g3-vendor-terms-checklist/plan.md`                  |
| A          | `docs/workspace/items/g3-vendor-terms-checklist/spec.md`                  |
| A          | `docs/workspace/items/g4-device-dependent-features/plan.md`               |
| A          | `docs/workspace/items/g4-device-dependent-features/spec.md`               |
| A          | `docs/workspace/items/g4-notification-delivery/plan.md`                   |
| A          | `docs/workspace/items/g4-notification-delivery/spec.md`                   |
| A          | `docs/workspace/items/g4-provisioning-failure-handling/plan.md`           |
| A          | `docs/workspace/items/g4-provisioning-failure-handling/spec.md`           |
| A          | `docs/workspace/items/g4-provisioning-queue-manual/plan.md`               |
| A          | `docs/workspace/items/g4-provisioning-queue-manual/spec.md`               |
| A          | `docs/workspace/items/g4-request-and-transfer-integration/plan.md`        |
| A          | `docs/workspace/items/g4-request-and-transfer-integration/spec.md`        |
| A          | `docs/workspace/items/g4-seat-baseline-import/plan.md`                    |
| A          | `docs/workspace/items/g4-seat-baseline-import/spec.md`                    |
| M          | `openapi.json`                                                            |

Spike `docs/workspace/items/dynamic-content-translation/spike/**`: 133 path `M` — 57 JSON parse bằng nhau, 68 bằng nhau khi
bỏ khoảng trắng, 8 chỉ khác xuống dòng, ngoặc bọc, dấu phẩy cuối hoặc kiểu nháy (Prettier). Không đổi hành vi.

## 6. Cây làm việc: 37 path của Prompt 07 (bảo toàn)

SHA-256 tệp làm việc trước Prompt 08 (preflight) và sau Prompt 08. `khác` = Prompt 08 thêm nội dung (ghi chú có ngày, trạng
thái, link) theo yêu cầu đồng bộ roadmap/chỉ mục/E; nội dung của Prompt 07 giữ nguyên. Bản sao byte của trạng thái preflight
được giữ ngoài repo để đối chiếu.

| Path                                                                      | Preflight           | Sau Prompt 08       |       |
| ------------------------------------------------------------------------- | ------------------- | ------------------- | ----- |
| `AGENTS.md`                                                               | `526bfad43282d74b…` | `526bfad43282d74b…` | giống |
| `ARCHITECTURE.md`                                                         | `c6b1ddc9bcbf667a…` | `c6b1ddc9bcbf667a…` | giống |
| `README.md`                                                               | `04ff8f3741c0727c…` | `04ff8f3741c0727c…` | giống |
| `docs/README.md`                                                          | `dd9cf5dd50dee995…` | `a0e757398a5e147b…` | khác  |
| `docs/examples/employee-import/README.md`                                 | `e71501a3b0dabfaa…` | `e71501a3b0dabfaa…` | giống |
| `docs/roadmap.md`                                                         | `f724ffebe4409052…` | `429c85f2023adbba…` | khác  |
| `docs/workspace/items/README.md`                                          | `0fbbf941e06040d5…` | `34a4908c5bb4160c…` | khác  |
| `docs/workspace/items/baseline-impact-and-remediation-2026-10-17/spec.md` | `caa82cd535f3b724…` | `caa82cd535f3b724…` | giống |
| `docs/workspace/items/business-baseline-impact-2026-10-22/plan.md`        | `19314e5d9f1787e2…` | `19314e5d9f1787e2…` | giống |
| `docs/workspace/items/business-baseline-impact-2026-10-22/spec.md`        | `4a1f801134943577…` | `7aef13ac1bea6b3c…` | khác  |
| `docs/workspace/items/foundation-remediation-handoff-2026-10-18/plan.md`  | `77846e92a5bcc22b…` | `77846e92a5bcc22b…` | giống |
| `docs/workspace/items/g2-cost-center-catalogue/spec.md`                   | `8d6a5a96bd96f0ce…` | `8d6a5a96bd96f0ce…` | giống |
| `docs/workspace/items/g2-department-profile/spec.md`                      | `face56007da7aba8…` | `face56007da7aba8…` | giống |
| `docs/workspace/items/g2-downstream-integration/plan.md`                  | `ff923d5818692dd6…` | `ff923d5818692dd6…` | giống |
| `docs/workspace/items/g2-downstream-integration/spec.md`                  | `98d693e2b4bcf077…` | `98d693e2b4bcf077…` | giống |
| `docs/workspace/items/g2-employee-import-preview-confirm/spec.md`         | `cc1b700146423e91…` | `cc1b700146423e91…` | giống |
| `docs/workspace/items/g2-employee-intake-by-super-admin/plan.md`          | `92b4dcb766531fe1…` | `92b4dcb766531fe1…` | giống |
| `docs/workspace/items/g2-employee-intake-by-super-admin/spec.md`          | `3b0fe68956d438d0…` | `3b0fe68956d438d0…` | giống |
| `docs/workspace/items/g2-employee-official-field-maintenance/plan.md`     | `f26df2e2bb2cec9f…` | `f26df2e2bb2cec9f…` | giống |
| `docs/workspace/items/g2-employee-official-field-maintenance/spec.md`     | `1bb3f11d7a46fa49…` | `1bb3f11d7a46fa49…` | giống |
| `docs/workspace/items/g2-fiscal-year-operating-parameters/plan.md`        | `08e1aa6dd9198e38…` | `08e1aa6dd9198e38…` | giống |
| `docs/workspace/items/g2-fiscal-year-operating-parameters/spec.md`        | `137db16530725182…` | `137db16530725182…` | giống |
| `docs/workspace/items/g2-g4-unit-only-cost-attribution/plan.md`           | `396bf78ca1d8ea0b…` | `396bf78ca1d8ea0b…` | giống |
| `docs/workspace/items/g2-g4-unit-only-cost-attribution/spec.md`           | `622ef7cd472e3af7…` | `622ef7cd472e3af7…` | giống |
| `docs/workspace/items/g2-job-title-catalogue-and-manual-employee/spec.md` | `f41c80504ab4970d…` | `f41c80504ab4970d…` | giống |
| `docs/workspace/items/g2-operating-parameters/spec.md`                    | `58789671911bb042…` | `58789671911bb042…` | giống |
| `docs/workspace/items/g3-catalog-entry/spec.md`                           | `1008d2a2f308b1f3…` | `1008d2a2f308b1f3…` | giống |
| `docs/workspace/items/g3-catalog-kind-contract-cleanup/plan.md`           | `0d4dbed3d67b4de1…` | `0d4dbed3d67b4de1…` | giống |
| `docs/workspace/items/g3-catalog-kind-contract-cleanup/spec.md`           | `a8f70d50a1ab2ce2…` | `a8f70d50a1ab2ce2…` | giống |
| `docs/workspace/items/g3-downstream-finance-integration/spec.md`          | `bb35dc8dbfa64ad9…` | `bb35dc8dbfa64ad9…` | giống |
| `docs/workspace/items/g3-shared-cost-allocation/spec.md`                  | `319adddabfc208aa…` | `319adddabfc208aa…` | giống |
| `docs/workspace/items/g4-notification-delivery/spec.md`                   | `4b3582ccbcfd77b9…` | `4b3582ccbcfd77b9…` | giống |
| `docs/workspace/items/g4-provisioning-failure-handling/spec.md`           | `2d8fd39d4279e406…` | `2d8fd39d4279e406…` | giống |
| `docs/workspace/items/g4-provisioning-queue-manual/spec.md`               | `ad1ed3800f87fac3…` | `ad1ed3800f87fac3…` | giống |
| `docs/workspace/items/g4-request-and-transfer-integration/spec.md`        | `4a2ad967f7d0248f…` | `169fc0cb90a18ff2…` | khác  |
| `docs/workspace/items/g4-seat-baseline-import/spec.md`                    | `cfda264ae2070fa9…` | `cfda264ae2070fa9…` | giống |
| `docs/workspace/sources.md`                                               | `5f3d2c9c78269ad0…` | `5f3d2c9c78269ad0…` | giống |

Prompt 08 thêm nội dung vào 5 / 37 path; 32 path giữ nguyên byte.

## 7. Path Prompt 08 thêm hoặc sửa (ngoài 37 path của Prompt 07)

| Path                                                                      | Trạng thái Git | SHA-256             |
| ------------------------------------------------------------------------- | -------------- | ------------------- |
| `docs/decisions/0007-money-representation.md`                             | M              | `8e55539555e05911…` |
| `docs/reviews/g0-g4-post-merge-review-2026-10-22/README.md`               | mới            | `9237381ad4b0652d…` |
| `docs/reviews/g0-g4-post-merge-review-2026-10-22/file-manifest.md`        | mới            | (tệp này)           |
| `docs/workspace/items/api-list-detail-contract-remediation/plan.md`       | mới            | `63ccae4a56a9f333…` |
| `docs/workspace/items/api-list-detail-contract-remediation/spec.md`       | mới            | `13450576bf3516c3…` |
| `docs/workspace/items/catalog-application-plan-read-contracts/plan.md`    | mới            | `31e59e0f0b6d3450…` |
| `docs/workspace/items/catalog-application-plan-read-contracts/spec.md`    | mới            | `37bd1f2fb4465359…` |
| `docs/workspace/items/catalog-licensing-write-integrity/plan.md`          | mới            | `3e135a7e85ca6a08…` |
| `docs/workspace/items/catalog-licensing-write-integrity/spec.md`          | mới            | `6e6c7532d013d9a4…` |
| `docs/workspace/items/catalog-standard-toolset-read-batching/plan.md`     | mới            | `2c76c30a7f24fc24…` |
| `docs/workspace/items/catalog-standard-toolset-read-batching/spec.md`     | mới            | `f47c236406bc2f73…` |
| `docs/workspace/items/catalog-subscription-read-model/plan.md`            | mới            | `ae9dc798fd598f28…` |
| `docs/workspace/items/catalog-subscription-read-model/spec.md`            | mới            | `e009be75c9f9bf6e…` |
| `docs/workspace/items/contract-document-upload-integrity/plan.md`         | mới            | `b564818fe043a4db…` |
| `docs/workspace/items/contract-document-upload-integrity/spec.md`         | mới            | `276ed2ba681f531d…` |
| `docs/workspace/items/delivery-gate-hardening/plan.md`                    | mới            | `3507c8b61f4c63af…` |
| `docs/workspace/items/delivery-gate-hardening/spec.md`                    | mới            | `0cd9e3dd8856316b…` |
| `docs/workspace/items/finance-reporting-currency-integrity/plan.md`       | mới            | `248a2273b7605269…` |
| `docs/workspace/items/finance-reporting-currency-integrity/spec.md`       | mới            | `1563672d0b89aa31…` |
| `docs/workspace/items/licensing-assignment-read-contracts/plan.md`        | mới            | `317006e2561cd8ea…` |
| `docs/workspace/items/licensing-assignment-read-contracts/spec.md`        | mới            | `f362b3c138255978…` |
| `docs/workspace/items/licensing-provisioning-task-read-contracts/plan.md` | mới            | `8fe1ce4b997fc3cf…` |
| `docs/workspace/items/licensing-provisioning-task-read-contracts/spec.md` | mới            | `7578c77b78c28843…` |
| `docs/workspace/items/organization-identity-read-contracts/plan.md`       | mới            | `d45aec6165387add…` |
| `docs/workspace/items/organization-identity-read-contracts/spec.md`       | mới            | `3bc9c58ff78f7d81…` |
| `docs/workspace/items/secret-and-upload-hardening/plan.md`                | mới            | `8048faa3e9d01ab0…` |
| `docs/workspace/items/secret-and-upload-hardening/spec.md`                | mới            | `db7394f821071553…` |

Ngoài repo BE: `Prompts/BE-audit-and-architecture-2026-10-18/BE-WORKSTREAM-TRACKER.md` (cập nhật hàng Prompt 07/08).
Không tệp sản phẩm, test, Prisma, migration, `openapi.json`, cấu hình hay package nào thay đổi.
