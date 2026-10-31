# Nghiệm thu tái cấu trúc kiến trúc và thiết kế lại test BE (29/10/2026)

> **Owner acceptance — 31/10/2026:** Owner đã accept ADR-0019, trạng thái ADR chuyển Accepted. O7 vẫn pending;
> xem [worksheet đã sửa encoding tiếng Việt](owner-adr0019-o7-2026-10-31.md). Acceptance này thay các ghi chú chờ ADR
> cũ bên dưới, không tự thay kết quả test hoặc walkthrough.

> **Bằng chứng mới — 31/10/2026:** mục O6 (CI xanh trên main) đã có run
> [41191829114](https://github.com/WDP301-FA26-GR8/BE/actions/runs/41191829114), SHA `c14c06a…`, mọi job test xanh.
> [CD 41194738633](https://github.com/WDP301-FA26-GR8/BE/actions/runs/41194738633) cùng SHA thành công; log xác nhận
> reconcile DONE/no findings và release live/ready, sau đó SSH xác nhận API đúng image, restart 0/OOM false.
> Owner giữ integration 40 phút dưới ngoại lệ có theo dõi; job mới 34:11. ADR-0019 và O7 vẫn chờ Owner; A/B trial và
> nightly chưa chạy. Các dòng O6/remote-pending lịch sử bên dưới mô tả thời điểm trước run này.

- Loại: nghiệm thu kỹ thuật của hai hạng mục
  [be-architecture-boundaries-restructure](../../workspace/items/be-architecture-boundaries-restructure/spec.md) và
  [be-test-architecture-redesign](../../workspace/items/be-test-architecture-redesign/spec.md), trên cây làm việc chưa
  commit đặt trên BE `dee61eb`.
- Người thực hiện: AI theo giao việc Owner (29/10/2026). Commit, push, CI trên GitHub và deploy do Owner tự làm; mục 8 ghi
  việc cần chạy và số liệu cần gửi lại.
- Trạng thái (checkpoint 29/10/2026): `local-ready-for-owner-review` / `remote-verification-pending`. Triển khai xong và
  kiểm ở local, gồm lượt sắp lại cấu trúc bên trong capability (plan
  [kiến trúc](../../workspace/items/be-architecture-boundaries-restructure/plan.md#cấu-trúc-bên-trong-capability-29102026));
  CI thật trên GitHub chờ commit của Owner (mục 8). P7, P8 được Owner miễn cho checkpoint này (mục 5) — không phải đã đạt.

## Quyết định Owner (29/10/2026)

| #   | Nội dung                                                                                                                                                                      | Quyết định                                          | Ghi chú                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | S5: capability trong cùng module được import nhau                                                                                                                             | **Chấp nhận**                                       | Giữ ranh giới `public/` và tầng giữa các module. Thư mục con của capability nay theo quy tắc nhóm chức năng (luật `group-*`, mục 2) — quy tắc này sửa trong lượt checkpoint, chưa có sự kiện Owner review                                                                                                                                                                                                                                                                              |
| O2  | S12: `Dockerfile` dòng 18 `COPY scripts/build ./scripts/build` ở stage build                                                                                                  | **Chấp nhận**                                       | Chỉ để `pnpm build` sinh `dist/<tên>-cli.js`; stage chạy và lệnh chạy không đổi                                                                                                                                                                                                                                                                                                                                                                                                        |
| O3  | S13: ba văn bản OpenAPI rút gọn — message `EMPLOYEE.SELF_CHANGE_FORBIDDEN`, message `TRANSFER_REVIEW.DECISION_ALREADY_RECORDED`, summary `accessRequestLineCloseForDeparture` | **Chấp nhận**                                       | Mã lỗi, HTTP status, schema giữ nguyên                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| O4  | DevDependency trực tiếp `jest-environment-node@30.4.1`                                                                                                                        | **Chấp nhận**                                       | Khai ở `devDependencies`; chỉ Jest runner integration, timing, `_serial`, E2E nạp nó (`test/config/timing-environment.cjs`); API, worker, CLI không nạp. Image: stage `runtime` chép `node_modules` từ stage `build` (`pnpm install --frozen-lockfile`, đủ devDependencies), nên gói **có mặt** trong image cuối dù không tiến trình nào dùng; stage `production-dependencies` (`--prod`) có trong `Dockerfile` nhưng không được chép vào image cuối. Lượt này không đổi cách đóng gói |
| O5  | P7 (trung vị integration ≤ 4 s/file), P8 (mọi `beforeAll` khai timeout ≤ 60 s)                                                                                                | **owner-waived / not-required-for-this-checkpoint** | Không phải đã đạt, không còn là blocker; không benchmark hay tối ưu thêm để đạt hai con số này. Test vẫn phải xanh thật; timeout job/test giữ hữu hạn như hiện tại                                                                                                                                                                                                                                                                                                                     |
| O6  | Bằng chứng "xanh trên `main`" của DoD                                                                                                                                         | Đã có CI main xanh — 31/10/2026                     | [CI 41191829114](https://github.com/WDP301-FA26-GR8/BE/actions/runs/41191829114), `c14c06a…`; xem post-deploy checkpoint                                                                                                                                                                                                                                                                                                                                                               |
| O7  | Bước "10 route ngẫu nhiên" của DoD kiến trúc                                                                                                                                  | Việc của Owner khi review                           | `docs/generated/routes.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

ADR-0019: `Proposed, chấp nhận một phần` — chỉ O1, O2; quy tắc nhóm chức năng và chi tiết extension point chưa có sự kiện
Owner review.

## 1. Sai khác so với thiết kế (ADR-0019)

| #   | Sai khác                                                                                                     | Lý do                                                                                                                                        | Đánh giá                                                             |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| S1  | `Hook` là provider Nest (một instance mỗi app) thay vì hằng số cấp module                                    | Hằng số dùng chung giữa nhiều app trong cùng tiến trình test, app thứ hai `bind` sẽ ném lỗi                                                  | Giữ                                                                  |
| S2  | Thêm `whenUnbound` cho `Hook`                                                                                | Thay lớp "Refusing" ẩn bằng giá trị khai tại chỗ khi graph CLI hợp lệ thiếu bên đăng ký                                                      | Giữ; hiện 0 điểm dùng — mọi graph đều bind (test `extension-points`) |
| S3  | Thêm kiểu thứ ba `Contributions<T>`                                                                          | 6 điểm mở trả về giá trị (use readers, blocker/warning của offboarding, notice recorder, personnel file hooks)                               | Giữ                                                                  |
| S4  | `requests` có 23 capability ngang hàng; 13 thư mục use case được nâng thành capability                       | Use case của `requests` dùng chéo nhau; quy tắc "use case riêng tư" sẽ vi phạm nếu giữ lồng                                                  | Giữ; đo lại khi xét tách `spend` (`OD-A5`)                           |
| S5  | Capability trong cùng module được import nhau (bỏ allowlist A4-01/GATE.2 cũ)                                 | Allowlist ~100 file là "ledger" spec muốn bỏ; ranh giới chặn ở cửa `public/` (giữa module) và điểm vào của nhóm chức năng (trong capability) | Owner chấp nhận 29/10/2026 (O1)                                      |
| S6  | `*.module.ts` là cửa hợp lệ ngoài `public/`; spec unit được nhìn vào module khác                             | Nest DI phải import module; spec hộp trắng đã được miễn ở gate cũ                                                                            | Giữ                                                                  |
| S7  | `*.extension-points.ts` được khai nhiều provider `@Injectable`                                               | Mọi điểm mở của một module nằm một chỗ; mỗi class một dòng                                                                                   | Giữ                                                                  |
| S8  | `app/configure-application.ts` một file (spec định tách hai)                                                 | 74 dòng, tách không tăng độ rõ                                                                                                               | Giữ                                                                  |
| S9  | Sơ đồ module là Mermaid (`docs/generated/module-graph.md`) thay vì SVG                                       | Không cần Graphviz, GitHub vẽ được, `--check` trong `pnpm check`                                                                             | Giữ                                                                  |
| S10 | ESLint một ngưỡng `max-lines` 500 ở mức `warn` + trần tổng `--max-warnings 229`, thay cho warn 300/error 500 | Một rule không có hai mức; trần tổng chặn số cảnh báo tăng mà không ép sửa hàng loạt hàm nghiệp vụ (không chặn từng hàm, mục 4)              | Giữ; xem mục 4                                                       |
| S11 | `test-support-structure` giữ là gate trong `test/gates/` (spec định chuyển sang ESLint)                      | Gate đọc bằng parser TypeScript đã đúng và có self-test; ESLint không có rule tương đương sẵn                                                | Giữ                                                                  |
| S12 | `Dockerfile` thêm `COPY scripts/build` cho bước build (spec: không chạm Dockerfile)                          | `pnpm build` sinh alias CLI cần script đó trong image builder; đường chạy không đổi                                                          | Owner chấp nhận 29/10/2026 (O2)                                      |
| S13 | Ba văn bản OpenAPI đổi (summary 73 ký tự, hai message > 160 ký tự)                                           | Test `api-inventory` đỏ sẵn ở mốc; mã lỗi giữ nguyên, message của F11 vẫn nêu lệnh vận hành                                                  | Owner chấp nhận 29/10/2026 (O3)                                      |

## 2. Rule và gate cũ → thay thế

| Rule/gate cũ                                                                                                                                 | Thay bằng                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bề mặt công khai là allowlist file gốc module (A4-02), `CLI_ENTRY_FILES`                                                                     | Cửa `public/` + `*.module.ts`: dependency-cruiser `public-door-only`, `composition-root-public-door`                                                                                                 |
| Registry hợp đồng gốc `PUBLIC_ROOT_CONTRACT_FILES` (ROOT-HARDEN.1)                                                                           | Thư mục `public/` (mọi file trong đó là công khai); vẫn giữ "một `@Injectable` mỗi file" và "không barrel"                                                                                           |
| Phần của module không đọc file riêng của phần khác (A4-01), registry GATE.2/GATE2-02                                                         | Bỏ có chủ đích (S5); thư mục con của capability theo `group-is-private`, `group-entry-from-capability`, `group-entry-from-sibling`                                                                   |
| Controller không import controller                                                                                                           | dependency-cruiser `controller-not-controller`                                                                                                                                                       |
| Không folder catch-all; lỗi chỉ trong `*.errors.ts`; một lớp mỗi tên lỗi; không HTTP trong lỗi/service; `instanceof`; raw SQL chỉ trong repo | Gate `module-layout` (cùng logic, có self-test)                                                                                                                                                      |
| Ngưỡng 400/700 dòng + ledger `oversizedFiles`                                                                                                | ESLint `max-lines` 500 (warn) + trần tổng `--max-warnings 229` (mục 4)                                                                                                                               |
| Gốc module ≤ 12 file, ≤ 2 controller; độ sâu ≤ 2                                                                                             | ≤ 25 file mỗi thư mục, ≤ 2 cấp thư mục dưới module (`module-layout`)                                                                                                                                 |
| Spec unit của module ≤ 400 dòng (H8-RV-01)                                                                                                   | Giữ nguyên trong `module-layout` (đã bị bỏ sót ở lượt đầu, khôi phục 29/10/2026)                                                                                                                     |
| Ledger cấu trúc (`LEGACY.*`) và test "báo hai chiều"                                                                                         | Bỏ: không còn ledger                                                                                                                                                                                 |
| Sở hữu bảng Prisma, raw SQL chỉ trên bảng sở hữu, reader trước migration, R-13, export Nest (`PUBLIC_CONTRACT_EXPORTS`), BEH.1               | Giữ nguyên (`architecture-boundaries`, `module-graph`, `policy-ownership`)                                                                                                                           |
| Tầng module (chỉ ở văn bản ADR, không có gate)                                                                                               | Mới: rule tầng của dependency-cruiser từ `scripts/arch/tiers.cjs`; cấm vòng import                                                                                                                   |
| Không có (integration chạy tuần tự nên không cần)                                                                                            | Mới: file khẳng định giới hạn thời gian thực đặt đuôi `*.timing-spec.ts`, chạy tuần tự (`pnpm test:integration:timing`); gate `parallel-safety` chặn `expect(elapsed).toBeLessThan(...)` ở file khác |

## 3. Test bị bỏ hoặc thay

Gate: 229 test ở mốc → 205 (`pnpm test:gates`, 11 file).

| Gate                      | Trước → sau | Giải trình                                                                                                                                                                       |
| ------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architecture-structure`  | 47 → 0      | Xóa: 13 rule thật + 34 self-test. Rule còn giá trị chuyển sang `module-layout` (23 test) và dependency-cruiser (mục 2); phần allowlist/ledger bỏ                                 |
| `architecture-boundaries` | 27 → 15     | 12 test cửa import/registry chuyển sang dependency-cruiser (`public-door-only`, `composition-root-public-door`)                                                                  |
| `policy-ownership`        | 8 → 7       | 3 test đổi tên theo đường dẫn mới; 1 test đọc chéo hai gate bỏ (gate còn một chủ)                                                                                                |
| `module-graph`            | 30 → 30     | 1 test đổi tên (`IdentityAccessService` → `IdentityAccessApi`)                                                                                                                   |
| `operational-commands`    | 11 → 15     | +4 kiểm alias `dist/<tên>-cli.js` ↔ bảng lệnh                                                                                                                                    |
| `parallel-safety` (mới)   | 0 → 9       | Tiêu chí P1/P2/P6 của mục 5: `pg_locks` chỉ trong database của file, hành động cấp cluster chỉ ở `_serial`, không cổng cố định, giới hạn thời gian thực chỉ ở `*.timing-spec.ts` |

Unit, HTTP, integration không mất test: unit 3 683 = 3 905 − 229 (gate tách ra) + 7 (extension); HTTP 1 238 → 1 240
(+2 `extension-points`); integration 3 465 → 3 466 (+1 test thứ tự `RevocationListeners`); E2E smoke mới 36 test. T2.2:
181 file chạy lại, 2 241 → 2 241 test. Không assertion nghiệp vụ nào bị sửa ngoài 8 test đỏ sẵn ở mốc (7 HTTP dựng app sai vai
sau QĐ-87; `final-release-upgrade` lỗi thời so với F91).
7 file integration mà kết quả phụ thuộc giới hạn thời gian ngắn đổi đuôi sang `*.timing-spec.ts` (28 test, nội dung
không đổi; gồm `database-stall`, `database-unavailable`, bốn `*-unavailable`, `transaction-runner`) và chạy tuần tự sau
lượt song song: 3 466 = 3 379 song song + 28 timing + 59 `_serial`.

Bảo vệ bị nới có chủ đích (cần Owner biết): S5 (capability trong module import nhau). Không còn bảo vệ nào bị bỏ sót sau khi
khôi phục H8-RV-01.

## 4. Cảnh báo kích thước và độ phức tạp (ESLint)

Lượt đầu 272 cảnh báo (0 lỗi). Quyết định:

| Nhóm                                                         | Số  | Xử lý                                                                 |
| ------------------------------------------------------------ | --- | --------------------------------------------------------------------- |
| `src/cli`, `src/infrastructure`, `src/core`                  | 17  | **Sửa ngay** (tách hàm có tên); output CLI giữ đúng byte (180/180)    |
| Hai policy thuần tệ nhất của data-import (complexity 56, 33) | 2   | **Sửa ngay** (~15 hàm thuần, mã lý do cùng thứ tự)                    |
| `*.http-errors.ts` (bảng lỗi → HTTP)                         | 22  | **Miễn có lý do** theo mẫu file (không phải logic)                    |
| Service/policy/controller nghiệp vụ                          | 229 | **Giữ cảnh báo, theo dõi**: `pnpm lint` chạy với `--max-warnings 229` |

`--max-warnings 229` chỉ là trần **tổng**: ESLint thoát lỗi khi tổng số cảnh báo của mọi rule mức `warn` lớn hơn 229
([ESLint CLI](https://eslint.org/docs/latest/use/command-line-interface#--max-warnings)). Nó không biết hàm nào lớn lên,
không chặn một hàm đã vượt ngưỡng dài thêm, không chặn một cảnh báo mới được bù bằng một cảnh báo vừa sửa, và không tự hạ
229 khi số cảnh báo giảm. "PR chạm hàm vượt ngưỡng làm nó nhỏ lại" và "hạ N khi số cảnh báo giảm" là quy ước review
(`docs/rules/module-structure.md`), không phải gate. Lượt này không sửa 229 cảnh báo.

229 còn lại: complexity ~109, độ dài hàm ~92, tham số ~28 (constructor nhiều dependency). Ưu tiên theo dõi (lớn nhất):
`personnel/offboarding/offboarding.service.ts` (complexity 42, 14 tham số), `organization/employee/employee-maintenance.service.ts`
(41), `requests/need-decision/need-decision.service.ts` (36), `personnel/transfer/transfer.service.ts` (34),
`requests/request-submission/access-request.service.ts` (31), `licensing/public/licensing.api.ts` (13 tham số),
`requests/assessment/assessment.service.ts` (13 tham số). Không coi phần này là xong: mỗi file nên có hạng mục riêng khi
module đó được chạm tới.

## 5. Tiêu chí ổn định khi chạy song song

| Tiêu chí                                                                                                                                                 | Cách kiểm                                                                                                                   | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 Mỗi file integration một database riêng; file đụng tài nguyên cluster nằm ở `_serial`                                                                 | `pnpm test:discovery`, gate `parallel-safety`                                                                               | xanh                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P2 Barrier khóa chỉ đếm lock của database của chính file (`current_database()`)                                                                          | gate `parallel-safety` quét `pg_locks`                                                                                      | xanh                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P3 Tạo/xóa database chờ 30 s, kết nối harness 15 s; app test và `testConfig` chờ kết nối/bắt đầu transaction 15 s, truy vấn 30 s; CLI chạy `dist/cli.js` | harness, `integration-setup.cjs`, `test-config.ts`, `TEST_CLI_RUNTIME=dist`                                                 | xanh                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P4 Ba lượt đầy đủ liên tiếp không đỏ (6 worker local) và không để lại database                                                                           | chạy 3 lần, đếm `slm_*_test` trước/sau                                                                                      | xanh ở lần thử 7 (cây cuối): 3/3 lượt 3 462/3 466 (4 bỏ qua có sẵn: S3 thật), database 170 → 170                                                                                                                                                                                                                                                                                                                                                            |
| P5 Integration đầy đủ với 2 worker trên runner GitHub: thời gian job theo số đo (mục tiêu 15 phút ban đầu đã bỏ)                                         | job `integration` chạy đầy đủ: PR/push `dev` của thay đổi này (chạm `test/support`, `.github` ⇒ `ALL`) hoặc nhánh thử mục 8 | **mục tiêu 15 phút không đạt, thay bằng số đo (`OD-R8` = B)**: run `40923299529` (`25d5244`) job 1 886 s (31 phút 26 s), song song 1 676 s, timing 56 s, `_serial` 61 s; run `40945441332` (`f498c74`) job 1 825 s (30 phút 25 s), 1 624 s, 54 s, 59 s. Quy tắc `timeout-minutes` = p95 đo được + 50 % cho ≈ 47–48 phút so với 40 ở `ci.yml` (Owner quyết); chỉ hai mẫu, đo lại sau khi tách spec integration (spec test, _Ngân sách thời gian CI_; mục 11) |
| P6 File phụ thuộc giới hạn thời gian ngắn không chạy cạnh file khác                                                                                      | `*.timing-spec.ts` + runner tuần tự, gate `parallel-safety`                                                                 | xanh: 7 file, 28 test, 49–56 s                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P7 (DoD spec) Trung vị ≤ 4 s/file                                                                                                                        | `--json` của các lượt sạch                                                                                                  | **owner-waived / not-required-for-this-checkpoint** (O5, 29/10/2026) — không phải đã đạt; số đo tham khảo: 9,3–11,9 s/file ở 6 worker (lần thử 7), p90 21–28 s                                                                                                                                                                                                                                                                                              |
| P8 (DoD spec) Không `beforeAll` timeout > 60 s                                                                                                           | quét AST các spec (timeout khai báo); `beforeAll` từng file trong `reports/test-timings/<runner>.json` (thời gian thật)     | **owner-waived / not-required-for-this-checkpoint** (O5, 29/10/2026) — không phải đã đạt; hiện trạng: 234 `beforeAll` integration (229 file) và 8 E2E khai timeout 90–300 s (đếm lại 29/10/2026); thời gian thật trên CI có trong artifact mục 8                                                                                                                                                                                                            |

**Nguồn của số "p99 ≈ 22 s" trước đây:** không phải phép đo `beforeAll`. Đó là ước lượng từ `--json` của Jest ở **lần thử
1** (cache `ts-jest` lạnh): mỗi file lấy thời gian cả file trừ tổng thời gian các test, nên gộp cả nạp và biên dịch module,
setup file, mọi hook (`beforeAll`, `beforeEach`, `afterAll`). Từ 29/10/2026 runner integration, timing, `_serial` và E2E
đo trực tiếp: môi trường `test/config/timing-environment.cjs` bấm giờ từng `beforeAll` theo sự kiện `hook_start` →
`hook_success`/`hook_failure` của jest-circus (hook quá hạn cũng được ghi), reporter ghi `beforeAllSeconds` (hook dài nhất
của file), `beforeAllHooks` và tóm tắt `beforeAll` (p50/p90/p99/max, 10 file chậm nhất) vào JSON — tức artifact
`test-timings-*` của CI. Kiểm cơ chế: bộ probe nhỏ ngoài repo (2 worker; hook lồng, `beforeEach` không bị tính, hook quá
hạn, file không hook, file hook cũ bị bỏ qua) và hai file `test/integration/audit/` với runner thật (22/22 xanh;
`audit-query-http` có `beforeAll` 25,3 s khi cache `ts-jest` lạnh vì cấu hình runner vừa đổi). Chưa có số CI.

P7–P8: Owner miễn cho checkpoint này ngày 29/10/2026 (O5) — ghi `owner-waived / not-required-for-this-checkpoint`, không
phải đã đạt và không còn là blocker. Không benchmark, không tối ưu thêm, không hạ timeout chỉ để đạt hai con số; test vẫn
phải xanh thật và timeout job/test giữ hữu hạn như hiện tại. `medianFileSeconds` và `beforeAll` trong artifact CI (mục 8)
vẫn được lưu làm dữ liệu.

**Diễn biến P4.** Mọi lỗi giữa chừng là hạ tầng hoặc đo thời gian, không assertion nghiệp vụ nào sai; mỗi lượt trả lại
đúng số database như trước (không rò). Mỗi lần thử sửa nguyên nhân rồi chạy lại cả ba lượt:

| Lần | Lượt đỏ                        | Nguyên nhân                                                                                                                                                                                                                                                                                                                               | Sửa                                                                                                                 |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | lượt 3: 8 file                 | máy chậm ~2× suốt 8 phút; kết nối đầu tới database vừa clone vượt 3 s (connect) / 2 s (`maxWait`) của production                                                                                                                                                                                                                          | app test chờ 15 s/15 s, kết nối harness 15 s                                                                        |
| 2   | lượt 2: 3 file                 | hai file đo thời gian (4,9 s và 3,8 s > 3,5 s); một file lỗi kết nối pg                                                                                                                                                                                                                                                                   | 6 file `*.timing-spec.ts` chạy tuần tự; truy vấn client 30 s                                                        |
| 3   | lượt 1: 1 file, lượt 2: 2 file | (a) lượt chiếu thông báo đầu không thấy event vừa ghi: Prisma 7 sinh `@default(now())` bằng đồng hồ Node (đã kiểm bằng SQL trace, ghi chú đồng hồ dưới), harness so với đồng hồ PostgreSQL trong VM Docker; (b) PostgreSQL ghi `still waiting for backend … to accept ProcSignalBarrier` > 10 s đúng lúc một file quá hạn chờ transaction | (a) `project()` của harness dùng đồng hồ muộn hơn; (b) môi trường Docker Desktop/Windows, không sửa được trong repo |
| 4   | lượt 1: 1 file                 | suite dựng service bằng `testConfig()` vẫn giữ giới hạn production (2 s `maxWait`)                                                                                                                                                                                                                                                        | `testConfig` dùng giới hạn của runner bận                                                                           |
| 5   | lượt 1: 2 file                 | (a) SQL viết thẳng `held_until = now()` (đồng hồ PostgreSQL) sớm hơn `held_from` app đã ghi (đồng hồ Node) → vi phạm CHECK; (b) đăng nhập trong harness quá hạn transaction khi máy bận                                                                                                                                                   | (a) `GREATEST(now(), held_from)` ở 6 chỗ, quy tắc đồng hồ trong `test/README.md`; (b) như 3(b)                      |
| 6   | lượt 3: 1 file                 | `transaction-runner` tự đặt chờ transaction 2 s mà chạy song song                                                                                                                                                                                                                                                                         | chuyển sang `*.timing-spec.ts`                                                                                      |
| 7   | không                          | —                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                   |

Lượt hay đỏ là lượt đầu sau khi đổi code (cache `ts-jest` lạnh, 6 worker cùng biên dịch): CI luôn chạy với cache lạnh nhưng
trên Linux, không qua VM và proxy cổng của Docker Desktop. `pnpm check` xanh ở đầu lần 5 (486 s); sau đó chỉ đổi file test
và tài liệu, đã chạy lại gate, script, rules, format, lint, typecheck và discovery.

**Đồng hồ của `audit_events.occurred_at` (kiểm 29/10/2026).** Cột có `DEFAULT CURRENT_TIMESTAMP` (migration
`20261012091936_audit_foundation`) và tài liệu Prisma ghi `now()` trên CSDL quan hệ là "implemented on the database-level",
nhưng đó là DDL của cột, không phải câu INSERT client gửi. Ca tái hiện cô lập: PostgreSQL 17.11 tạm, chỉ DDL của migration
trên, `AuditRepo.insert` thật của repo qua client sinh ra (`@prisma/client` 7.9.1, `@prisma/adapter-pg`) với
`occurredAt` không truyền, trong transaction mở 1,5 s trước khi insert; ghi log câu lệnh ở cả client (`$on('query')`) và
server (`log_statement = all`). Kết quả: câu INSERT luôn có cột `occurred_at` là tham số `$3`; giá trị
(`13:29:47.414Z`) nằm giữa hai mốc đồng hồ Node ngay trước/sau lời gọi (`.391Z`/`.423Z`) và muộn hơn `now()` của
transaction 1 543 ms; server nhận `$3 = '2026-10-29 13:29:47.414+00'`. Vậy với đường ghi của app, `occurred_at` là đồng
hồ của tiến trình ghi lúc gửi INSERT, không phải DEFAULT của cột, cũng không phải giờ bắt đầu transaction. SQL viết thẳng
không nêu cột (migration, `writeAudit` của harness) vẫn dùng DEFAULT. Đã sửa comment sai ở `RequestStatusProjection`,
`AuditApi.readSince`, `docs/rules/security-jobs.md`, spec `g5-request-status-notifications`. Không đổi logic: dấu thời
gian vẫn nằm giữa lúc transaction bắt đầu và lúc commit, nên độ trễ đọc (transaction timeout + 5 s) vẫn đủ; API, worker
và PostgreSQL trên VPS cùng một đồng hồ máy. Nếu sau này tiến trình ghi và worker chạy trên máy khác nhau, độ lệch đồng hồ
giữa chúng phải nằm trong 5 s margin.

## 6. Số đo (máy dev 16 nhân, Windows 11, PostgreSQL 17 docker `fsync=off`)

**T2.2 — dựng tiền đề không qua HTTP.** 20 file integration chậm nhất, chạy tuần tự (`--runInBand`, `TEST_CLI_RUNTIME=dist`),
cùng lệnh trước và sau, máy không chạy việc khác: **775 s → 400 s (−48 %)**, 289 → 289 test, 0 đỏ. Tách theo nhóm:

| Nhóm                                                    | Trước | Sau   | Thay đổi | Ghi chú                                                     |
| ------------------------------------------------------- | ----- | ----- | -------- | ----------------------------------------------------------- |
| 14 file dựng tiền đề qua harness (đã đổi)               | 523 s | 196 s | −62 %    | từng file −19 % … −79 %; gọi HTTP mỗi file 307–768 → 30–154 |
| 6 file migration/CLI (không đổi — đó là thứ chúng kiểm) | 252 s | 204 s | −19 %    | độ trôi do cache Jest/`dist` giữa hai lượt, không do code   |

Trừ độ trôi của nhóm không đổi, tác dụng của T2.2 khoảng −50 % trên nhóm đã sửa. Builder ở `test/support/builders/` gọi
đúng service mà controller của route gọi (audit, notice, listener vẫn chạy); route nào là đối tượng kiểm thì vẫn qua HTTP.
Tài khoản dựng bằng builder không sinh thư mời/audit mời — luồng đó vẫn được `identity-access` và E2E `auth-session` kiểm.

**OD-T4 — `@swc/jest` so với `ts-jest`** (cùng cây code, 2 worker, cache lạnh = thư mục cache rỗng, ấm = lượt thứ hai; mọi
biến thể xanh với cùng số test; cấu hình theo https://docs.nestjs.com/recipes/swc#jest--swc):

| Runner                | ts-jest lạnh | swc lạnh | ts-jest ấm | swc ấm  |
| --------------------- | ------------ | -------- | ---------- | ------- |
| Unit (3 683 test)     | 27,4 s       | 26,1 s   | 20,8 s     | 20,0 s  |
| Gate (196 test)       | 15,3 s       | 11,2 s   | 7,4 s      | 6,9 s   |
| HTTP (1 240 test)     | 66,4 s       | 63,7 s   | 55,9 s     | 54,4 s  |
| Integration (20 file) | 276,6 s      | 264,2 s  | 249,9 s    | 273,1 s |

Tổng khi cache lạnh nhanh hơn ~5 %, dưới ngưỡng 30 % → **giữ `ts-jest`**, đã gỡ `@swc/core`, `@swc/jest`. Lý do: `ts-jest`
của repo đã chỉ transpile (`isolatedModules`); thời gian nằm ở nạp graph Nest và PostgreSQL, không ở biên dịch.

**Ổn định — lần thử 7 (cây cuối, 6 worker, `TEST_CLI_RUNTIME=dist`):** song song 254 file 500–619 s (trung vị
9,3–11,9 s/file, p90 21–28 s), timing 7 file 49–56 s, `_serial` 8 file 54–60 s, mỗi lượt 10–12 phút; HTTP 46 file
46 s; E2E 8 file 41 s. Máy dev dùng chung (trình duyệt, IDE) nên thời gian dao động ±15 % giữa các lượt.

**Lượt toàn bộ trước T2.2** (6 worker): integration 261 file 737 s, `_serial` 8 file 68 s, HTTP 46 file 59 s, E2E 36 test
46 s. Mốc `dee61eb` (tuần tự, đo lúc máy bận và có lần ngủ): HTTP 394 s với 9 đỏ; integration trung vị 12 s/file với 10 đỏ.

## 7. Thư mục con trong một capability

Đo trên 79 thư mục capability: 44 có 0–2 service, 21 có 3–5, 12 có 6–8, hai thư mục có 10 và 12. Tiêu chí tách đã ghi ở
[module structure](../../rules/module-structure.md#layout-trong-một-module): tách theo use case (không theo loại file) khi cụm
có ≥ 4 file riêng và ngoài cụm chỉ Nest module/facade dùng. Quét đồ thị import mọi capability ≥ 20 file: chỉ
`catalog/catalog-entry` (25 file, đúng trần) có cụm riêng tư rõ — retirement, 6 file — đã tách thành
`catalog-entry/retirement/`. Các capability gần trần còn lại (`requests/access-request`, `requests/spend`,
`organization/department`, `data-import/employee-import` …) không có cụm riêng tư: file được nhiều use case dùng chung, tách
chỉ đổi chỗ, không làm rõ hơn; xét lại khi thêm file mới.

## 8. Việc Owner làm trên GitHub

Bước 1–3 không cần merge `main`, không gọi `deploy.yml` và không chạm VPS. `deploy.yml` không có trigger push: nó chỉ chạy
khi job `deploy` của `ci.yml` gọi (`workflow_call`, chỉ trên `main` + push) hoặc khi bấm tay. Theo ref cục bộ (fetch gần
nhất), `main` mới có `ci.yml` cũ, không `workflow_dispatch`, chưa có `nightly.yml`; vì `workflow_dispatch` chỉ dùng được khi
workflow có trên nhánh mặc định, các bước dưới dùng push lên `dev` và nhánh thử thay cho `gh workflow run`.

1. **Đẩy lên `dev`** (PR hoặc push như thường lệ). Thay đổi chạm `test/support`, `test/config`, `.github`, `package.json` nên
   job `integration` chọn `ALL` + `SERIAL`; `e2e-smoke` và `deploy` bỏ qua vì không phải `main`. Mục tiêu: `http-contract`
   ≤ 3 phút; ba bước integration (song song `--maxWorkers=2`, timing, `_serial`) cộng lại: ghi số đo (P5; mục tiêu 15 phút đã bỏ, mục 5).
2. **Thử A/B chặn deploy** trên nhánh `ci-trial/deploy-gate` tạo từ commit mới của `dev`. Chỉ sửa `ci.yml` **trên nhánh
   này**, ba chỗ:
   - `push.branches: [main, dev, 'ci-trial/**']`;
   - `e2e-smoke.if: github.ref == 'refs/heads/ci-trial/deploy-gate'`;
   - **giữ nguyên** job `deploy` (`Deploy to VPS`): điều kiện `github.ref == 'refs/heads/main'` làm nó luôn `skipped` trên
     nhánh thử, và gate `test/gates/deployment-roles.gate-spec.ts` (trong `pnpm check` của `quality`) đòi `ci.yml` vẫn có
     `uses: ./.github/workflows/deploy.yml` — xóa nó thì `quality` đỏ và lượt đối chứng vô nghĩa. Thêm cuối file một job giả
     cùng `needs`:

     ```yaml
     deploy-gate-probe:
       name: Deploy gate probe (no VPS)
       needs: [quality, http-contract, integration, e2e-smoke]
       if: github.ref == 'refs/heads/ci-trial/deploy-gate' && github.event_name == 'push'
       runs-on: ubuntu-latest
       steps:
         - run: echo would deploy
     ```

   - trước khi push: `pnpm exec prettier --check .github/workflows/ci.yml` xanh (rules:format kiểm file này);
     `git diff dev -- .github/workflows/ci.yml` chỉ có ba chỗ trên;
   - lượt A (đối chứng): push lần đầu (base `000…` ⇒ integration `ALL` + `SERIAL`, có `e2e-smoke`) → mọi job test xanh,
     `Deploy gate probe (no VPS)` **chạy** và in `would deploy`, `Deploy to VPS` `skipped`;
   - lượt B: thêm `test/integration/platform/zz-deploy-gate-probe.integration-spec.ts` chỉ chứa
     `it('fails on purpose', () => expect(1).toBe(2));`, commit, push (bộ chọn chạy `test/integration/platform`) →
     `integration` đỏ vì probe, `Deploy gate probe (no VPS)` **skipped**;
   - xong: xóa nhánh trên remote và local (`git push origin --delete ci-trial/deploy-gate`).
3. **Nightly** trên nhánh `ci-trial/nightly`, **sau** bước 1 (job checkout `ref: dev`, nên nó chạy code của `dev` chứ không
   phải của nhánh thử): thêm `push: branches: ['ci-trial/nightly']` vào `on:` của `nightly.yml` trên nhánh này, push, rồi xóa
   nhánh. Workflow không có secret, không deploy. Lịch hằng đêm và `gh workflow run "Backend nightly" --ref dev` chỉ chạy
   được khi `nightly.yml` đã có trên nhánh mặc định (lần merge `main` thường kế tiếp).
4. **Sau lần deploy thường kế tiếp của Owner** (không phải một phần của thử nghiệm; không bootstrap/reset, giữ dữ liệu):
   `GET /api/v1/health/ready` = 200; đăng nhập một tài khoản thật; log worker có `Worker started`; trong container API
   `node dist/cli.js --help` và `node dist/inspect-cli.js --help` (alias cũ) thoát 0.

**Gửi lại.** Lấy bằng `gh` (chỉ đọc):

```bash
gh run list --workflow "Backend CI" --branch dev --limit 3          # bước 1; --branch ci-trial/deploy-gate cho bước 2
gh run list --workflow "Backend nightly" --branch ci-trial/nightly --limit 3
gh run view <run-id> --json jobs --jq '.jobs[] | {name, conclusion, startedAt, completedAt, steps: [.steps[] | {name, conclusion, startedAt, completedAt}]}'
gh run download <run-id> --dir run-<run-id>
```

| Bước | Run                    | Gửi lại                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Backend CI trên `dev`  | Run ID; kết luận và thời gian `quality`, `http-contract`, `integration`; thời gian bước `Run local quality gate`, `Run HTTP contract tests`, `Run integration tests (parallel files)`, `… bound wall-clock time (in band)`, `… share the cluster (in band)`; artifact `test-timings-integration` (`integration.json`: `medianFileSeconds`, `beforeAll` — dữ liệu tham khảo; `integration-timing.json`, `integration-serial.json`), `test-timings-http`, `test-timings-quality` |
| 2A   | `ci-trial/deploy-gate` | Run ID; bốn job test `success`; `Deploy gate probe (no VPS)` `success` với log `would deploy`; `Deploy to VPS` `skipped`; thời gian `e2e-smoke` và bước `Run end-to-end smoke journeys`; artifact `test-timings-integration` của lượt này                                                                                                                                                                                                                                      |
| 2B   | `ci-trial/deploy-gate` | Run ID; `integration` `failure` (chỉ `zz-deploy-gate-probe`); `Deploy gate probe (no VPS)` `skipped`; `Deploy to VPS` `skipped`; các job khác `success`                                                                                                                                                                                                                                                                                                                        |
| 3    | `ci-trial/nightly`     | Run ID; kết luận và thời gian job `integration` (bốn bước chạy test) và `mutation`; artifact `nightly-test-timings` (gồm `e2e.json` có `beforeAll` E2E — job `e2e-smoke` của `ci.yml` không lưu artifact)                                                                                                                                                                                                                                                                      |
| 4    | VPS sau deploy thường  | HTTP status của health, đăng nhập được hay không, dòng log worker, exit code hai lệnh `--help`                                                                                                                                                                                                                                                                                                                                                                                 |

Số liệu gửi lại được ghi vào plan hai hạng mục và mục 5 (P5; số P7, P8 chỉ là dữ liệu tham khảo vì đã được miễn).

## 9. Sửa hai lỗi harness từ lượt CI đầu trên `4a93078` (29/10/2026)

Log Owner cung cấp: `quality` và `http-contract` xanh; integration song song đỏ hai ca. Các sửa dưới đây chưa commit
và chưa kiểm chứng lại trên GitHub; không đổi source nghiệp vụ, schema/migration, timeout production hoặc workflow.

- `access-request-preview`: năm request tới route đã bỏ dùng chung server chưa listen. SuperTest tự mở listener cho
  request đầu rồi đóng khi request đó xong; các request anh em có thể nhận `ECONNRESET`. `createHttpTestApp` nay tự
  listen ở cổng động trên `127.0.0.1`, giữ listener tới `app.close()`. Assertion hồi quy về quyền sở hữu listener đỏ
  trên harness cũ, xanh sau sửa; cả năm status vẫn phải là `404`.
- `migration-setup`: child-process `close` không bảo đảm relay đã nhận TCP `close`, nên assertion `holding === false`
  ngay sau khi Prisma dừng bị race. `PgRelay.waitForHeldConnectionsToClose` chỉ quan sát close của hai đầu socket với
  deadline hữu hạn, không destroy/release peer. Test vẫn kiểm process count bằng 0, session bằng 0 và DROP không FORCE.
  Hai ca hồi quy TCP thật kiểm peer đóng và peer còn sống (phải hết hạn và giữ `holding === true`). Không tăng thời hạn
  migrate 15 s hay ngân sách test 60 s.

Kiểm chứng trên PostgreSQL 17 cô lập, role thường, hai Jest worker: 5 file / **37 test xanh** (hai file CI lỗi, relay
lifecycle, auth concurrency, outcome-listener rollback); 2 gate support/parallel-safety **28/28**; typecheck, ESLint
các TS đổi, Prettier và discovery đạt. Typecheck ban đầu bắt union `App` ở assertion mới, đã sửa bằng `toHaveProperty`
và chạy lại. Không chạy lại full `pnpm check`, toàn bộ integration hoặc HTTP/E2E; bằng chứng remote còn chờ push.

Cleanup: container riêng `slm-ci-fix-20261029-01` trên `127.0.0.1:55439`, nhãn `slm.task=ci-fix-20261029-01`; sau test
còn 0 database `slm_*_test`, đã xóa đúng container ID và volume ẩn danh của nó. Redis có sẵn được giữ nguyên. Không SSH,
commit hay push. Bước kế: Owner review/commit correction, push `dev`, chờ integration và các job CI thực tế xanh.

## 10. Nguyên nhân gốc của `migration-setup` đỏ trên CI Linux (30/10/2026)

Run `40899387513` (`4a93078`) và `40907589777` (`3dffadd`): bước integration song song đỏ cùng một ca —
`migration-setup` › _names the stalled phase…_. Lượt 1 đỏ ở `holding === false`; lượt 2, sau sửa của mục 9, vẫn đỏ vì
chờ 10 s mà socket không đóng. Mục 9 coi đây là race giữa hai sự kiện `close`; không đúng gốc.

- **Gốc.** `prisma migrate deploy` chạy hai tiến trình: CLI Node và `schema-engine` native do CLI spawn với stdio
  `pipe`, không `detached` (bundle `prisma/build/cli.js` của Prisma 7.9.1). Engine giữ kết nối DB. Hết giới hạn, harness
  chỉ `SIGKILL` CLI; trên Linux engine thành tiến trình mồ côi (PPID 1), vẫn chặn ở câu lệnh relay giữ và giữ session tới
  khi `afterAll` dừng relay. Trên Windows engine thoát khi pipe vỡ, nên lượt local trước đó xanh. Lỗi là của harness
  (hứa "không còn tiến trình hay session"), không phải race của assertion.
- **Tái hiện.** Bản sao Linux của job `integration`: `node:22-bookworm` + `postgres:17-alpine` chung network namespace,
  role `ci_integration`, `fsync=off`, cây LF như checkout CI, `pnpm build`, `TEST_CLI_RUNTIME=dist`. Code `3dffadd`: đỏ
  **3/3** đúng thông báo CI; sau mỗi lượt `ps` thấy `schema-engine` PPID 1.
- **Sửa** (`test/support/migration-deploy.ts`): dừng cả cây tiến trình. POSIX: CLI chạy `detached` (process group riêng),
  hết hạn thì `process.kill(-pid, 'SIGKILL')`; Windows: `taskkill /T /F` khi CLI còn sống; hook `exit` cũng dừng cả cây.
  Cùng cách `scripts/verify/deploy-release.test.mjs` đã dùng. Không đổi giới hạn 15 s/60 s hay assertion; giữ
  `waitForHeldConnectionsToClose` của mục 9 vì socket đóng sau khi tiến trình chết vẫn là sự kiện bất đồng bộ.
- **Kiểm chứng sau sửa.**

  | Phạm vi                                                                                    | Kết quả                                  |
  | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
  | `migration-setup` trên bản sao Linux                                                       | xanh **5/5**, không còn `schema-engine`  |
  | `migration-setup` trên Windows 11 (PostgreSQL 17 docker)                                   | xanh **3/3**, không còn `schema-engine`  |
  | `migration-setup` + `pg-relay-lifecycle` + `access-request-preview`                        | 3 file / 28 test xanh (Linux, 2 worker)  |
  | `test:integration:timing` (bước CI chưa từng chạy)                                         | 7 file / 28 test xanh (Linux)            |
  | `test:integration:serial` (bước CI chưa từng chạy; deploy qua CLI)                         | 8 file / 59 test xanh (Linux)            |
  | `test:e2e` (job `e2e-smoke`, chưa từng chạy trên CI)                                       | 8 file / 36 test xanh (Linux)            |
  | `test:integration` song song, bản sao Linux 4 worker (dừng sớm, máy tải)                   | 22 file đầu xanh, gồm globalSetup deploy |
  | `test:gates`, `rules:check`, `rules:format`, `test:discovery`, ESLint, Prettier, typecheck | đạt                                      |

  Bản sao phải đổi `pg_hba.conf` của image `postgres` từ `trust` sang `scram-sha-256` cho `127.0.0.1`: khi chung network
  namespace, kết nối đến từ loopback nên mật khẩu sai vẫn được nhận và hai suite `_serial` kiểm từ chối credential đỏ giả.
  Trên CI runner kết nối qua cổng publish nên PostgreSQL luôn đòi mật khẩu.

- **Chưa kiểm chứng.** Toàn bộ bước song song chưa chạy lại hết trên bản sao (máy dev quá tải); bằng chứng cho 232 file
  còn lại là run `40907589777` (253/254 xanh trên Linux, ca đỏ duy nhất là ca đã sửa). CI thật chờ Owner push.
- **Ngân sách thời gian — Owner chọn 30/10/2026.** Bước song song trên runner 2 vCPU mất 1 142–1 280 s; cộng setup,
  build, timing, `_serial` ước 24–27 phút, sát `timeout-minutes: 30`. Owner chọn nâng timeout, vẫn một runner (OD-T2):
  `ci.yml` job `integration` 30 → **40** phút, `nightly.yml` job `integration` (gồm thêm e2e) 40 → **50** phút. Quy tắc
  "timeout gấp đôi mục tiêu" của spec không còn khớp vì P5 (≤ 15 phút) chưa đạt.
- **Ghi nhận, không sửa.** CI in nhiều cảnh báo pg 8.23 _Calling client.query() when the client is already executing a
  query_: `Promise.all` trên cùng một transaction client trong repo nguồn (ví dụ `spend-request.repo.ts`,
  `assignment.repo.ts`, `budget-facts.repo.ts`). pg@8 tự xếp hàng nên hiện không lỗi; nâng pg@9 thì sẽ vỡ.

## 11. Bằng chứng GitHub đọc được (Prompt 09, 30/10/2026)

Lấy bằng `gh run list` / `gh run view` chỉ đọc trên `SEP490-FALL2026/BE-dev`; không chạy, không rerun workflow. Đây là
bằng chứng cho commit đã đẩy, **không** cho cây readability chưa commit của Prompt 09.

| Bước mục 8 | Run / nguồn                                                         | Kết quả                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1          | `40923299529` push `dev` `25d5244` (Backend CI)                     | `quality` success 416 s (gate 329 s); `http-contract` success 136 s (103 s); `integration` success 1 886 s — song song 1 676 s, timing 56 s, `_serial` 61 s; `e2e-smoke`, `Deploy to VPS` skipped |
| 1 (kế)     | `40945441332` push `dev` `f498c74`                                  | `quality` 473 s; `http-contract` 170 s; `integration` 1 825 s — song song 1 624 s, timing 54 s, `_serial` 59 s; `e2e-smoke`, deploy skipped                                                       |
| 2A, 2B     | không có run nào trên `ci-trial/deploy-gate`                        | `pending` — Owner theo dõi; chặn deploy A/B chưa được thử trên GitHub                                                                                                                             |
| 3          | `nightly.yml` chưa có trên nhánh mặc định (404)                     | `pending` — chưa có run nightly                                                                                                                                                                   |
| 4          | Owner báo image `ghcr.io/wdp301-fa26-gr8/be:6a6f49b…` chạy trên VPS | `pending` hồ sơ: SHA này không có trong lịch sử BE local; không suy ra nó trùng `f498c74`. Health/đăng nhập/`--help` chưa có bản ghi đủ                                                           |
| O6, O7     | —                                                                   | `pending` — quyết định/đi route của Owner, AI không thay                                                                                                                                          |

`e2e-smoke` chưa từng chạy trên CI (`dev` bỏ qua job này; run `main` gần nhất 16/10/2026, trước redesign). P5 ≤ 15 phút
**không đạt**; theo `OD-R8` hướng B (Prompt 09) mục tiêu ghi lại theo số đo ở spec test.
