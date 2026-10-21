# Plan: bảo vệ seat trên thuê bao: không giảm dưới số đang chiếm, nháp không cấp được, khuyến nghị K2

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, 21/10/2026; cây làm việc chưa commit trên `5f3b2b3`, nhánh `Bao_dev_be`). PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, ADR-0013 (mục 4, đăng ký chặn), `US-04-02` AC-9, `US-04-03` AC-5, AC-6, `subscription.service.ts` (khóa thuê bao và sửa), `catalog.types.ts` (`SeatTarget`), `AssignmentRepo` (đếm chiếm chỗ), `g4-provisioning-queue-manual` (Assignment `Thất bại`, nguồn Request). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: chính sách thuần — xong

- Files: `src/modules/catalog/subscription/seat-guard.policy.ts`, `seat-guard.policy.spec.ts`, `subscription.errors.ts`.
- Depends on: —
- Acceptance: `assertQuantityNotBelowOccupied` (giảm xuống dưới số chiếm bị từ chối, bằng và tăng được, lần đặt đầu của `null` được), `recommendK2` (từ 3 người, ngưỡng cố định).
- Verify: `pnpm exec jest src/modules/catalog/subscription` đỏ trước, xanh sau.

### Task 2: đăng ký chặn và người đọc của `licensing` — xong

- Files: `catalog.types.ts` (`SeatOccupancyReader`, `SeatTarget.status`, `SeatTarget.missing`), `subscription/seat-occupancy.registry.ts`, `catalog.service.ts` (`registerSeatOccupancy`), `catalog.module.ts`, `licensing/assignment/assignment.repo.ts` (đếm), `licensing/assignment/seat-occupancy.reader.ts` (tự đăng ký ở `OnModuleInit`; `licensing.module.ts` chỉ cung cấp lớp này), `seat-target.service.ts` (trạng thái và dữ liệu thiếu), `src/architecture-structure.spec.ts`/`module-graph.spec.ts` nếu gate yêu cầu.
- Depends on: Task 1.
- Acceptance: `licensing` đăng ký lúc khởi tạo; không đăng ký thì lỗi cấu hình; đếm Assignment chưa kết thúc, chưa `Thất bại`, người dùng khác nhau trên các gói.
- Verify: unit của registry; integration `seat-guards-http`.
- Thực tế: người đọc đăng ký ở `seat-occupancy.reader.ts`, không ở `licensing.module.ts`.

### Task 3: bảo vệ số seat, thuê bao nháp, khuyến nghị — xong

- Files: `subscription.service.ts` (bảo vệ trong `update`), `subscription.http-errors.ts`, `licensing/assignment/baseline-target.policy.ts` + `provisioning.service.ts` (từ chối nháp), `licensing/mappers/licensing.http-errors.ts`, `catalog-entry/application.service.ts` + DTO + controller (`recommendations`), `test/support/seat-baseline-harness.ts` (thuê bao đủ dữ liệu, `draftSubscription`), `test/integration/seat-guards-http.integration-spec.ts`, `test/e2e` nếu hợp đồng đổi.
- Depends on: Task 2.
- Acceptance: mọi AC trong ma trận; fixture cũ chuyển sang thuê bao đủ dữ liệu mà không đổi kỳ vọng nghiệp vụ của chúng.
- Thay đổi thực tế ở lượt 21/10/2026: thêm test tất định `a cut of the seats waits for a grant that is being made, and then counts it`; mã lỗi vào mô tả OpenAPI; vế xác nhận baseline của AC-6 được chứng minh qua ứng dụng đã ngừng vì thuê bao `ACTIVE` không về `DRAFT` được (CHECK `subscriptions_active_complete`).
- Verify: integration `seat-guards-http` cùng các suite seat cũ; đột biến (bỏ so sánh, đếm cả Assignment kết thúc, đếm cả `Thất bại`, bỏ khóa thuê bao, bỏ kiểm nháp ở import hoặc ở cấp, ngưỡng 2, đếm Assignment thay vì người) làm đỏ.

### Task 4: tài liệu và gate cuối — xong

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `ADR-0013` (đăng ký chặn đã có người đọc đầu tiên), `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này.
- Depends on: Task 3.
- Acceptance: tài liệu khớp mã; `openapi.json` chỉ thêm `recommendations` và hai mã lỗi mới; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                | Revision / môi trường                                                                                       | Kết quả thực chạy                                  | Giới hạn / việc còn lại                                                             |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm check`                                                                                      | 21/10/2026, cây làm việc chưa commit trên `5f3b2b3` (nhánh `Bao_dev_be`); Windows, Node 24.0.2, pnpm 11.1.3 | exit 0; unit và kiểm cấu trúc 138 suite, 2006 test | Không có remote CI; chưa chạy trên môi trường dùng chung                            |
| `pnpm test:e2e`                                                                                   | như trên                                                                                                    | 32 suite, 811 test xanh                            | Không cần DB; `api-inventory` đếm 143 operation                                     |
| `pnpm test:integration`                                                                           | như trên; PostgreSQL 17 trong Docker `127.0.0.1:55432`                                                      | 97 suite, 1307 test xanh                           | Chạy trên một DB cô lập, không phải môi trường dùng chung                           |
| Test mới `a cut of the seats waits for a grant that is being made, and then counts it` chạy riêng | như trên                                                                                                    | xanh khi chạy riêng (21/10/2026)                   | Giữ khóa thuê bao và một Assignment chưa commit                                     |
| Đột biến: bỏ `FOR UPDATE` khỏi khóa thuê bao của repo                                             | như trên                                                                                                    | test trên đỏ, rồi khôi phục mã và xanh lại         | AC-6 vế xác nhận baseline chứng minh qua ứng dụng đã ngừng, không qua thuê bao nháp |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ (giới hạn ở spec, mục Changes and acceptance).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
