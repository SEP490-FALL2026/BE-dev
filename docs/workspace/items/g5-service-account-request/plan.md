# Plan: yêu cầu tài khoản dịch vụ sau khởi tạo

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (23/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào (`RequestAssessmentService.assess`, `grant.policy.ts`, `ProvisioningService.grant`, `AssignmentService.createFromRequest`). Các hạng mục ở _Dependencies and blockers_ đã `verified` local. Hai migration giữ tên của spec (`20261024060000`, `20261024060100`, sau migration cuối `20261024030100`): đặt lại theo thứ tự thật khi merge. Ba tệp mới được import chéo capability đã đăng ký vào `INTRA_MODULE_CONTRACTS` cùng thay đổi (`access-request-query.service.ts`, `access-request.wire.ts`, `provisioning-task-frame.service.ts`); không thêm mục ledger nào.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`
- Depends on: các hạng mục ở _Dependencies and blockers_ của spec
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test; quyết định của người phụ trách được gắn nhãn chưa phải của Owner
- Verify: `pnpm rules:check` và `pnpm rules:format` → xanh

### Task 2: dữ liệu

- Files: migration `20261024060000_requests_service_account_values`, `20261024060100_requests_service_account_requests`, `prisma/models/requests.prisma`, `prisma/models/organization.prisma` (hai quan hệ ngược của `Employee`), `src/architecture-boundaries.spec.ts` (chủ sở hữu bảng mới; không có danh sách INV-05 để thêm)
- Depends on: Task 1
- Acceptance: enum và bảng `access_request_service_accounts` đúng spec; `CHECK` đồng bộ trạng thái phán quyết; phán quyết đã ghi không sửa, không xóa; Request `SERVICE_ACCOUNT` có đúng một dòng chi tiết lúc commit và loại khác không có; giá trị enum thêm bằng migration riêng (không dùng được trong giao dịch thêm nó)
- Verify: nhóm _what the database refuses_ của hạng mục xanh trên PostgreSQL riêng; `prisma migrate deploy` rồi `migrate diff --exit-code` = 0

### Task 3: quy tắc thuần

- Files: `service-account-request/service-account-request.policy.ts` (+ spec), `access-request/grant.policy.ts` (+ `grant.policy.spec.ts`), `licensing/provisioning/provisioning.policy.ts` (`chooseServiceIdentifier`, + spec)
- Depends on: Task 1
- Acceptance: điều kiện gửi theo kiểu cấp K1/K2/K5 và khởi tạo đã đóng; phán quyết ranh giới (từ chối cần lý do); `grantAnswerFor` trả `BOUNDARY_NOT_CHECKED`, `GRANTABLE` mang `seat = SERVICE` và chi tiết; định danh bắt buộc không rỗng, không áp luật địa chỉ thư công ty
- Verify: unit của ba policy xanh (mọi ca ở dòng _Quy tắc thuần_ của ma trận)

### Task 4: cấp tài khoản dịch vụ phía licensing

- Files: `licensing.types.ts`, `provisioning.service.ts`, `provisioning-holder.service.ts` (mới), `provisioning-task-frame.service.ts`, `licensing.module.ts`, `provisioning.dto.ts` (`responsibleEmployeeId`), `assignment.service.ts` (không đụng `assignment.repo.ts`), `licensing.errors.ts`, `provisioning.http-errors.ts`, `licensing.service.ts` (`selfExecutionMode`), `provisioning-tasks.controller.ts` (mô tả lỗi), `test/support/provisioning-harness.ts` (cổng giả trả `seat: 'PERSONAL'`)
- Depends on: Task 2, Task 3
- Acceptance: Assignment dịch vụ đủ lý do, người chịu trách nhiệm, phòng sở hữu, Cost Center `Unit`; thiếu định danh thì không ghi gì và claim quay lại; trùng định danh đồng thời chỉ một thành công; người chịu trách nhiệm đổi phòng được xử lý theo spec; IT Admin tự thực thi theo `QĐ-77m`; cấp Request thường không đổi hành vi
- Verify: nhóm _grant_ của `provisioning-*` (hồi quy) và nhóm cấp dịch vụ xanh

### Task 5: gửi Request dịch vụ và cổng cấp phát

- Files: `service-account-request/service-account-request.service.ts`, `service-account-request.repo.ts`, `service-account-request.errors.ts`, `service-account-request.dto.ts` (thân gửi), `access-request/access-request.types.ts`, `access-request.repo.ts`, `access-request-query.service.ts`, `access-request.dto.ts`, `access-request.wire.ts`, `grant-queue.repo.ts`, `grant-queue.service.ts`, `delegated-request.dto.ts`, `requests.module.ts` (`access-request-grant.gate.ts` không đổi: chi tiết đi theo bản ghi Request)
- Depends on: Task 2, Task 3, Task 4
- Acceptance: gửi theo AC-1 và AC-2 (phòng, Cost Center, nhánh (b), số tiền × 1, bước chi luôn có); thiếu mục đích hay định danh không ghi gì; Request thường và nhóm không đổi; cổng trả đúng câu trả lời cho Request dịch vụ
- Verify: nhóm _submit_ và _grant gate_ của hạng mục xanh; hồi quy `access-request-*`, `spend-*`, `budget-*` xanh

### Task 6: kiểm ranh giới, API

- Files: `service-account-request/service-account-boundary.service.ts`, `service-account-requests.controller.ts`, `service-account-request.http-errors.ts`, `service-account-request.dto.ts` (thân phán quyết), `requests.module.ts`, `test/support/api-coverage-manifest.ts`, `test/e2e/api-inventory.e2e-spec.ts` (211), `openapi.json`, `test/support/service-account-harness.ts` và `test/integration/service-account-request.integration-spec.ts` (mới)
- Depends on: Task 5
- Acceptance: hai thao tác mới và trường thêm vào `POST /provisioning-tasks`, `GET /grant-queue`, Request; từ chối ranh giới giải phóng cam kết và kết thúc `IT_REJECTED`; mọi ca ở ma trận test xanh
- Verify: nhóm _boundary review_ xanh; e2e kiểm kê và OpenAPI xanh (`pnpm openapi:export` không đổi ngoài ý muốn); `pnpm exec jest src` xanh; hồi quy `access-request`, `budget`, `spend`, `provisioning` xanh

### Checkpoint

Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên cây làm việc (`pnpm check`, `pnpm test:e2e`, `pnpm openapi:export`, integration trên PostgreSQL riêng); tự review diff theo spec và từng AC; cập nhật roadmap và spec nếu implementation làm rõ hay đổi contract.

## Verification and handoff

Chạy ngày 24/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                  | Revision / môi trường | Kết quả thực chạy                                                     | Giới hạn / việc còn lại                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `service-account-request.integration-spec.ts` (AC-1→AC-6, gửi, hủy rút, ràng buộc CSDL)                                                                                                                                                                                             | PostgreSQL 17 Docker  | 25 ca xanh                                                            | giá thử bằng VND (1.000.000/tháng) thay cho 4 USD của ca nguồn: cùng công thức giá × kỳ × 1 |
| `service-account-request.policy.spec.ts`, `grant.policy.spec.ts`, `provisioning.policy.spec.ts`                                                                                                                                                                                     | như trên              | xanh (policy dịch vụ 8 ca, `grantAnswerFor` 6 ca, định danh 2 ca mới) | —                                                                                           |
| `pnpm exec jest` (unit, gồm kiến trúc, hợp đồng, OpenAPI)                                                                                                                                                                                                                           | như trên              | 160 suite, 2340 ca xanh                                               | —                                                                                           |
| hồi quy tích hợp: `access-request-*`, `spend-*`, `budget-*`, `provisioning-*`, `license-assignment*`, `assignment-writes`, `unit-only-cost-attribution`, `application-retirement-http`, `seat-guards`, `seat-baseline*`, `department-tools`, `licensing-*`, `employee-import-seats` | như trên              | 56 suite, 984 ca xanh (gồm 25 ca của hạng mục)                        | tích hợp toàn bộ chạy ở mốc cuối của G5                                                     |
| `pnpm openapi:export` rồi e2e `api-inventory`                                                                                                                                                                                                                                       | như trên              | 22 ca xanh, 211 thao tác; `openapi-export` và e2e `provisioning` xanh | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5                                               |
| drift: `prisma migrate deploy` trên CSDL rỗng rồi `migrate diff --exit-code`                                                                                                                                                                                                        | như trên              | exit 0                                                                | —                                                                                           |
| `tsc --noEmit`, `pnpm lint`, `prettier --check`                                                                                                                                                                                                                                     | như trên              | sạch                                                                  | —                                                                                           |
| `pnpm rules:check`, `pnpm rules:format`                                                                                                                                                                                                                                             | như trên              | xem Changes and acceptance của spec                                   | —                                                                                           |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`ARCHITECTURE.md`, `AGENTS.md`); phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
