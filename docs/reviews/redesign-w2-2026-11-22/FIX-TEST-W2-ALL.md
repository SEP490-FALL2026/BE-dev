# FIX-TEST — đủ 113 spec integration cũ đỏ cuối đợt 2 (cho đợt 8)

> Sinh từ log CI run `45467273428` (nhánh `fix/w2-it-last`, trước gộp). Mọi spec **mới** của đợt 2 xanh; các spec dưới đây là test cũ khẳng định hành vi trước QĐ-118 / redesign. Audit `AUDIT-W12-NO-FAKE.md` lấy mẫu 21 dòng FIX-TEST: không dòng nào giấu lỗi logic. Phân loại tự động theo thông điệp lỗi đầu tiên của từng file — đợt 8 kiểm lại từng file.

Tổng: 85 × 403 do QĐ-118 (fixture thiếu IT phụ trách — thêm `setItAdminInCharge`), 15 × kỳ vọng giá trị/shape cũ, 4 × `plans_key_binding_k4`, 4 × 422 body cũ, 2 × cột bắt buộc `department_it_substitutes`, 1 × 404, 2 × chưa phân loại.

| Spec                                                                                        | Nguyên nhân chính (CI run 45467273428)            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `test/integration/budgets/commitment-release-by-day.integration-spec.ts`                    | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/budgets/commitment-release-ledger-rule.integration-spec.ts`               | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/budgets/commitment-release-on-transfer.integration-spec.ts`               | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/budgets/spend-commitment-lifecycle.integration-spec.ts`                   | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/budgets/spend-commitments.integration-spec.ts`                            | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/budgets/transfer-grace-sweep-ledger.integration-spec.ts`                  | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/catalog/application-responsibility-http.integration-spec.ts`              | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/catalog/application-retirement-http.integration-spec.ts`                  | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/catalog/plan-constraints.integration-spec.ts`                             | kỳ vọng giá trị/shape cũ                          |
| `test/integration/catalog/plan-terms-constraints.integration-spec.ts`                       | `plans_key_binding_k4` (gói K4 thiếu key_binding) |
| `test/integration/catalog/seat-baseline-contracts.integration-spec.ts`                      | kỳ vọng giá trị/shape cũ                          |
| `test/integration/catalog/seat-guards-http.integration-spec.ts`                             | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/catalog/shared-pool-subscription-http.integration-spec.ts`                | 422 (body cũ của route đổi contract)              |
| `test/integration/catalog/subscription-constraints.integration-spec.ts`                     | `plans_key_binding_k4` (gói K4 thiếu key_binding) |
| `test/integration/catalog/subscription-expiry-http.integration-spec.ts`                     | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/catalog/subscription-seat-increase-http.integration-spec.ts`              | kỳ vọng giá trị/shape cũ                          |
| `test/integration/dashboards/dashboards-http.integration-spec.ts`                           | kỳ vọng giá trị/shape cũ                          |
| `test/integration/dashboards/dashboards-progress.integration-spec.ts`                       | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/dashboards/revocation-sla.integration-spec.ts`                            | 404                                               |
| `test/integration/devices/devices-acknowledgement.integration-spec.ts`                      | chưa phân loại                                    |
| `test/integration/devices/devices-register.integration-spec.ts`                             | chưa phân loại                                    |
| `test/integration/devices/devices-stop-request.integration-spec.ts`                         | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/department-software-list-http.integration-spec.ts`              | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/department-software-proposals-http.integration-spec.ts`         | kỳ vọng giá trị/shape cũ                          |
| `test/integration/licensing/department-tools-http.integration-spec.ts`                      | kỳ vọng giá trị/shape cũ                          |
| `test/integration/licensing/handover-removed.integration-spec.ts`                           | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/k4-key-pool-grant.integration-spec.ts`                          | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/k4-key-pool-return.integration-spec.ts`                         | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/license-assignment-revocation.integration-spec.ts`              | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/license-key-constraints.integration-spec.ts`                    | `plans_key_binding_k4` (gói K4 thiếu key_binding) |
| `test/integration/licensing/license-key-http.integration-spec.ts`                           | kỳ vọng giá trị/shape cũ                          |
| `test/integration/licensing/license-key-import-plan-race.integration-spec.ts`               | `plans_key_binding_k4` (gói K4 thiếu key_binding) |
| `test/integration/licensing/licensing-provisioning-task-read-contracts.integration-spec.ts` | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/my-software-http.integration-spec.ts`                           | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/pool-grant-avoided-cost.integration-spec.ts`                    | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-decision-http.integration-spec.ts`                 | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-department-and-role.integration-spec.ts`           | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-failure-http.integration-spec.ts`                  | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-grant-cancellation-transfer.integration-spec.ts`   | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-grant-http.integration-spec.ts`                    | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-k1-checklist.integration-spec.ts`                  | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-k1-grant-checklist.integration-spec.ts`            | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-lock-order.integration-spec.ts`                    | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-pool-purchase.integration-spec.ts`                 | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-queue-http.integration-spec.ts`                    | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-revocation-complete.integration-spec.ts`           | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-revocation-open.integration-spec.ts`               | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-revocation-read-contracts.integration-spec.ts`     | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/provisioning-revocation-withdraw.integration-spec.ts`           | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/renewal-request.integration-spec.ts`                            | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/renewal-window-extension.integration-spec.ts`                   | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/return-request-conditions.integration-spec.ts`                  | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/rule-seats.integration-spec.ts`                                 | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/saas-issue-department.integration-spec.ts`                      | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/saas-issue-integrity.integration-spec.ts`                       | kỳ vọng giá trị/shape cũ                          |
| `test/integration/licensing/saas-issue-notifications.integration-spec.ts`                   | `department_it_substitutes` cột bắt buộc          |
| `test/integration/licensing/shared-pool-next-period.integration-spec.ts`                    | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/licensing/stock-summary.integration-spec.ts`                              | 422 (body cũ của route đổi contract)              |
| `test/integration/licensing/subscription-renewal-cancelled.integration-spec.ts`             | kỳ vọng giá trị/shape cũ                          |
| `test/integration/optimization/ghost-seat-g2-reclaim.integration-spec.ts`                   | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/optimization/ghost-seat-g2.integration-spec.ts`                           | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/optimization/ghost-seat-return.integration-spec.ts`                       | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/organization/department-contract-http.integration-spec.ts`                | kỳ vọng giá trị/shape cũ                          |
| `test/integration/organization/department-use-open-work.integration-spec.ts`                | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/departure-block-moment.integration-spec.ts`                     | 422 (body cũ của route đổi contract)              |
| `test/integration/personnel/departure-impact.integration-spec.ts`                           | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/it-handover-http.integration-spec.ts`                           | kỳ vọng giá trị/shape cũ                          |
| `test/integration/personnel/offboarding-access-block.integration-spec.ts`                   | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/offboarding-block-lifecycle.integration-spec.ts`                | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/offboarding-cancel-after-last-day.integration-spec.ts`          | 422 (body cũ của route đổi contract)              |
| `test/integration/personnel/offboarding-departure.integration-spec.ts`                      | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/offboarding-grounds-and-reasons.integration-spec.ts`            | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/offboarding-revocation-existing-task.integration-spec.ts`       | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/offboarding-unplaced.integration-spec.ts`                       | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/personnel-file-hooks.integration-spec.ts`                       | kỳ vọng giá trị/shape cũ                          |
| `test/integration/personnel/role-duties.integration-spec.ts`                                | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/transfer-effective-grace.integration-spec.ts`                   | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/transfer-grace-closure.integration-spec.ts`                     | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/transfer-grace-regrant.integration-spec.ts`                     | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/transfer-impact.integration-spec.ts`                            | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/personnel/transfer-read-grace.integration-spec.ts`                        | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/access-request-internal-path.integration-spec.ts`                | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/access-request-new-software.integration-spec.ts`                 | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/access-request-withdrawal.integration-spec.ts`                   | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/assessment-queue.integration-spec.ts`                            | kỳ vọng giá trị/shape cũ                          |
| `test/integration/requests/beneficiary-transferred-closure.integration-spec.ts`             | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/grant-self-claim.integration-spec.ts`                            | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/group-line-closure.integration-spec.ts`                          | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/group-request-edge.integration-spec.ts`                          | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/group-request-grant.integration-spec.ts`                         | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/group-request-notifications.integration-spec.ts`                 | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/group-request-withdrawal.integration-spec.ts`                    | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/k4-pool-commitment-release.integration-spec.ts`                  | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/leaver-request-closure.integration-spec.ts`                      | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/mobile-employee-requests.integration-spec.ts`                    | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/my-requests.integration-spec.ts`                                 | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/offboarding-integrity.integration-spec.ts`                       | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/offboarding-self.integration-spec.ts`                            | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/request-outcome-listeners.integration-spec.ts`                   | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/request-timings.integration-spec.ts`                             | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/requests-dashboard-facts.integration-spec.ts`                    | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/return-renewal-constraints.integration-spec.ts`                  | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/return-request.integration-spec.ts`                              | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/saas-issue-handling.integration-spec.ts`                         | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/saas-issue-submit.integration-spec.ts`                           | `department_it_substitutes` cột bắt buộc          |
| `test/integration/requests/self-service-every-role.integration-spec.ts`                     | kỳ vọng giá trị/shape cũ                          |
| `test/integration/requests/step-reassignment.integration-spec.ts`                           | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/withdrawal-before-first-decision.integration-spec.ts`            | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/year-start-commitments-kept.integration-spec.ts`                 | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/year-start-commitments-renewal.integration-spec.ts`              | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/requests/year-start-commitments.integration-spec.ts`                      | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/usage/usage-device-scope.integration-spec.ts`                             | 403 do QĐ-118 (fixture thiếu IT phụ trách)        |
| `test/integration/usage/vendor-account-review-notices.integration-spec.ts`                  | kỳ vọng giá trị/shape cũ                          |
