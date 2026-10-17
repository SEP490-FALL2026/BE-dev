# Spec: lát G2 — cấu hình Người duyệt chi, người thay thế khi xung đột và approver dự phòng

- Phụ trách: AI theo giao việc Owner (triển khai 16/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (16/10/2026). Hạng mục `g2-spending-approver-config` của bảng phủ G2.
- Thiết kế: ready. Triển khai: **verified** local 16/10/2026 (cây làm việc chưa commit trên `e833092`; xem [plan](plan.md)). Owner review: chưa review.
- Nguồn: Docs commit `3341ea0` ([sources](../../sources.md)). `US-01-03` AC-1, AC-2, AC-4 → AC-7 (`BE-UserStory/src/EP-01.md`); BRD v3.39 `FR-3.6`, `FR-3.12`, `FR-3.13`, `FR-3.15`, `FR-8.2`, `SoD-1`, `SoD-7`; `QĐ-22`, `QĐ-27`, `QĐ-28c`, `QĐ-39b`, `QĐ-62c`; `OI-17` (`BR-13.12`).
- Trạng thái yêu cầu: Story `BASELINED` (`QĐ-72`). Không câu hỏi mở nào chặn lát này.
- [Kế hoạch](plan.md).

## Vấn đề và phạm vi

Super Admin cấu hình **một** Người duyệt chi, **một** người thay thế khi người đó xung đột lợi ích, và **một** approver dự phòng ở gốc; mỗi vai có lịch sử. Lát này lưu cấu hình, kiểm điều kiện người giữ và cấp **vai suy ra `SPENDING_APPROVER`**. Nó không duyệt gì (`SoD-1`).

| Trong lát                                                                                                                 | Ngoài lát (nơi làm)                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-1 (đặt Người duyệt chi, audit), AC-2 (Super Admin không giữ vai nào), AC-4 (chỉ Super Admin), AC-5 (không có ủy quyền) | AC-1 vế "bước duyệt chi tạo sau gán cho người đó", AC-3 (xác định lại bước đang chờ, SLA không đặt lại), AC-8 (định tuyến việc khi phòng thiếu trưởng phòng) — G5 (`US-05-12`, `US-05-03`) |
| AC-6 (người nghỉ việc hoặc không có tài khoản dùng được bị từ chối), AC-7 (người thay thế ≠ Người duyệt chi)              | Chiều ngược của AC-2 (chuyển giao `SUPER_ADMIN` cho người giữ vai) — đã ở `US-01-09` (lát chuyển giao)                                                                                     |

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn           | Kết luận                                                                                                                                                                                                          | Nguồn / loại                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Lưu ở đâu, vai suy ra là gì   | Bảng `approval_role_holders` của `identity-access` (không phải `role_grants`). Chỉ **Người duyệt chi** sinh vai suy ra `SPENDING_APPROVER`; hai vai kia là dữ liệu cấu hình mà luồng duyệt (G5) đọc để định tuyến | ADR-08, `FR-3.6`; lựa chọn kỹ thuật |
| Hiệu lực                      | Từ lúc lưu (giờ máy chủ); người trước kết thúc ngay lúc đó; lịch sử giữ (tối đa 20 dòng/vai trong API)                                                                                                            | AC-1, AC-3                          |
| "Có tài khoản đang hoạt động" | Nhân viên chưa nghỉ **và** tài khoản `ACTIVE` + `ACTIVATED`. Khóa hoặc nghỉ việc **sau đó** không tự gỡ vai (vai không dùng được vì request bị từ chối; hiển thị/cảnh báo thuộc lát sau)                          | AC-6                                |
| Có gỡ (đặt "không ai") không  | Không có thao tác gỡ: Story chỉ nêu đặt và đổi; muốn đổi thì đặt người khác. Ghi vào danh sách việc Owner quyết nếu cần                                                                                           | lựa chọn thận trọng                 |
| Một người giữ hai vai         | Cho phép trừ cặp Người duyệt chi ↔ người thay thế (cấm trùng, AC-7); approver dự phòng có thể trùng một trong hai                                                                                                 | `BR-13.12`                          |

## Hành vi và thiết kế

Quyết định kỹ thuật **T-26**: mọi thay đổi ba vai tuần tự hóa sau một advisory lock (`pg_advisory_xact_lock(7300001)`) lấy **đầu giao dịch**, rồi Employee `FOR SHARE`, rồi AppUser `FOR SHARE` (thứ tự giao thức khóa); kiểm cặp "approver ≠ thay thế" nhờ advisory lock, trigger CSDL là lớp cuối. Partial unique: một người giữ hiện tại mỗi vai.

| Operation (operationId)                          | Vai           | Thành công                                                                                          | Lỗi riêng                                                                                                                                                                                                                               |
| ------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /approval-roles` (`approvalRoleList`)       | `SUPER_ADMIN` | 200 `APPROVAL_ROLE.LISTED` `{ items[{ role, holder                                                  | null, history[] }] }`                                                                                                                                                                                                                   | —   |
| `PUT /approval-roles/{role}` (`approvalRoleSet`) | `SUPER_ADMIN` | 200 `APPROVAL_ROLE.SET` (trả cả ba vai); body `{ employeeId }`; cùng người ⟹ không đổi, không audit | 404 `ORGANIZATION.EMPLOYEE_NOT_FOUND`; 422 `APPROVAL_ROLE.EMPLOYEE_NOT_ACTIVE` / `NO_USABLE_ACCOUNT` / `SUPER_ADMIN_CANNOT_HOLD` / `SUBSTITUTE_MUST_DIFFER`; `{role}` ∈ `SPENDING_APPROVER`, `CONFLICT_SUBSTITUTE`, `FALLBACK_APPROVER` |

Không có route ủy quyền, gỡ hay chỉ định người duyệt thay cho một yêu cầu (AC-5). Migration `20261016170000_approval_role_holders`: enum `ApprovalRole`, bảng, CHECK khoảng thời gian, partial unique một người giữ hiện tại mỗi vai, trigger cặp approver/thay thế. Audit `APPROVAL_ROLE.CHANGED` `before/after { role, holder }`.

## Acceptance và kiểm chứng

| US/AC         | Tình huống                                                                                      | Cấp test                | Bằng chứng                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| AC-1          | Đặt Người duyệt chi: vai suy ra có từ request kế tiếp, không phải grant, audit USER + vai       | HTTP + PostgreSQL       | PASS `approval-roles-http`                                                                 |
| AC-2          | Super Admin giữ bất kỳ vai nào ⟹ 422; dữ liệu sai bằng SQL vẫn không hiện vai suy ra            | HTTP + PostgreSQL, unit | PASS `approval-roles-http`, `account-policy.spec` (đột biến bỏ kiểm Super Admin ⟹ test đỏ) |
| AC-3 (vế đổi) | Đổi người: người cũ mất vai ngay, lịch sử giữ cả hai, audit trước → sau (xác định lại bước: G5) | HTTP + PostgreSQL       | PASS `approval-roles-http`                                                                 |
| AC-4, AC-5    | Finance/IT/Employee/trưởng phòng/chính Người duyệt chi ⟹ 403; không có route ủy quyền           | e2e + HTTP              | PASS e2e `approval-roles`, `approval-roles-http`                                           |
| AC-6          | Nghỉ việc / không tài khoản / chưa kích hoạt / bị khóa ⟹ 422 lý do riêng; người lạ ⟹ 404        | HTTP + PostgreSQL       | PASS `approval-roles-http`                                                                 |
| AC-7          | Thay thế = Người duyệt chi (cả hai chiều) ⟹ 422; trigger CSDL từ chối khi ghi vòng qua service  | HTTP + PostgreSQL       | PASS `approval-roles-http` (đột biến bỏ kiểm cặp ⟹ test đỏ)                                |
| Đồng thời     | Cùng một người làm Người duyệt chi và thay thế cùng lúc: một 200, một 422, không `40P01`        | integration `pg_locks`  | PASS `approval-roles-http`                                                                 |

## Sẵn sàng bàn giao

- [x] Nguồn cố định: Docs `3341ea0`; phạm vi/AC/contract rõ; phần chờ G5 liệt kê.
- [x] Người phụ trách nhận ownership duy trì spec/plan/test (AI theo giao việc Owner, 16/10/2026).

## Thay đổi và nghiệm thu

16/10/2026: thiết kế và triển khai cùng phiên. **Owner xác nhận khi review:** (1) không có thao tác gỡ vai; (2) chỉ Người duyệt chi sinh vai suy ra, hai vai kia là cấu hình G5 đọc; (3) khóa/nghỉ việc sau khi đã giữ vai không tự gỡ — G5/G6 phải xử lý khi định tuyến. Chưa review, chưa nghiệm thu.
