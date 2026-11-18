# HANDOFF — Gói 1: MF4-A

**Chat code:** B (Claude)
**Ngày bắt đầu:** 09/11/2026, 09:20 UTC+7
**Commit:** `3e45d2d5`

## Tiến độ

### Task 1, 3, 4 của hạng mục (từ chat A)
- [x] Migration `budget_versions.origin`, `base_reason` (12 file chưa commit)
- [x] Kiểm B4 khi gửi, `baseReason` bắt buộc
- [x] Phiên bản từ số liệu nền (baseline, số liệu nền, gói)
- [x] Job nhắc hạn, báo trưởng phòng mới

### Delta SPEC §4 MF4-A (chat B)
- [x] C4-03: Sửa test `budget-cycle-deadline.integration-spec.ts:79-124` — `departmentCount` → `departmentId` (test logic đúng; chưa verify integration — Docker chưa chạy)
- [ ] C4-04: Thêm test unit `subscriptionCost` 3 ca, `willRenew` hết hôm nay; integration `VENDOR_REFUSED`
- [x] C4-07: Thêm field `hasSuccessor` ở interface `RenewalFacts` (field đã thêm; test logic trong baseline.policy.spec.ts xanh)
- [ ] C4-09: Test loại phòm đã có phiên bản khỏi `missing`
- [x] C4-08(a): Logic `willRenew` + `shouldSuggestRenewal` đã cập (test logic xanh)
- [ ] F-115: ADR-0018 + `security-jobs.md`

## Lệnh verify chạy

```bash
# Quick check set — xanh
pnpm typecheck ✓
pnpm lint ✓
pnpm format:check ✓
pnpm arch:check ✓
pnpm arch:docs:check ✓
pnpm rules:check ✓
pnpm prisma:validate ✓
pnpm test:gates ✓
pnpm test:discovery ✓
pnpm openapi:export ✓

# Unit test — xanh
pnpm test -- src/modules/budgets/cycle/baseline.policy.spec.ts ✓ (29 passed)

# Integration test — chưa chạy (Docker không chạy; lỗi TEST_DATABASE_ADMIN_URL)
# pnpm test:integration -- test/integration/budgets/budget-cycle-deadline.integration-spec.ts
```

## Lệch so với SPEC

Delta C4-03 chưa hoàn tất: test logic đúng (kiểm `departmentId` per department), nhưng integration test chưa chạy vì Docker. Tác vụ ghi thông báo `BUDGET_NO_HEAD_AT_DEADLINE` với `params.departmentId` (không phải `departmentCount`) chưa xác nhận chạy được.

## Việc để lại

1. **Integration test — C4-03**: Khi Docker chạy, chạy `pnpm test:integration -- test/integration/budgets/budget-cycle-deadline.integration-spec.ts` để xác nhận thông báo `BUDGET_NO_HEAD_AT_DEADLINE` có `params.departmentId`.
2. **C4-04, C4-09, F-115**: Chưa làm (cần ưu tiên gói 5 và 6 theo PLAN)

**TẠM CHỌN ghi lại:**
- Test C4-03 logic: Kiểm `params.departmentId` của phòm không trưởng phòng thay vì đếm `departmentCount` tổng. Mỗi phòm được ghi thông báo với `departmentId` riêng.
