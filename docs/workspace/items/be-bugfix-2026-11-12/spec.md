# Spec: be-bugfix-2026-11-12 — sửa bug BE trước đợt MF-2/MF-3 (BUG-A, BUG-B)

- Phụ trách: chat code (Sonnet) theo giao việc Owner (12/11/2026); Owner review cuối.
- Thiết kế ban đầu bởi: Owner cùng AI điều phối (12–13/11/2026); spec và plan đầy đủ ở [reviews/be-bugfix-2026-11-12](../../../reviews/be-bugfix-2026-11-12/SPEC.md).
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `373bb6b` (BRD 4.12, US 0.16, `QĐ-111g`, `QĐ-111p`, `QĐ-111aw`, `QĐ-104l`; không dùng Story/AC mới), BE `b71ed330`.
- Nhóm roadmap: sửa lỗi ngoài nhóm G — chỉ là container (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · [SPEC chi tiết](../../../reviews/be-bugfix-2026-11-12/SPEC.md) · [bàn giao](../../../reviews/be-bugfix-2026-11-12/HANDOFF-CODE.md).

## Business outcome

BE trả đúng luật đã chốt ở `QĐ-111`: dashboard IT đếm máy chưa xác nhận từ sổ thiết bị, bảng ghost seat không lộ họ tên và `MINE`
theo phạm vi IT Admin, thu hồi khóa `K4` bắt buộc ghi cách xử lý, mỗi ứng dụng có IT Admin phụ trách (người tạo, chuyển bằng route
riêng) và không còn Business Owner trong code đang chạy. Kiểm bằng test policy, test HTTP/integration từng route và các gate.

## Sizing decision

- Container: yêu cầu trực tiếp của Owner (12/11/2026) — sáu bug lệch tài liệu trước đợt MF-2/MF-3; container, không phải ranh giới.
- Mode: `technical-enabler`.
- Outcome and owner: BE khớp `QĐ-111` ở các điểm nêu trên để các đợt MF-2/MF-3 và feedback FE làm tiếp trên nền đúng; capability
  `optimization/board`, `licensing/provisioning`, `dashboards/it-admin`, `catalog/catalog-entry`, `catalog/application-responsibility`
  và `identity-access/it-admin-directory`.
- Boundaries: một migration thêm cột `applications.responsible_it_admin_employee_id` (không drop cột Business Owner); xóa năm route, thêm
  hai route (`responsibility-transfer`, `GET /it-admins`); đổi contract các route nêu ở SPEC §3; không đụng luồng MF-2/MF-3.
- Not larger: B6 (luồng hóa đơn) thuộc gói `PI-1` của feedback FE; mọi thay đổi MF-2/MF-3.
- Not smaller: sáu bug cùng một đợt đồng bộ contract và tài liệu API FE; tách riêng làm FE đổi contract nhiều lần.
- Siblings: `qd103-remove-business-owner`.
- Scope map: n/a

## Primary Story/AC

| Story | AC       | Coverage | Phần còn lại thuộc                                                                           |
| ----- | -------- | -------- | -------------------------------------------------------------------------------------------- |
| —     | `BUG-01` | n/a      | gỡ chặn `qd103-remove-business-owner`: gỡ hẳn Business Owner khỏi code đang chạy (`QĐ-111g`) |

`BUG-01` = sáu bug B1–B5, B7 của [SPEC](../../../reviews/be-bugfix-2026-11-12/SPEC.md) §2 và các điều kiện xong D1–D7.

## Supporting references

`US-09-01` AC-2, `US-07-05` AC-6/AC-7, `US-04-06` AC-7/AC-8, BRD §7.5, `OQ-03`, R-20, R-26; [PLAN](../../../reviews/be-bugfix-2026-11-12/PLAN.md).

## Explicit out of scope

B6 và luồng mua–trả tiền (gói `PI-1` của feedback FE); MF-2/MF-3; drop cột và bảng Business Owner (ở đợt dọn, ghi
[roadmap](../../../roadmap.md)).

## Dependencies and blockers

Không có blocker. Chạy trước gói MF-2/MF-3 và feedback FE trên nhánh `feat/mf2-mf3`.

## Ownership: module, data, API

Theo SPEC §2–§4 ở [reviews](../../../reviews/be-bugfix-2026-11-12/SPEC.md): bảng ghi `applications` (cột mới), route đổi ở SPEC §3.

## Behavior and design

Toàn bộ luật, API, migration và tương thích ở [SPEC](../../../reviews/be-bugfix-2026-11-12/SPEC.md); không nhắc lại ở đây.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case) | Cấp test                | Kết quả mong đợi | Bằng chứng sau implement                                              |
| ----------- | ----------------------------------- | ----------------------- | ---------------- | --------------------------------------------------------------------- |
| BUG-01      | Theo SPEC §6 (mỗi bug một dòng)     | unit, HTTP, integration | xanh             | [HANDOFF-CODE](../../../reviews/be-bugfix-2026-11-12/HANDOFF-CODE.md) |

## Definition of Done

- [ ] Quick check từng task và gate cuối gói xanh; kết quả thật ở HANDOFF-CODE.
- [ ] Tài liệu API FE sinh lại cho route đổi/xóa; changelog ghi route bị xóa.
- [ ] Full test và seed ở pha cuối chung, trước khi giao chat review.

## Changes and acceptance

Chưa nghiệm thu. Owner đã trả lời các điểm cần Owner ở HANDOFF-CODE (12/11/2026).
