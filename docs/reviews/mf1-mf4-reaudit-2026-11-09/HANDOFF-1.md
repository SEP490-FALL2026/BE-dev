# HANDOFF — Gói 1: MF4-A

**Chat code:** B (Claude)
**Ngày bắt đầu:** 09/11/2026, 09:20 UTC+7

## Tiến độ

### Task 1, 3, 4 của hạng mục (từ chat A)
- [x] Migration `budget_versions.origin`, `base_reason` (12 file chưa commit)
- [x] Kiểm B4 khi gửi, `baseReason` bắt buộc
- [x] Phiên bản từ số liệu nền (baseline, số liệu nền, gói)
- [x] Job nhắc hạn, báo trưởng phòng mới

### Delta SPEC §4 MF4-A (chat B)
- [ ] C4-03: Sửa test `budget-cycle-deadline.integration-spec.ts:79-124` — `departmentCount` → `departmentId`
- [ ] C4-04: Thêm test unit `subscriptionCost` 3 ca, `willRenew` hết hôm nay; integration `VENDOR_REFUSED`
- [ ] C4-07: Test `hasSuccessor` chỉ khi kỳ kế tiếp `ACTIVE` (đã thêm field, cần test)
- [ ] C4-09: Test loại phòm đã có phiên bản khỏi `missing`
- [ ] C4-08(a): Test giữ gợi ý _Renew_ khi kỳ kế tiếp chưa bắt đầu (đã thêm logic, cần test)
- [ ] F-115: ADR-0018 + `security-jobs.md`

## Lệnh verify (đợi xong)

```bash
# Quick check set
pnpm typecheck && pnpm lint && pnpm format:check && pnpm arch:check && pnpm arch:docs:check && pnpm rules:check
pnpm prisma:validate && pnpm test:gates && pnpm test:discovery && pnpm openapi:export

# Test

pnpm test -- src/modules/budgets/cycle/baseline.policy.spec.ts
pnpm test:integration -- test/integration/budgets/budget-cycle-deadline.integration-spec.ts
```

## Lệch so với SPEC

(ghi lại nếu có sự khác biệt)

## Việc để lại

(ghi rõ nếu có việc còn dở)
