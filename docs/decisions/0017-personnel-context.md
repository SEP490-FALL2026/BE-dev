# ADR-0017: Ngữ cảnh `personnel` (C2) cho vòng đời nhân sự

## Trạng thái

**Proposed** — 24/10/2026, do người phụ trách G6 (AI theo giao việc của người dùng) đề xuất khi implement
[`g6-transfer-record`](../workspace/items/g6-transfer-record/spec.md). Proposed chưa phải Accepted: chưa có sự kiện Owner review.

## Bối cảnh

Điều chuyển phòng hoặc chức vụ, nghỉ dài và nghỉ việc (`US-03-01`, `US-03-02`, `US-03-03`) là những sự kiện đời người của nhân viên,
mỗi sự kiện có ngày hiệu lực và căn cứ. Chúng phải gọi `identity-access` (ai là IT Admin, ai giữ Super Admin), `catalog` (Business
Owner), `licensing` và `requests` (rút quyền, bước đang chờ) — mà `licensing` và `requests` đã phụ thuộc `organization`. Đặt các luồng
này trong `organization` sẽ thành vòng phụ thuộc; không có module nào hiện sở hữu "việc xảy ra với một người theo thời gian".

## Quyết định

1. Một module nghiệp vụ mới `personnel` (C2, phần vòng đời) sở hữu `department_transfers`, `department_transfer_changes` và các bảng hồ sơ
   nhân sự của hạng mục sau (nghỉ dài, nghỉ việc). Đây là bounded context mới vì có bảng, contract và nghiệp vụ riêng
   ([module structure](../rules/module-structure.md)).
2. **Hướng phụ thuộc:** `personnel → organization (facade), identity-access (facade), catalog (facade), audit`; hạng mục sau thêm
   `licensing`, `requests`, `operating-parameters`. **Không module nào import `personnel`** ngoài composition root; module khác
   không bao giờ biết có điều chuyển, chỉ nghe sự kiện thay đổi tổ chức (`OrganizationService.registerChangeListener`).
3. **Bảng lịch sử vẫn của `organization`.** `employee_placements` và `department_head_periods` do `organization` ghi, qua facade thứ hai
   `OrganizationHistoryService` (`scheduleStructureChange`, `cancelStructureChange`, `scheduleHeadHandover`,
   `shiftScheduledHeadHandover`, `undoScheduledHeadHandover`, `setEmployeeWorkState`, `announceDueChanges`); `personnel` không đọc hay
   ghi bảng này. Facade thứ hai vì `OrganizationService` đã chạm trần 400 dòng của gate.
4. **Giai đoạn ghi trước.** Lúc ghi điều chuyển, dòng đang mở đóng ở `valid_to = effectiveOn` và dòng mới mở từ `valid_from =
effectiveOn`; mọi truy vấn theo ngày đã đọc `valid_from <= ngày < valid_to` nên đúng từ 00:00 ngày hiệu lực. Chỉ dòng chưa hiệu lực
   (chưa được thông báo) đổi hay xóa được; trigger giữ phần đã bắt đầu.
5. **Sự kiện thay đổi tổ chức** do `organization` phát: trong transaction của lệnh khi ngày là hôm nay, hoặc bởi
   `OrganizationChangeSweeper` mỗi giờ trong đồ thị API khi đến ngày; bảng `organization_change_announcements` (duy nhất
   `(kind, subject_id)`) làm cho mỗi thay đổi được báo đúng một lần và cấp `id` cho listener.
6. `personnel` chỉ do đồ thị API nạp (listener chuyển trạng thái điều chuyển sang `EFFECTIVE` khi dòng giai đoạn bắt đầu). Export duy nhất
   là `PersonnelFileHooks`, nơi các luồng đi theo hồ sơ (chỉ định người chịu trách nhiệm tài khoản dịch vụ) đăng ký.

## Hệ quả

- `PRISMA_MODEL_OWNER` thêm `OrganizationChangeAnnouncement` (organization), `DepartmentTransfer`, `DepartmentTransferChange` (personnel);
  `PUBLIC_CONTRACT_EXPORTS` thêm `OrganizationHistoryService`, `PersonnelFileHooks`.
- Điều kiện của Nest submodule riêng (HTTP tách khỏi module) chưa có: chỉ API nạp `personnel`, nên controller nằm trong `PersonnelModule`.
- Hạng mục sau (`g6-transfer-tool-review`, `g6-offboarding-record`, `g6-leaver-request-closure`, `g6-service-account-handover`) thêm vào
  module này và dùng lại `grounds/grounds.policy.ts`, `personnel-self-action.policy.ts`, `PersonnelFileHooks`.
