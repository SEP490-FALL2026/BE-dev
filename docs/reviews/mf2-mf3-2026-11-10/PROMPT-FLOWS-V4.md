# Prompt cho chat Sonnet — sửa `pnpm test:flows` trên seed v4

Dán nguyên phần dưới vào chat mới (mở tại thư mục `D:\FPT\FALL2026\Code\BE-dev-software-license-management`).

---

Bạn là dev backend làm việc trong repo SaaS-Sentry BE (NestJS + Prisma + PostgreSQL). Trả lời bằng tiếng Việt, giữ định danh tiếng Anh.

## Mục tiêu

`pnpm test:flows` (suite E2E 5 main flow qua HTTP thật, `test/flows/*.flow-spec.ts`, runner `scripts/verify/run-flows.mjs`,
config `test/config/jest.flows.cjs`) đang **đỏ 33/69** kịch bản trên dữ liệu demo **shared-demo-v4**: các kịch bản viết cho
người/phòng/thuê bao của seed v3 (ghi ở `docs/reviews/mf1-mf4-reaudit-2026-11-09/handoff/DEPLOY-READY.md` mục "Test flows"). CI
không chạy bộ này. Việc của bạn: (1) làm suite xanh trên v4 cho phần luật **hiện hành**; (2) đưa suite vào CI ở mức hợp lý.

## Bắt đầu

1. Đọc `AGENTS.md`, `test/README.md` (mục _Main flows_), `test/support/flows/` (harness: `FlowClock`, `clock.sweep`, đăng nhập theo mã
   người), `src/cli/seed/fixture/shared-demo-v4/README.md` (bảng người, phòng, thuê bao, Request mẫu của v4), spec cũ
   `docs/workspace/items/e2e-main-flows-suite/spec.md`.
2. Tạo worktree riêng để không đụng cây đang làm MF-2/MF-3:
   `git fetch origin && git worktree add ../be-flows -b fix/flows-v4 origin/dev`, copy `.env` sang worktree, `pnpm install`.
   Làm mọi thứ trong `../be-flows`.
3. Cần Docker/PostgreSQL và `TEST_DATABASE_ADMIN_URL` như integration (xem `test/README.md`). Chạy `pnpm test:flows` một lần, lưu
   danh sách kịch bản đỏ + thông điệp lỗi đầu tiên của mỗi cái vào `FLOWS-V4-REPORT.md` (gốc worktree) **trước khi sửa**.

## Cách sửa (theo từng file, chạy lại đúng file đó: `pnpm test:flows -- test/flows/<file>`)

Phân loại mỗi kịch bản đỏ vào đúng một nhóm rồi xử lý:

| Nhóm                              | Dấu hiệu                                                                                                                                                                                                                      | Xử lý                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Dữ liệu v3                     | mã người/phòng/thuê bao/gói không còn trong v4, số đếm/tiền theo dữ liệu cũ                                                                                                                                                   | Đổi sang người/phòng/thuê bao tương đương **của v4** (bảng README fixture). Không sửa fixture seed để chiều test                                                                                                                                                                                 |
| B. Luật cũ của MF-1/MF-4/MF-5/kho | test mong hành vi đã bị thay bởi QĐ-103→109 (vd thời hạn quyền, kiểm ngân sách ba kết quả, Request một bước, GH-1/2/3, kho dùng chung, BM-10 B1–B7, ghost seat 8 cổng)                                                        | Sửa test theo luật hiện hành. Nguồn: `docs/reviews/mf1-mf4-reaudit-2026-11-09/SPEC.md` (§4, §4b thắng), code hiện tại trên `origin/dev`. Nếu nghi code sai chứ không phải test sai ⟹ **không sửa code**, ghi vào báo cáo mục "Nghi lỗi BE" kèm bằng chứng                                        |
| C. Luật cũ của MF-2/MF-3          | `mf2-*.flow-spec.ts`, `mf3-transfer.flow-spec.ts` mong hành vi sắp được viết lại (rà soát của trưởng phòng mới `transferReview*`, IT bấm đóng hồ sơ/điều chuyển, xác nhận bàn giao dữ liệu `handover-duties`, Business Owner) | **Không** viết lại theo luật mới (đợt MF-2/MF-3 đang làm ở nhánh khác — `docs/reviews/mf2-mf3-2026-11-10/SPEC.md`). Phần dữ liệu thì sửa như nhóm A; kịch bản kiểm luật cũ thì `it.skip` kèm comment `// MF-2/MF-3 round rewrites this — SPEC mf2-mf3-2026-11-10 <gói>` và liệt kê trong báo cáo |
| D. Harness/hạ tầng                | lỗi setup, đồng hồ, sweeper, timeout, thứ tự file                                                                                                                                                                             | Sửa harness tối thiểu; ghi nguyên nhân gốc                                                                                                                                                                                                                                                       |

Luật cứng:

- **Không** nới assert để qua (không đổi `toBe` thành `toBeDefined`, không chấp nhận nhiều mã HTTP `[403, 404, 409]` khi luật nói một mã,
  không xóa kịch bản). Không sửa code `src/` trừ khi đó là lỗi harness thuần (và ghi rõ).
- Mỗi kịch bản sau khi sửa vẫn phải kiểm đúng điều tên của nó nói. Đổi tên `describe/it` nếu nội dung đổi.
- Không đụng `src/cli/seed/fixture/**`, migrations, `openapi.json`.

## Đưa vào CI

Sau khi suite xanh (trừ các `it.skip` nhóm C):

1. Đo thời gian chạy đủ suite local (ghi vào báo cáo).
2. Thêm suite vào `.github/workflows/nightly.yml` (đang chạy integration + e2e smoke theo lịch) như một job mới `flows`, cùng cách dựng
   PostgreSQL/biến môi trường như job integration; thêm `workflow_dispatch` nếu chưa có để chạy tay. **Không** thêm vào `ci.yml` cho mỗi
   PR trừ khi suite < 8 phút — khi đó đề xuất trong báo cáo, không tự thêm.
3. Cập nhật `test/README.md` (bỏ câu "không CI", ghi chạy ở nightly) và comment đầu `test/config/jest.flows.cjs`.

## Kiểm trước khi bàn giao

- `pnpm test:flows` — xanh, chỉ còn các `it.skip` nhóm C (ghi số).
- Quick check: `pnpm typecheck && pnpm lint && pnpm rules:check && pnpm rules:format && pnpm test:gates`.
- **Không** chạy `pnpm check` hay full integration/e2e (CI GitHub lo).
- Commit trên `fix/flows-v4` (message tiếng Việt kiểu repo, vd `test(flows): …`), **không push, không mở PR** — Owner tự làm.

## Báo cáo `FLOWS-V4-REPORT.md` (gốc worktree) và message cuối

- Trước/sau: số kịch bản xanh/đỏ/skip, thời gian chạy.
- Bảng từng kịch bản đã sửa: file · tên · nhóm A/B/C/D · đổi gì.
- Danh sách `it.skip` nhóm C (để đợt MF-2/MF-3 viết lại).
- Mục "Nghi lỗi BE" (nếu có): kịch bản, mong đợi theo luật nào, thực tế, `file:line` nghi ngờ.
- Thay đổi CI và lệnh đã chạy + kết quả thật. Commit hash.
