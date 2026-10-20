# Plan: bảo vệ seat trên thuê bao: không giảm dưới số đang chiếm, nháp không cấp được, khuyến nghị K2

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `in-progress`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, ADR-0013 (mục 4, đăng ký chặn), `US-04-02` AC-9, `US-04-03` AC-5, AC-6, `subscription.service.ts` (khóa thuê bao và sửa), `catalog.types.ts` (`SeatTarget`), `AssignmentRepo` (đếm chiếm chỗ), `g4-provisioning-queue-manual` (Assignment `Thất bại`, nguồn Request). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: chính sách thuần

- Files: `src/modules/catalog/subscription/seat-guard.policy.ts`, `seat-guard.policy.spec.ts`, `subscription.errors.ts`.
- Depends on: —
- Acceptance: `assertQuantityNotBelowOccupied` (giảm xuống dưới số chiếm bị từ chối, bằng và tăng được, lần đặt đầu của `null` được), `recommendK2` (từ 3 người, ngưỡng cố định).
- Verify: `pnpm exec jest src/modules/catalog/subscription` đỏ trước, xanh sau.

### Task 2: đăng ký chặn và người đọc của `licensing`

- Files: `catalog.types.ts` (`SeatOccupancyReader`, `SeatTarget.status`, `SeatTarget.missing`), `subscription/seat-occupancy.registry.ts`, `catalog.service.ts` (`registerSeatOccupancy`), `catalog.module.ts`, `licensing/assignment/assignment.repo.ts` (đếm), `licensing/assignment/seat-occupancy.reader.ts`, `licensing/licensing.module.ts` (`OnModuleInit`), `seat-target.service.ts` (trạng thái và dữ liệu thiếu), `src/architecture-structure.spec.ts`/`module-graph.spec.ts` nếu gate yêu cầu.
- Depends on: Task 1.
- Acceptance: `licensing` đăng ký lúc khởi tạo; không đăng ký thì lỗi cấu hình; đếm Assignment chưa kết thúc, chưa `Thất bại`, người dùng khác nhau trên các gói.
- Verify: unit của registry; integration `seat-guards-http`.

### Task 3: bảo vệ số seat, thuê bao nháp, khuyến nghị

- Files: `subscription.service.ts` (bảo vệ trong `update`), `subscription.http-errors.ts`, `licensing/assignment/baseline-target.policy.ts` + `provisioning.service.ts` (từ chối nháp), `licensing/mappers/licensing.http-errors.ts`, `catalog-entry/application.service.ts` + DTO + controller (`recommendations`), `test/support/seat-baseline-harness.ts` (thuê bao đủ dữ liệu, `draftSubscription`), `test/integration/seat-guards-http.integration-spec.ts`, `test/e2e` nếu hợp đồng đổi.
- Depends on: Task 2.
- Acceptance: mọi AC trong ma trận; fixture cũ chuyển sang thuê bao đủ dữ liệu mà không đổi kỳ vọng nghiệp vụ của chúng.
- Verify: integration `seat-guards-http` cùng các suite seat cũ; đột biến (bỏ so sánh, đếm cả Assignment kết thúc, đếm cả `Thất bại`, bỏ khóa thuê bao, bỏ kiểm nháp ở import hoặc ở cấp, ngưỡng 2, đếm Assignment thay vì người) làm đỏ.

### Task 4: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `ADR-0013` (đăng ký chặn đã có người đọc đầu tiên), `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này.
- Depends on: Task 3.
- Acceptance: tài liệu khớp mã; `openapi.json` chỉ thêm `recommendations` và hai mã lỗi mới; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | đang triển khai         |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối.
- [ ] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
