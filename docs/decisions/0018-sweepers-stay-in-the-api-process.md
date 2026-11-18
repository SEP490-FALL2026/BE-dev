# ADR-0018: Các sweeper theo giờ vẫn chạy trong tiến trình API

## Trạng thái

**Proposed** — 28/10/2026, ghi bởi `g0-g6-final-business-baseline-remediation` (finding F53, quyết định `P03-D12` = A, mặc định khuyến
nghị). Proposed chưa phải Accepted: chưa có sự kiện Owner review.

## Bối cảnh

Các sweeper chạy mỗi giờ để báo thay đổi tổ chức đã đến ngày, nhắc quá hạn, kết thúc quyền có ngày kết thúc và đóng năm tài chính
đã kết thúc. Chúng được đăng ký trong module HTTP của từng capability (`organization`, `personnel`, `licensing`, `catalog`, `budgets`)
và vì vậy chạy trong **mỗi instance API**. Worker chỉ chạy gửi mail từ outbox và `RequestWorkLoop`. F53 hỏi có nên gom sweeper vào
worker không.

## Quyết định

1. **Giữ sweeper trong tiến trình API** (P03-D12 = A). Không chuyển sang worker trong gói này.
2. Mỗi sweeper phải **idempotent và an toàn khi nhiều instance cùng chạy**: kết quả được bảo đảm bởi dấu dòng ở cơ sở dữ liệu
   (khóa duy nhất của `organization_change_announcements`, đánh dấu nhắc một lần cho mỗi đối tượng và ngày, trạng thái đã đóng của đề
   xuất/phiên bản), không bởi việc chỉ có một tiến trình chạy. Sweeper đóng năm (`BudgetYearEndSweeper`) lấy khóa dòng đề xuất, khóa
   dòng phiên bản rồi khóa năm `budget-year:<cost_center_id>:<năm>` theo đúng thứ tự mà mọi người ghi ngân sách dùng; chạy hai lần
   không tạo thêm bản ghi (kiểm bằng test). Sweeper khoản cam kết 01/01 (`YearStartCommitmentsSweeper`) dùng dấu chạy `year_start_commitment_runs` và
   khóa duy nhất (Request, năm) của khoản; nó khóa hàng Request trước, rồi khóa năm của Cost Center — cùng thứ tự với mọi ghi ngân sách.
3. Sweeper không phát sinh ghi mà không có sự kiện nguồn: mỗi lần chạy chỉ ghi khi có dòng đến hạn, trong một giao dịch cho từng
   Cost Center và năm.

## Hệ quả

- Tài liệu (`AGENTS.md`, `ARCHITECTURE.md`) mô tả đúng: sweeper ở đồ thị API, worker chỉ có outbox mail và `RequestWorkLoop`.
- Nếu Owner chọn đưa sweeper sang worker (phương án B của F53), cần task riêng: đổi đồ thị worker, bài test đồ thị module
  (`module-graph.spec.ts`) và runbook triển khai; không có thay đổi dữ liệu.
- Nhiều instance API cùng đóng một năm là hợp lệ: instance thứ hai thấy việc đã xong (đề xuất/phiên bản đã đóng) và không làm gì.
