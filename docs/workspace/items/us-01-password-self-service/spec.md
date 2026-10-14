# Spec: lát 1c — quên, đặt lại và đổi mật khẩu

- Phụ trách: chưa phân công; reviewer: một dev khác, ngang quyền.
- Thiết kế: **draft — đầu vào refinement** (14/10/2026, trợ lý AI từ review US). Review: chưa review. Mặc định kỹ thuật
  `T-1`→`T-10` dưới đây là **đề xuất chờ dev review**, không phải quyết định.
- Nguồn: snapshot `S-2026-10-12b` (Docs `0e0bb83`, [sources](../../sources.md)) cho `US-01-10` AC-3 → AC-9 và `FR-8.11`
  (a)→(h) — không đổi từ baseline; **cộng delta `S-2026-10-14b`** cho `US-01-10` **AC-12** (thư báo, `QĐ-73a`,
  `FR-8.11`(i)). `FR-8.1`, `FR-8.3`, `FR-8.8`, `FR-8.9`, `INV-05`; `QĐ-46a`→`QĐ-46d`, `QĐ-39c`/`39d`, `QĐ-41a`, `QĐ-47`.
  Điểm lệch `L-2` (đăng nhập nội bộ): GVHD đã duyệt theo thông báo của Owner (`QĐ-72`) — không phải duyệt spec này.
- Thiết kế kế thừa: [ADR-0011](../../../decisions/0011-internal-authentication-and-sessions.md),
  [ADR-0012](../../../decisions/0012-account-email-delivery.md) (đều _Proposed_);
  [G0](../foundation-org-identity-boundary/spec.md), [1a](../us-01-bootstrap-login-session/spec.md),
  [1b](../us-01-account-invitation-activation/spec.md) (merged `64073c4`, chưa accepted).
- [Kế hoạch](plan.md).

## Vấn đề và phạm vi

Chủ tài khoản đã kích hoạt tự lấy lại hoặc đổi mật khẩu mà không ai khác biết mật khẩu; đổi/đặt lại thu hồi mọi phiên
và không làm tài khoản khóa hoặc của nhân viên đã nghỉ việc dùng lại được.

| Trong lát 1c                                                                        | Ngoài lát (nơi làm)                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `US-01-10` AC-3 (quên mật khẩu, phản hồi chung), AC-4 (đặt lại), AC-5 (đổi)         | AC-1, AC-2, AC-8, AC-9 phần kích hoạt — lát 1b (merged)                        |
| AC-6 vế đặt lại/đổi: tài khoản **khóa** hoặc nhân viên **đã nghỉ việc** vẫn bị chặn | AC-10 khôi phục thông tin đăng nhập — `us-01-09-super-admin-transfer-recovery` |
| AC-7 vế đặt lại khi đang bị từ chối tạm thời                                        | AC-11 mobile — G10                                                             |
| AC-9 cho sự kiện của lát; **AC-12** thư báo đã đổi/đặt lại (`QĐ-73a`)               | Chuyển _đã nghỉ việc_ thật — G6 (lát này dựng bằng fixture)                    |

Không claim hoàn thành `US-01-10`: còn AC-10, AC-11.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                                                          | Kết luận hoặc blocker                                                                            | Nguồn                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| Q-1 thư báo đã đổi/đặt lại?                                                  | **Có** — chỉ báo sự kiện, không mã/liên kết, tới email đang lưu; thư lỗi không làm hỏng thao tác | Owner `QĐ-73a`, AC-12   |
| Q-2 đặt lại qua liên kết có tính là xác minh email của Super Admin khởi tạo? | Hoãn sang `US-01-09` (`QĐ-67b`); 1c chỉ **lưu bằng chứng** thời điểm đặt lại thành công          | đề xuất, chờ dev review |
| Actor của yêu cầu quên mật khẩu ẩn danh (AC-9)                               | `T-4`                                                                                            | đề xuất                 |
| `foundation spec` ghi ngoại lệ I-6 _đang đặt lại do khôi phục_ cho 1c        | Thuộc `US-01-09`; 1c giữ điều kiện nhận thư trong **một** hàm để AC-10 thêm vế sau               | review US 14/10/2026    |
| N-1 (kết nối CSDL trả về giữa giao dịch)                                     | **Chặn code**, không chặn thiết kế — [remediation](../g0-g1-remediation-after-rereview/plan.md)  | re-review `a8ba88f`     |

## Hành vi và thiết kế

**Luồng.** _Quên:_ route công khai nhận email → luôn cùng phản hồi; chỉ email (a) _tài khoản kích hoạt, đang hoạt động,
nhân viên chưa nghỉ việc_ mới tạo token `RESET_PASSWORD` + outbox thư tới **email đang lưu** (không phải chuỗi nhập).
_Đặt lại:_ policy mật khẩu → tra token theo hash → băm Argon2 **ngoài** giao dịch → giao dịch: khóa `AppUser`, khóa token,
kiểm lại trạng thái/hash, thay credential, tiêu token, thu hồi mọi phiên và token còn lại, audit, outbox thư báo (AC-12).
_Đổi:_ đã đăng nhập, không yêu cầu vai (tài khoản 0 vai vẫn đổi được; Super Admin tự đổi được — `FR-8.8`); sai mật khẩu
hiện tại → từ chối; đúng → như đặt lại, thu hồi **cả phiên hiện tại**.

