# HANDOFF chat code <A> — gói 2, 3, 4, 7, 8

## Gói 2 — MF1-A (trong quá trình)

**Trạng thái:** Task 1 ✅ commit, Task 2 phần pricing ✅ commit, Task 2 phần DTO/ghi trong tiến hành.

| Lượt | Task | Commit | Unit test | Ghi chú |
|-----|------|--------|-----------|---------|
| 1 | Task 1 migration | `2213dc16` | N/A (schema) | Schema + migration SQL + test constraint (DB chưa migrate) |
| 2 | Task 2 pricing ONE_TIME | `4e7ce8c2` | 25 passed ✅ | Hàm `priceRequest()` + 3 test R-B01 |
| 2 | Task 2 kind trả về | `da8f42db` | 5 passed ✅ | Sửa `SubscriptionFactsService.priceOfPlan()`, call site request-facts |

**Việc còn lại Task 2:**
- Sửa `access-request.types.ts` để thêm `kind` vào `PricingRecord` ⟹ sửa các mapper (pricing-view, access-request-pricing)
- Sửa flow gửi cá nhân `request-intake/access-request-submission.mapper.ts` ghi `priceKind`
- Test matrix Q-29 (Request tiếp tục: kỳ mới năm sau ⟹ 0 tháng) — chưa duyệt các usecase khác
- Integration test (cần Docker)

**Blocker:** Docker container `slm-test-db` không chạy — không thể migration vào DB hay chạy integration.

**TẠM CHỌN (confirm):** Mỗi phần task commit riêng cho dễ review.

---

## Gói 3, 4, 7, 8

Chưa bắt đầu — phụ thuộc phần còn lại gói 2 xong hoặc hủy ghi.

**Lựa chọn:**
1. Tiếp tục gói 2 (cần Docker để test)
2. Chuyển gói 3 trước (độc lập phần ngân sách, không cần gói 2 xong)
3. Ghi BLOCKED gói 2, làm gói 7/8 trước (không chạm ngân sách check)

Owner chọn tiếp tục gói 2 hay chuyển gói khác.

