# Plan: yêu cầu theo nhóm của Employee và của trưởng phòng

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (23/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Thiết kế đã `ready` (24/10/2026); năm bước dưới đây đã làm xong trong cùng ngày (xem _Trạng thái task_ ở mục Tasks và _As built and deviations_ ở spec). Đây là hạng mục xâm lấn nhất của G5 (nó đổi giả định _một Request một người_ ở khoảng 30 nơi, bảng ở spec), nên làm theo **năm bước nhỏ, mỗi bước có checkpoint** và mỗi bước để hệ thống build và test được:

1. Mở đường: dữ liệu, quy tắc thuần, refactor giữ hành vi, cổng nhận `employeeId` tùy chọn. Không có Request nhóm nào được tạo; mọi test hiện có của Request `GRANT` giữ nguyên.
2. Gửi nhóm (và danh sách chọn người, kiểm dòng).
3. Quyết nhu cầu theo dòng và chuyển Request vào chi.
4. Duyệt chi theo dòng, ảnh chụp trên tập dòng được duyệt, khoản cam kết chia theo dòng.
5. Cấp, thất bại, rút theo dòng; hồ sơ bổ sung bỏ người; hoàn thiện API.

Ranh giới hai phase của `## Size exception`: _Phase 1 (mô hình dòng và gửi)_ là bước 1 và 2; _Phase 2 (định tuyến và quyết theo từng người)_ là bước 3, 4 và 5. Nguyên tắc chung: không đổi hành vi của Request `GRANT`; không sửa test hiện có để cho xanh (một test hiện có đỏ là dấu hiệu bước vừa làm sai); mọi tệp dùng chung giữa capability đăng ký vào `INTRA_MODULE_CONTRACTS` cùng thay đổi và không tệp nào vượt 400 dòng (tách service theo ca dùng khi gần ngưỡng). Trước khi bắt đầu: xác nhận các hạng mục ở _Dependencies and blockers_ đã `verified`, chạy lại `grep` ở phần _Điểm giả định_ của spec trên cây hiện tại (số dòng có thể đã trôi) và cập nhật roadmap khi nhận việc. Tên migration trong spec là tên tạm.

## Tasks

**Trạng thái task (24/10/2026):** Task 1 → 15 và Checkpoint 1 → 5 đã làm trên cây làm việc chưa commit; gate cuối ở _Verification and handoff_. Khác thiết kế: tên migration thật là `20261024130000`/`130100`/`130200`; phiếu duyệt chi và hàng đợi không có mảng `lines` lồng (đọc từng người ở `GET /access-requests/{id}/lines`) vì sổ mảng lồng của `API-LIST-DETAIL` đã đóng; bước nhu cầu hết người thì đóng; ba test hiện có phải sửa (xem spec). Phần chưa làm ghi ở cuối spec _As built and deviations_.

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`
- Depends on: các hạng mục ở _Dependencies and blockers_ của spec
- Acceptance: spec đủ dữ liệu, API, bảng điểm giả định, quyết định và ma trận test; quyết định của người phụ trách được gắn nhãn chưa phải của Owner
- Verify: `pnpm rules:check` và `pnpm rules:format` → xanh

### Task 2: dữ liệu (bước 1)

- Files: migration `20261024130000_requests_group_values`, `20261024130100_requests_group_lines`, `prisma/models/requests.prisma`, `prisma/models/organization.prisma`, `src/architecture-boundaries.spec.ts` (chủ sở hữu ba bảng mới, danh sách INV-05)
- Depends on: Task 1
- Acceptance: enum `GROUP_GRANT`, `AccessRequestLineState`, `LineDecisionStage`; ba bảng `access_request_lines`, `access_request_line_decisions`, `access_request_line_amounts` đúng spec; dòng chỉ có cho Request `GROUP_GRANT`; máy trạng thái dòng, trạng thái cuối không đổi; quyết định và `line_amounts` không sửa, không xóa (chỉ `released_at` đặt một lần); `CHECK` của `access_requests` cho `GROUP_GRANT`; giá trị enum thêm bằng migration riêng; `access_request_beneficiaries` không đổi cột
- Verify: nhóm _what the database refuses_ của hạng mục xanh trên PostgreSQL riêng; `prisma migrate deploy` rồi `migrate diff --exit-code` = 0; test hiện có của `access_requests` xanh

### Task 3: quy tắc thuần (bước 1)

- Files: `group-request/group-request.policy.ts`, `group-request/group-line-decision.policy.ts`, `group-request/line-allocation.policy.ts`, `group-request/group-resolution.policy.ts`, `access-request/grant.policy.ts` (câu trả lời theo dòng), `access-request/need-decision.policy.ts` (`deciderRoleOf` cho hàng 5 và 9) và spec của từng tệp
- Depends on: Task 1
- Acceptance: kiểm gói theo kiểu cấp, giới hạn dòng, gom mọi lý do từng dòng; ai quyết dòng nào và thiếu hay thừa dòng; chia khoản cam kết theo dòng (tổng đúng, phần dư theo thứ tự, không dòng nào âm); chia lịch thanh toán theo số dòng (phép nguyên, từ chối khi không chia hết); kết cục Request từ mọi tổ hợp trạng thái dòng; `grantAnswerFor` cho Request nhóm
- Verify: unit của các policy xanh (mọi ca ở dòng _Quy tắc thuần_ của ma trận); `policy-ownership.spec.ts` xanh

### Task 4: refactor giữ hành vi (bước 1)

- Files: `access-request/access-request.repo.ts`, `access-request.types.ts` (`needSteps`, `type`), `access-request.policy.ts` (`canViewRequest` nhận danh sách người giữ bước) và các nơi gọi (`access-request-query.service.ts`, `need-decision.service.ts`, `withdrawal.service.ts`, `similar-seats.service.ts`, `assessment.service.ts`, `spend/supplement.service.ts`, `spend/budget-information.service.ts`), `access-request.dto.ts` và `access-request.wire.ts` (`beneficiary` nullable, `lineCount`), `spend/spend-routing.service.ts` và `spend/spend-step.repo.ts` (`flagSamePerson` theo người), `access-request/delegated-request.policy.ts` (tách quy tắc người thụ hưởng ra `beneficiary-eligibility.policy.ts`), `access-request/need-spend.service.ts` (tách `applySpend` khỏi `need-decision.service.ts`)
- Depends on: Task 2, Task 3
- Acceptance: không thay đổi quan sát được với Request `GRANT`: mọi test hiện có xanh không sửa; Request thường vẫn luôn có `beneficiary`; `needSteps` có một phần tử; `checkDelegation` trả cùng kết quả; các tệp tách ra mỗi tệp một hợp đồng injectable
- Verify: toàn bộ `access-request-*`, `delegated-*`, `spend-*`, `budget-*` xanh không đổi test; `pnpm exec jest src` xanh (gate kiến trúc, hợp đồng, OpenAPI)

### Task 5: cổng cấp phát và licensing nhận `employeeId` tùy chọn (bước 1)

- Files: `licensing.types.ts` (`GrantRequestGate`, `GrantRequestAnswer`, `GrantCancellation`), `licensing.service.ts`, `provisioning/provisioning.service.ts`, `provisioning/provisioning-decision.service.ts`, `provisioning/provisioning-cancellation.service.ts`, `provisioning/provisioning-task.repo.ts` (`lockGrantOfRequest`), `provisioning/provisioning.dto.ts` (`beneficiaryEmployeeId` tùy chọn), `provisioning/registered-grant-request-gate.service.ts`, `provisioning/refusing-grant-request-gate.service.ts`, `access-request/access-request-grant.gate.ts`
- Depends on: Task 4
- Acceptance: cổng và facade nhận `employeeId` tùy chọn và Request `GRANT` bỏ qua nó (cấp, hoàn tất, đóng thất bại, hủy, rút giống hệt); tác vụ truyền người của mình cho cổng; chưa có đường nào cho Request nhóm
- Verify: `provisioning-*`, `access-request-withdrawal`, `spend-commitment-lifecycle` xanh không đổi test

### Checkpoint 1: sau bước 1

Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên cây làm việc: `pnpm check`, integration trên PostgreSQL riêng, `pnpm test:e2e`, `pnpm openapi:export` (OpenAPI chỉ thêm `beneficiary` nullable và trường tùy chọn của `POST /provisioning-tasks`). Diff của `test/` bằng không cho các suite của Request `GRANT`. Dừng lại nếu bất kỳ suite hiện có đỏ.

### Task 6: gửi nhóm: service (bước 2)

- Files: `group-request/group-request.service.ts`, `group-candidate.service.ts`, `request-line.repo.ts`, `line-decision.repo.ts`, `group-request.errors.ts`, `access-request/access-request.repo.ts` (`addNeedStep`), `access-request/request-assessment.service.ts` (giá theo số dòng), `requests.module.ts`
- Depends on: Checkpoint 1
- Acceptance: kiểm và gửi trong một transaction (Request, dòng, bước A và B, bản ghi phê duyệt của trưởng phòng gửi, quyết định dòng `NEED`, audit); mọi lý do từ chối gom lại; định tuyến đúng dòng 5, 9, 6, 4, 8; trạng thái Request lúc gửi; trưởng phòng gửi không có tên thì vào hàng đợi trình; `check` không ghi gì; danh sách chọn người chỉ họ tên và email
- Verify: nhóm `group-request` (gửi, kiểm, định tuyến) xanh trên PostgreSQL riêng; hồi quy `access-request-*` xanh

### Task 7: gửi nhóm: API và chặn đường một người (bước 2)

- Files: `group-request/group-request.dto.ts`, `group-requests.controller.ts`, `group-request.http-errors.ts`, `group-line-query.service.ts`, `access-request/access-requests.controller.ts` và `access-request.http-errors.ts` (`GROUP_USES_LINES`, `similar-seats` cần `employeeId`), `spend/spend-approvals.controller.ts` (chặn), `requests.module.ts`, `test/support/api-coverage-manifest.ts`, `test/e2e/api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 6
- Acceptance: `groupRequestCheck`, `groupRequestSubmit`, `groupRequestCandidateList`, `accessRequestLineList` (người thụ hưởng khác người gửi chỉ thấy dòng của mình); mọi thao tác một người hiện có từ chối Request nhóm bằng `409 GROUP_USES_LINES`; `US-05-17` AC-1→AC-3, AC-5, AC-7, AC-8, AC-11→AC-16 ở phần gửi và `US-05-03` AC-8, AC-14, `US-05-02` AC-2 xanh
- Verify: `group-request` (HTTP) xanh; e2e kiểm kê và OpenAPI xanh; `pnpm exec jest src` xanh; hồi quy `access-request`, `spend`, `budget` xanh

### Checkpoint 2: sau bước 2 (hết Phase 1 của Size exception)

Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên cây làm việc; suite hiện có không đổi; tự review diff: không code nào của Request `GRANT` đổi hành vi; Request nhóm tạo được và đọc được nhưng chưa quyết được.

### Task 8: quyết nhu cầu theo dòng: service (bước 3)

- Files: `group-request/group-need-decision.service.ts`, `group-resolution.service.ts`, `access-request/repricing.service.ts` (đếm dòng còn trong Request), `access-request/need-decision.service.ts` (chặn Request nhóm), `spend/spend-entry.service.ts` (đọc quyết định của bước đã duyệt), `requests.module.ts`
- Depends on: Checkpoint 2
- Acceptance: một lần quyết cho trọn dòng của một bước; từ chối cần lý do; dòng người vừa có quyền bị chặn duyệt; ghi trạng thái dòng, quyết định dòng, bản ghi phê duyệt, audit; sau khi hết dòng chờ nhu cầu thì tính lại số tiền, vào chi đúng đường (hàng đợi trình hay kiểm ngân sách ngay) hoặc `REJECTED`; dòng của trưởng phòng giữ Request ở `PENDING`
- Verify: nhóm `group-request` (need) xanh trên PostgreSQL riêng; `access-request-need-decision*` xanh không đổi

### Task 9: quyết nhu cầu theo dòng: API (bước 3)

- Files: `group-request/group-request.dto.ts` (thân quyết), `group-requests.controller.ts`, `group-request.http-errors.ts`, `test/support/api-coverage-manifest.ts`, `test/e2e/api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 8
- Acceptance: `accessRequestLineNeedDecide`; `US-05-17` AC-3, AC-4, AC-15, AC-16 và `US-05-04` AC-14 xanh; lỗi `LINES_MISMATCH`, `LINE_HOLDS_ACCESS`, `OWN_REQUEST`, `NOT_THE_ASSIGNEE`, `STEP_NOT_PENDING`, `TERM_CONFIRMATION_REQUIRED` đúng mã
- Verify: `group-request` (HTTP) xanh; e2e kiểm kê và OpenAPI xanh; `pnpm exec jest src` xanh

### Checkpoint 3: sau bước 3

Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh; hồi quy quyết nhu cầu của Request thường không đổi; kiểm bằng tay luồng `H1` gửi, `E1` gửi, dòng của trưởng phòng đến lúc Request vào chi.

### Task 10: duyệt chi theo dòng: service (bước 4)

- Files: `group-request/group-spend-decision.service.ts`, `line-amount.repo.ts`, `spend/budget-check.service.ts` (`compute` và `run` nhận phạm vi dòng), `spend/spend-decision.service.ts` (chặn Request nhóm, dùng chung phần giữ cam kết), `spend/spend-routing.service.ts` (kiểm thử xung đột lợi ích với Request nhóm), `requests.module.ts`
- Depends on: Checkpoint 3
- Acceptance: một bước, một ảnh chụp trên tập dòng được duyệt, một quyết định `spend_decisions`, quyết định từng dòng; `BLOCKED` và `NEEDS_REVIEW` đưa cả Request về như cũ; override đúng năm; một khoản cam kết mỗi năm bằng tổng phần được duyệt; `line_amounts` cộng đúng bằng khoản; tất cả bị từ chối thì `REJECTED` không cam kết; người thay thế giữ bước khi Người duyệt chi có tên trong một dòng
- Verify: nhóm `group-request` (spend) và `spend-*`, `budget-*` xanh; kiểm tra đột biến: đổi chia dư làm test tổng đỏ

### Task 11: duyệt chi theo dòng: API và hiển thị (bước 4)

- Files: `group-request/group-request.dto.ts` (thân quyết chi), `group-requests.controller.ts`, `spend/spend-approval-view.service.ts`, `spend/spend-approval.dto.ts`, `spend/spend-queue.service.ts`, `spend/spend-submission.dto.ts`, `spend/spend-request.repo.ts`, `spend/spend-step.repo.ts`, `spend/spend-batch-decision.service.ts`, `spend/spend-approval.dto.ts` (lý do bỏ qua `GROUP_NEEDS_LINES`), `test/support/api-coverage-manifest.ts`, `test/e2e/api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 10
- Acceptance: `spendApprovalLineDecide`; panel quyết có `lines`; hàng đợi trình và hàng đợi quyết có `beneficiary` nullable và `lineCount`; quyết cả lô bỏ qua Request nhóm; `US-05-17` AC-9, `US-06-01` AC-15, `US-06-08` AC-10, `US-06-14` AC-6 xanh
- Verify: `group-request` (HTTP) xanh; e2e kiểm kê và OpenAPI xanh; `pnpm exec jest src` xanh; hồi quy `spend-*`, `budget-*` xanh

### Checkpoint 4: sau bước 4

Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh; đối chiếu tay một ca nhiều năm (hai khoản cam kết, mỗi khoản bằng tổng các dòng của năm); hồi quy quyết chi của Request thường không đổi.

### Task 12: cấp, thất bại và hủy theo dòng (bước 5)

- Files: `access-request/access-request-grant.gate.ts` (đường dòng), `group-request/group-resolution.service.ts`, `provisioning/provisioning.service.ts` (`beneficiaryEmployeeId` cho Request nhóm), `provisioning/provisioning-cancellation.service.ts`, `provisioning/provisioning-task.repo.ts`, `access-request/grant-queue.repo.ts`, `access-request/grant-queue.service.ts`, `provisioning/provisioning.http-errors.ts`, `requests.module.ts`
- Depends on: Checkpoint 4
- Acceptance: cấp từng dòng `APPROVED`, mỗi dòng một Assignment và một tác vụ; thất bại của một người chỉ ảnh hưởng dòng đó và giải phóng phần của dòng (`GRANT_FAILED` với `amounts`); hai IT Admin cấp hai dòng đồng thời; kết cục Request chốt khi dòng cuối kết thúc (`GROUP_RESOLVED`); hàng đợi cấp một hàng mỗi dòng
- Verify: nhóm `group-request` (grant) và `provisioning-*` xanh; `US-05-17` AC-6, AC-7 xanh

### Task 13: rút theo dòng và rút cả nhóm: service (bước 5)

- Files: `group-request/group-withdrawal.service.ts`, `access-request/withdrawal.service.ts` (giao cho nhóm), `access-request/withdrawal.policy.ts` (dùng lại `headMayWithdraw`), `licensing/provisioning/provisioning-decision.service.ts` (hủy tác vụ lỗi của một người báo cổng theo dòng), `requests.module.ts`
- Depends on: Task 12
- Acceptance: rút theo trạng thái dòng đúng ma trận (trước chi, đã duyệt chưa tác vụ, tác vụ chưa ai làm, đang làm, đã xong, lỗi chờ IT); giải phóng bằng `releaseForRequest` với `amounts` của dòng (`PARTICIPANT_WITHDRAWN`), cả nhóm dùng `REQUEST_WITHDRAWN` với `amounts`; dòng cuối kết thúc thì Request kết thúc, mục lô rời lô, câu hỏi Finance đóng; khóa theo thứ tự tác vụ → Request → dòng
- Verify: nhóm `group-request` (withdrawal) và `access-request-withdrawal` xanh; ca `US-05-17` AC-10 (nối) xanh

### Task 14: migration hồ sơ bổ sung bỏ người (bước 5)

- Files: migration `20261024130200_requests_group_supplement_drops`, `prisma/models/requests.prisma`
- Depends on: Task 13
- Acceptance: bảng `request_supplement_drops`; ràng buộc đổi thành _ngày chi đổi hoặc số tiền đổi_; hồ sơ bổ sung cũ (chỉ đổi ngày) vẫn hợp lệ
- Verify: nhóm _what the database refuses_ của hồ sơ bổ sung xanh; `migrate diff --exit-code` = 0

### Task 15: bỏ người bằng hồ sơ bổ sung, rút dòng API, hoàn thiện (bước 5)

- Files: `group-request/supplement-drop.repo.ts`, `spend/supplement.service.ts`, `spend/spend-submission.dto.ts` (`dropEmployeeIds`), `spend/spend-submission.controller.ts`, `group-request/group-requests.controller.ts` (`accessRequestLineWithdraw`), `group-request.http-errors.ts`, `test/support/api-coverage-manifest.ts`, `test/e2e/api-inventory.e2e-spec.ts`, `openapi.json`, `docs/` (ghi chú vận hành nếu có tài liệu liệt kê trạng thái Request)
- Depends on: Task 14
- Acceptance: bỏ người tính lại số tiền và giữ lịch sử trước và sau; không bỏ dòng cuối; `accessRequestLineWithdraw`; toàn bộ ma trận test xanh; ma trận _Không đổi hành vi_ xanh
- Verify: `group-request` (HTTP) xanh; e2e kiểm kê và OpenAPI xanh; `pnpm exec jest src` xanh; toàn bộ `access-request-*`, `delegated-*`, `spend-*`, `budget-*`, `provisioning-*` xanh không đổi test

### Checkpoint 5: sau bước 5 (hết Phase 2 của Size exception)

Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên cây làm việc (`pnpm check`, `pnpm test:e2e`, `pnpm openapi:export`, integration đầy đủ trên PostgreSQL riêng); tự review diff theo spec và từng AC; xác nhận không tăng legacy ledger kiến trúc; cập nhật roadmap và spec nếu implementation làm rõ hay đổi contract; báo FE các thay đổi wire (`beneficiary` nullable, `lineCount`, bảy thao tác mới, lý do `GROUP_NEEDS_LINES`).

## Verification and handoff

Chạy ngày 24/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                                                         | Revision / môi trường                                   | Kết quả thực chạy                                              | Giới hạn / việc còn lại                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                                                           | cây làm việc                                            | sạch                                                           | —                                                                                                                                                           |
| `pnpm lint`                                                                                                                | như trên                                                | sạch                                                           | —                                                                                                                                                           |
| `pnpm exec jest --runInBand` (unit, gồm kiến trúc, hợp đồng danh sách, OpenAPI)                                            | như trên                                                | 183 suite, 2753 ca xanh                                        | —                                                                                                                                                           |
| `pnpm openapi:export` rồi `pnpm test:e2e`                                                                                  | như trên                                                | 32 suite, 850 ca xanh; kiểm kê 235 thao tác                    | —                                                                                                                                                           |
| `pnpm test:integration` đầy đủ                                                                                             | PostgreSQL 17 Docker                                    | 176 suite, 2534 ca xanh, 1 suite tùy chọn bỏ qua (4 ca bỏ qua) | lần chạy đầu cùng ngày đỏ 1 ca ở `license-key-reveal-quota` (cửa sổ phút của hạn mức rơi qua ranh giới phút; chạy riêng xanh 5/5, lần chạy đầy đủ sau xanh) |
| `group-request-*` (9 suite: constraints, submit, need-decision, spend, grant, withdrawal, supplement, notifications, edge) | như trên                                                | 16 + 17 + 12 + 10 + 7 + 9 + 7 + 3 + 8 ca xanh                  | —                                                                                                                                                           |
| `prisma migrate deploy` + `migrate diff --exit-code`                                                                       | CSDL tạm rỗng trong container test, đã xóa sau khi chạy | không drift                                                    | —                                                                                                                                                           |
| `pnpm rules:check`, `rules:format`, `rules:test`, `format:check`                                                           | như trên                                                | xanh                                                           | —                                                                                                                                                           |
| `pnpm test:scripts`, `pnpm test:discovery`                                                                                 | như trên                                                | 30 ca xanh; mỗi spec thuộc đúng một runner                     | —                                                                                                                                                           |
| `pnpm build`                                                                                                               | như trên                                                | thành công                                                     | —                                                                                                                                                           |

Giới hạn: remote CI chưa chạy; chưa commit; chưa peer review, chưa Owner review. Chưa làm: `removeParticipant` cho `g6-leaver-request-closure`; đọc danh sách chọn người có phân trang ở `organization`; thông báo người giữ bước bị đóng khi dòng cuối bị rút; kiểu cấp K3. Còn 67 CSDL `slm_*` tồn đọng trong container test từ các lần chạy trước (không phải của hạng mục này).

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

## Follow-up 25/10/2026: đóng dòng của người đã nghỉ việc

Việc: `POST /access-requests/{id}/lines/{employeeId}/departure-closure`, trạng thái dòng `CANCELLED`, kết cục `CANCELLED` của Request nhóm, hai migration `20261025010000` và `20261025010100`; mô tả ở [spec](spec.md#follow-up-25102026-đóng-dòng-của-người-đã-nghỉ-việc-g6-leaver-request-closure).

- [x] Task 1: hai migration (giá trị enum riêng, rồi cột `cancel_cause`, `CHECK` và `access_request_lines_guard()` bắt đầu từ bản `20261024130100`) và `prisma/models/requests.prisma`.
- [x] Task 2: policy thuần `group-line-closure.policy.ts` (+ spec), `CANCELLED` ở `group-request.types.ts`, `group-resolution.policy.ts` (thứ tự `COMPLETED` > `FAILED` > `REJECTED` > `CANCELLED` > `WITHDRAWN`), `group-withdrawal.policy.ts`.
- [x] Task 3: `GroupLineClosureService`, `GroupResolutionService.end` cho kết cục `CANCELLED`, `GroupGrantService.release` nhận `REQUEST_CANCELLED`, `RequestLineRepo` ghi `cancel_cause`, `DepartureCancellationService` giao dòng sống duy nhất.
- [x] Task 4: controller, DTO, wire dòng thêm `cancelCause`, `open-request.service.ts` (`cancellable`), luật thông báo `ACCESS_REQUEST.LINE_CANCELLED`, `INTRA_MODULE_CONTRACTS`, `api-coverage-manifest.ts`, kiểm kê e2e 295 → 296, `openapi.json`.
- [x] Task 5: test (policy, luật thông báo, e2e không CSDL, tích hợp), tài liệu (spec/plan của `g5-group-requests` và `g6-leaver-request-closure`, roadmap, `AGENTS.md`, `ARCHITECTURE.md`, `test/README.md`, `docs/rules/security-jobs.md`).

Bằng chứng:

Chạy ngày 25/10/2026 trên cây làm việc chưa commit, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`); không commit, push hay stash. Test viết cùng lúc với mã, không đỏ-trước từng ca.

| Lệnh / kiểm tra                                                                                   | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                                                                                                     | Giới hạn / việc còn lại                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm prisma:validate`                        | xanh                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                |
| `pnpm exec jest --runInBand` (unit)                                                               | 198 suite, 3118 ca xanh (mới: `group-line-closure.policy.spec.ts`; thêm ca ở `group-resolution.policy.spec.ts`, `group-withdrawal.policy.spec.ts`, `request-status.policy.spec.ts`; cổng kiến trúc xanh với hai mục mới ở `INTRA_MODULE_CONTRACTS`)                                                                                                                                                                                   | —                                                                |
| `pnpm openapi:export` (Node 24: `NODE_OPTIONS=--no-experimental-strip-types`) rồi `pnpm test:e2e` | 44 suite, 1115 ca xanh (mới: `group-line-closure.e2e-spec.ts`); kiểm kê 296 thao tác; `openapi.json` xuất lại                                                                                                                                                                                                                                                                                                                         | —                                                                |
| Tích hợp mới: `group-line-closure` (19 ca) và `leaver-request-closure-group` (1 ca, sửa)          | 2 suite, 20 ca xanh                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                |
| Tích hợp hồi quy (vùng đã chạm)                                                                   | 67 suite, 964 ca xanh: `group-request*`, `access-request-withdrawal`, `access-request-constraints`, `leaver-request-closure*`, `group-line-closure`, `offboarding-*`, `spend-*` (cam kết, lô, Finance, quyết định, ràng buộc), `request-status-*`, `in-app-notifications`, `provisioning-*`, `step-reassignment-*`, `return-renewal-constraints`, `renewal-request*`, `service-account-*`, `department-transfer-*`, `handover-duty-*` | không chạy toàn bộ tích hợp: người điều phối chạy một lần ở cuối |
| Drift migration (CSDL tạm → `migrate deploy` → `migrate diff --exit-code` → xóa)                  | không lệch (`No difference detected`); CSDL tạm `slm_drift_linecancel` đã xóa                                                                                                                                                                                                                                                                                                                                                         | —                                                                |
| `pnpm rules:check`, `pnpm rules:format`, `pnpm test:discovery`, `pnpm build`                      | xanh (`rules:check`: 273 file, 0 lỗi; `test:discovery`: 198 unit, 44 e2e, 212 tích hợp; `pnpm build` thoát 0)                                                                                                                                                                                                                                                                                                                         | —                                                                |

Chưa làm: báo người giữ bước nhu cầu vừa được đóng khi dòng cuối bị gỡ (cần mã thông báo mới); remote CI chưa chạy; chưa commit, chưa peer review, chưa Owner review. Trạng thái hạng mục vẫn là `verified` ở local.