**Không đổi:** vai, trạng thái khóa, trạng thái nhân viên; không tự đăng nhập sau đặt lại; không route cho người khác đặt
lại hộ (AC-8). Thứ tự khóa theo [G0](../foundation-org-identity-boundary/spec.md) (dòng _Đổi/đặt lại mật khẩu_).

**Đề xuất kỹ thuật (chờ dev review):**

| Mã   | Đề xuất                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| T-1  | TTL token đặt lại 30 phút, cấu hình được                                                                                       |
| T-2  | Giới hạn thư theo email (khóa HMAC như throttle đăng nhập) trên giới hạn route/IP; phản hồi không đổi khi bị chặn              |
| T-3  | Đặt lại thành công xóa bộ đếm từ chối tạm thời của email                                                                       |
| T-4  | Email (a): audit `PASSWORD_RESET.REQUESTED` (actor hệ thống) cùng giao dịch token + outbox; (b)–(e): chỉ log cấu trúc          |
| T-5  | Quên: 202; token sai/hết hạn/đã dùng: một lỗi chung; sai mật khẩu hiện tại: 422 (không 401); đổi thành công xóa cookie refresh |
| T-6  | Đếm sai mật khẩu hiện tại theo tài khoản, 429 khi vượt ngưỡng; **không bao giờ** khóa tài khoản                                |
| T-7  | Đổi/đặt lại thu hồi token đặt lại còn treo; lý do thu hồi phiên riêng cho đổi và đặt lại                                       |
| T-8  | Dùng lại policy mật khẩu của 1a; không kiểm _mới = cũ_                                                                         |
| T-9  | Migration mới chỉ thêm giá trị enum; không sửa migration đã merge                                                              |
| T-10 | Worker thư kiểm lại trạng thái trước khi gửi: `RESET_PASSWORD` như `INVITE`, gồm kiểm nhân viên đã nghỉ việc                   |

**API/Logical:** chưa thiết kế chi tiết request/response và bảng ngoài các enum/token đã có ở G0/1b — làm ở bước 1 của
[plan](plan.md), review cùng spec. Không có endpoint nào được coi là hợp đồng cho tới khi review.

## Acceptance và kiểm chứng

| US/AC              | Tình huống                                                                                                             | Cấp test, kết quả mong đợi                            | Bằng chứng |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------- |
| AC-3               | Năm email (a)–(e) cùng phản hồi; chỉ (a) có outbox; email biến thể → thư tới email đang lưu                            | e2e + integration: body/status giống nhau, đếm outbox | chưa có    |
| AC-4               | Dùng liên kết hai lần; phiên cũ; vai/khóa/nhân viên không đổi                                                          | e2e: lần 2 lỗi chung; token cũ 401 ở request kế tiếp  | chưa có    |
| AC-5               | Sai/đúng mật khẩu hiện tại; tài khoản 0 vai; Super Admin tự đổi                                                        | e2e                                                   | chưa có    |
| AC-6 (đặt lại/đổi) | Khóa sau khi phát token; mở khóa không hồi token; nhân viên nghỉ việc (fixture)                                        | integration                                           | chưa có    |
| AC-7 (đặt lại)     | 5 lần sai → 429; quên + đặt lại vẫn thành công                                                                         | e2e                                                   | chưa có    |
| AC-9               | Audit/log/outbox không chứa mật khẩu/token; giao dịch lỗi không để lại audit                                           | integration + grep                                    | chưa có    |
| AC-12              | Đổi/đặt lại thành công → đúng một thư báo, không mã/liên kết; thất bại → không thư; outbox lỗi → thao tác vẫn hiệu lực | integration                                           | chưa có    |
| Đồng thời          | đặt lại↔khóa, đặt lại↔đăng nhập, đổi↔đổi, quên↔quên, quên↔khóa                                                         | integration theo mẫu `database-stall`                 | chưa có    |

## Sẵn sàng bàn giao

- [ ] Người nhận truy cập được Docs `0e0bb83` và tệp của delta `S-2026-10-14b` (cùng máy hoặc gói snapshot; hash ở
      [sources](../../sources.md)); trước khi giao implementation, nguồn được cố định và truy cập được.
- [ ] T-1→T-10 và API được dev khác review; plan review cùng spec.
- [ ] Nhánh remediation `a0cf5f1` được dev review và merge ở revision xác định; D1/D4 vẫn PASS trên revision PR.

**Mức sẵn sàng:** _ready for refinement/design_. **Chưa** ready for implementation.

## Thay đổi và nghiệm thu

14/10/2026: tạo từ review US theo lát (Docs `Reviews/us-erd-uc-redesign-2026-10-10/`), thêm AC-12 theo `QĐ-73a`.
Chưa implement, chưa nghiệm thu.
