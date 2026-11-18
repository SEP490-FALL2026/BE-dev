# Spec: H3a — R-1, bỏ `sharedAccounts` khỏi `DEPARTMENT.IN_USE`

- Phụ trách: AI theo giao việc Owner (Prompt 06, 18/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner, từ R-1 của
  [baseline-impact-and-remediation-2026-10-17](../baseline-impact-and-remediation-2026-10-17/spec.md) và lát H3a của
  [foundation-remediation-handoff-2026-10-18](../foundation-remediation-handoff-2026-10-18/spec.md).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — `US-03-06` AC-19; `QĐ-75` thay vế _tài khoản dùng chung_ của `QĐ-66b`),
  BE `bd05007` (`dev`) cộng H2a/04B/H2b chưa commit.
- Nhóm roadmap: G2 — chỉ là planning container, không phải phạm vi của hạng mục này.
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, khi IT Admin ngừng một phòng còn thành viên, lời từ chối chỉ nêu đúng hai nhóm mà nghiệp vụ hiện hành có —
thành viên và việc đang mở — không còn khóa `sharedAccounts` của phạm vi đã bỏ theo `QĐ-75`. Kiểm được bằng response 409
của `POST /api/v1/departments/{id}/deactivate`.

## Primary Story/AC

| Story      | AC                                                                                              | Coverage | Phần còn lại thuộc                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `US-03-06` | AC-19 — vế lời từ chối chỉ có _thành viên_ và _việc đang mở_ (bỏ tài khoản dùng chung, `QĐ-75`) | partial  | `openWork` thật (rà soát, khuyến nghị, xác nhận) ở G5/G7; vế thành viên đã có ở [g2-department-profile](../g2-department-profile/spec.md) |

## Supporting references

- `QĐ-75` (Docs `9416fe0`, sổ quyết định: thay một phần `QĐ-66b` — bỏ vế tài khoản dùng chung khi ngừng/gộp phòng).
- Audit 18/10/2026 F-02, Q4 (R-1/R-2 trước refactor `organization`); ma trận M-01 → M-05 của remediation.
- [API contract](../../../rules/api-contract.md) (lỗi: `details` là object an toàn do server chọn).

## Explicit out of scope

- H3b/R-2 (lý do khóa/mở khóa, `QĐ-81`), H3c (`US-01-10` AC-10).
- Refactor `organization` (capability, controller, repository, lỗi), ops, role PostgreSQL, H4–H8, G3–G10.
- Đổi route, method, `operationId`, quyền, security, status, mã lỗi, message, điều kiện ngừng phòng, giao dịch, audit,
  idempotent; schema, Prisma, migration; OpenAPI presentation và 422/429 của H2.
- Sửa FE/Mobile hay repo Docs.

## Dependencies and blockers

- H2a/04B/H2b (chưa commit) là nền cây làm việc; H3a không chạm file của chúng ngoài roadmap và items index.
- Consumer: client nào đọc `details.sharedAccounts` phải bỏ phụ thuộc. Lúc lập R-1 không có consumer trong `Code/FE-web`
  hay `Code/Mobile` (remediation, 18/10/2026); lượt này không kiểm lại repo FE/Mobile.

## Ownership: module, data, API

- Module: `organization` — `organization.http-errors.ts` (ánh xạ `DepartmentInUseError`), chú thích `department.service.ts`.
- Dữ liệu: không đổi. API: `departmentDeactivate` 409 `DEPARTMENT.IN_USE` — `details` bỏ một khóa; OpenAPI không đổi vì
  `details` là object mở của `ErrorEnvelopeDto`.

## Behavior and design

**Response 409 trước/sau** (`POST /api/v1/departments/{id}/deactivate` khi phòng còn thành viên):

|                           | Trước                                                                           | Sau                                   |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| Status, `code`, `message` | 409, `DEPARTMENT.IN_USE`, `The department still has members.`                   | không đổi                             |
| Khóa của `details`        | `members`, `totalMembers`, `sharedAccounts` (luôn `[]`), `openWork` (luôn `[]`) | `members`, `totalMembers`, `openWork` |
| `members[]`               | `{ employeeCode, fullName }`, tối đa 20                                         | không đổi                             |

`sharedAccounts` không còn tồn tại — không `[]`, `null` hay khóa thay thế. Phòng vẫn `ACTIVE`, không ghi audit; nhánh
ngừng thành công và idempotent không đổi.

**Không áp dụng:** migration, transaction mới, job, storage, quyền.

## Test matrix

| AC / rủi ro                   | Tình huống                     | Cấp test    | Kết quả mong đợi                                                                                                                             | Bằng chứng sau implement |
| ----------------------------- | ------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `US-03-06` AC-19 (vế `QĐ-75`) | Ngừng phòng còn một thành viên | integration | 409 `DEPARTMENT.IN_USE`, message cũ; `details` đúng ba khóa; không own property hay chuỗi `sharedAccounts`; phòng `ACTIVE`, audit không thêm | plan                     |
| Hồi quy                       | Ngừng phòng rỗng; gọi lại      | integration | 200, cùng đáp án (test có sẵn)                                                                                                               | plan                     |
| Contract OpenAPI              | `pnpm openapi:export`          | artifact    | giống hệt từng byte                                                                                                                          | plan                     |

## Definition of Done

- [x] Test đỏ trước vì `sharedAccounts` còn tồn tại, xanh sau fix; bằng chứng ở plan.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên cây cuối; `openapi.json` không đổi.
- [x] R-1 ở remediation, handoff, roadmap và ghi chú `g2-department-profile` cập nhật theo bằng chứng.
- [x] Không tăng legacy ledger kiến trúc.
- [x] Phần chưa kiểm chứng và consumer handoff ghi rõ.

## Changes and acceptance

- 18/10/2026: tạo hạng mục, thiết kế `ready`; implement và `verified` local (bằng chứng ở [plan](plan.md)). Chưa commit,
  chưa Owner review, chưa nghiệm thu.
- 19/10/2026: implementation ở commit `5aac33f` trên `dev` = `origin/dev` (Owner push trực tiếp 19/10/2026, không PR).
  Remote CI chưa có bằng chứng, chưa Owner review, chưa nghiệm thu.
