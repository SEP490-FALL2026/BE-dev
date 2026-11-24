# PLAN — Đợt 3 thiết kế lại: kho B1 → B2 → B3 (22/11/2026, bản 2.4, 25/11/2026)

> **Bản 2.4 (25/11):** đối chiếu code đợt 2 cuối ([DELTA-W2-FINAL.md](DELTA-W2-FINAL.md): file mới của P12a/P20b/P15/P14/P22, `organization.prisma`
> vào file chung); **hai làn chạy song song không chờ nhau** — B1 trọn ở làn `biz` (P1, P3 chuyển sang), làn `tech` làm B2-tech ngay từ đầu (P9 tách
> P9a/P9b), PR mỗi phần từ nhánh chụp `pr/redesign-w3-b<n>`, điểm gộp G1…G8 thay bằng hai cửa đẩy C1, C2 (không cửa nào bắt một làn ngồi chờ).

Spec: [SPEC.md](SPEC.md) + [SPEC-B1.md](SPEC-B1.md), [SPEC-B2.md](SPEC-B2.md), [SPEC-B3.md](SPEC-B3.md). Trạng thái: Proposed bản 2.4 — chờ Owner
duyệt; mọi câu Owner đã trả lời ([SPEC §13.2](SPEC.md#132-quyết-định-owner-owner-answersmd)) trừ OQ-D1 ([DELTA-W2-FINAL](DELTA-W2-FINAL.md#2-cần-owner)).
Quy trình: [`docs/guides/quy-trinh-code-ai.md`](../../guides/quy-trinh-code-ai.md).
Đường dẫn file trong PLAN tính từ gốc repo; `src/modules/` viết tắt `m/`. Mỗi file `*.ts` có logic mới kèm spec **cùng thư mục, cùng tên**
(`<tên>.spec.ts`) — ghi `(+spec)`.

## Nền và nhánh

- **Điều kiện bắt đầu (K-C1, B1-R21) — cả hai phải đúng, thiếu ⟹ không tách nhánh, báo Owner:**
  1. Đợt 1 ở `dev`: `git -C <repo> --no-pager merge-base --is-ancestor 4e029dbd origin/dev && echo dot1-ok`.
  2. **Đợt 2 ở `dev`** (merge bằng squash ⟹ kiểm file, không tìm merge commit):
     `git -C <repo> --no-pager ls-tree --name-only origin/dev prisma/migrations/20261124100400_saas_issue_awaiting_assignee/migration.sql prisma/migrations/20261124100200_device_activations/migration.sql src/modules/licensing/device-activation/device-activation.service.ts src/modules/catalog/subscription/responsible/subscription-responsible.controller.ts`
     phải in đủ 4 dòng; **và** `git -C <repo> --no-pager diff --stat origin/dev origin/int/redesign-w2 -- src prisma` phải **rỗng** (đợt 2 đã
     squash hết vào `dev` — N11); và `git -C <repo> --no-pager ls-tree --name-only origin/dev docs/reviews/redesign-w3-2026-11-22/DELTA-W2-FINAL.md`
     in 1 dòng (SPEC/PLAN bản 2.4 đã vào `dev`). Đã kiểm 25/11: đúng cả hai trên `origin/dev` `70543271` (trừ dòng DELTA — chờ merge docs).
- **Làn `biz` (Owner, agent Neon):** làm **thẳng trên** `int/redesign-w3` (Owner tạo từ `dev`), `git pull --ff-only` trước mỗi gói; **push ngay sau mỗi commit** (`int` có hai người đẩy: pull bị từ chối ⟹
  `git pull --rebase` — chỉ commit chưa push của chính mình).
- **Làn `tech` (Bảo):** nhánh `feat/redesign-w3-tech` tách từ `origin/dev`.
- **Kéo xuống (luôn được, không chờ ai):** làn `tech` `git fetch origin && git merge origin/int/redesign-w3` (merge, không rebase) **trước mỗi gói** và
  bắt buộc trước gói có cột _Phụ thuộc_ ghi "… ở int" (đủ danh sách ở bảng _Gói_ và CODE-PROMPT §2).
- **Đẩy lên** (merge `feat/redesign-w3-tech` → `int/redesign-w3`, chỉ commit **cuối một gói** đã xanh; Owner **hoặc** Bảo làm, lúc làn `biz` đang ở ranh
  giới gói — không ai phải đợi người kia): chỉ ở cửa (bảng _Cửa_). Trước cửa C1 không đẩy
  gì (giữ `int` = B1 thuần); giữa C1 và C2 chỉ đẩy B2-tech (P9a, P9b); sau C2 đẩy từng gói ngay khi xong. Muốn đẩy riêng phần đầu nhánh:
  `git checkout int/redesign-w3 && git merge <sha cuối P9b>` — vì vậy làn `tech` **giữ thứ tự gói tuyến tính** trên nhánh (gói B3 commit sau P9b).
- **PR mỗi phần từ nhánh chụp** (K-C3: PR B1 không kéo code B2): xong phần ⟹ làn `biz` tạo `pr/redesign-w3-b1` (rồi `-b2`) tại commit cuối phần
  trên `int`, push, mở PR nhánh chụp → `dev` (CI full xanh + review). `int` đi tiếp ngay, **không chờ PR**. Sửa theo review PR: commit trên nhánh chụp
  rồi `git merge pr/redesign-w3-b<n>` vào `int`; file đã đổi tay sang `tech` (bảng _Tự kiểm chéo_) ⟹ **không** sửa ở `biz`, ghi _Bàn giao_ — Bảo sửa
  trên nhánh `fix/redesign-w3-b<n>-review` tách từ nhánh chụp, merge vào nhánh chụp rồi vào `int` và nhánh `tech`. PR squash vào `dev` xong ⟹
  `git merge origin/dev` vào `int`, nhánh `tech` **và mọi nhánh chụp còn mở**; xung đột: file thuộc phần vừa squash ⟹ lấy bản `int`, file khác (commit
  người khác trên `dev`) ⟹ gộp tay. Khi cắt nhánh chụp: `git --no-pager ls-tree --name-only origin/dev prisma/migrations/ | tail -3` — `dev` có migration
  số ≥ dải của phần ⟹ đổi tên migration của phần lên trên số cuối của `dev` (chỉ khi chưa deploy), ghi PROGRESS. B3: PR từ `pr/redesign-w3-b3` cắt sau P23 cả hai làn.
- **Trong một làn:** tuần tự từng gói, không song song, không worktree.
- **Migration:** dải số theo phần — B1 `20261201…` (làn `biz`), B2 `20261202…`, B3 `20261203…` (làn `tech`). Hai làn viết migration cùng lúc ở hai
  thư mục khác nhau, không đụng nhau; thứ tự áp = thứ tự tên. M4 không đọc cột của M1–M3; M5 đọc M1 + M4 ⟹ P11 sau khi đã kéo P1, P3 về nhánh `tech`.
  Tránh migration sửa sau; bắt buộc có (vd theo review PR B1) ⟹ số **cao hơn migration cuối trên `int`**, viết idempotent (`IF NOT EXISTS`, kiểm
  trước), ghi rõ trong PR; không bao giờ sửa migration đã đẩy lên `int`. M4 tách hai file: `20261202000000` (bảng workspace, P9a) và `20261202000100`
  (cột `plans`/`subscriptions` + backfill, P9b) để Prisma khớp migration ở mọi commit (CI `prisma migrate diff --exit-code`).

## Hai làn không sửa chung file

- Làn `tech`: migration + `prisma/models/*` **của B2, B3** (từ P9a; riêng `catalog.prisma` chỉ sau khi đã kéo P1, ba file `budgets/licensing/
requests.prisma` chỉ sau khi đã kéo P3), repo của bảng mới B2/B3, route CRUD/route người phụ trách, DTO/mapper của route đó, chuyển dữ liệu, chuyển
  code đợt 2 sang lô (P20b), seed B2/B3, module card `m/*/README.md` (trừ phần P1 viết), generator; khi chờ: chạy integration/http/seed trên Docker
  cho phần đã cắt, **chỉ sửa test/fixture** (như F2-6 đợt 2), ghi `FIX-TEST-tech.md`.
- Làn `biz`: **trọn B1** gồm M1–M3 và mọi file của P1, P3 (schema, DTO/mapper giá tháng, seed B1, README module P1 chạm); luật tiền, sổ số seat (facade +
  dịch vụ ghi), mua thêm seat, điểm điều chỉnh, `K1`, tiền `K4`, ghost seat, job, thông báo, `docs/rules/security-jobs.md`, `docs/rules/database-business.md`
  (bảng khóa gộp).
- **File chung, chỉ thêm dòng, gộp tay khi merge:** `openapi.json` (sinh bằng `pnpm openapi:export` — xung đột ⟹ sinh lại sau merge, không sửa tay),
  `test/support/openapi-example-manifest.ts`, `test/support/openapi-example-route-codes-catalog.ts`, `…-licensing.ts`, `…-budgets.ts`, `…-requests.ts`,
  `…-requests-spend.ts`, `…-optimization.ts`, `…-operating-parameters.ts`, `test/support/api-coverage-manifest.ts`, `m/catalog/catalog.module.ts`,
  `m/licensing/licensing.module.ts`, `m/budgets/budgets.module.ts`, `m/requests/requests.module.ts`, danh sách lỗi của các `*.errors.ts`/
  `*.http-errors.ts` **đã có** (thêm lớp/nhánh ở cuối), `m/notifications/public/notifications.types.ts`, `m/notifications/inbox/inbox.policy.ts`,
  `m/notifications/inbox/notification-text/notification-texts-subscription.types.ts`, `m/notifications/inbox/notification-target.policy.ts`,
  **`prisma/models/organization.prisma`** (chỉ trường quan hệ ngược ở khối `Organization`/`Employee` — DL-8; `biz` chèn **đầu** danh sách quan hệ
  của khối, `tech` chèn **cuối**; sau merge `pnpm exec prisma format`), **`prisma/models/catalog.prisma` trong
  lúc P1 ‖ P9a** (P9a chỉ thêm model mới **cuối file** + trường quan hệ ở khối `Vendor`; P1 không thêm model/enum cuối file; không chạm khối `Plan`,
  `Subscription`, `PlanWorkspace*` tới P9b), `test/gates/api-collection-contract.gate-spec.ts` (mục `NESTED_ARRAYS` — cần Owner duyệt; gate từ chối ⟹ dừng hỏi).
- Mọi file khác: **một làn tại một thời điểm**; file đổi làn chỉ theo bảng _Tự kiểm chéo_ (làn trước xong gói, đã ở `int`, làn sau kéo về rồi mới sửa).
  Gói cần file của làn kia ngoài bảng ⟹ dừng, ghi _Bàn giao_ ở PROGRESS.

### Tự kiểm chéo (file xuất hiện ở nhiều gói)

| File (`m/` = `src/modules/`)                                                                                                                  | Gói                                                  | Làn                                |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| `prisma/models/catalog.prisma`                                                                                                                | P1 → P9a (cuối file, `Vendor`), P9b, P11, P12a, P12b | biz P1 → tech (P9b sau khi kéo P1) |
| `prisma/models/licensing.prisma`, `budgets.prisma`, `requests.prisma`                                                                         | P3 → P11, P12a, P12b                                 | biz P3 → tech (sau khi kéo P3)     |
| `prisma/models/organization.prisma` (quan hệ ngược)                                                                                           | P3, P9a, P11, P12a, P12b                             | chung, chỉ thêm dòng               |
| `m/catalog/subscription/subscription.dto.ts`, `subscription.mapper.ts`, `subscription.service.ts`                                             | P1 → P9b, P15, P21                                   | biz P1 → tech                      |
| `m/catalog/subscription/subscription.repo.ts`, `subscription-change.service.ts`, `subscription.errors.ts`, `subscription.http-errors.ts`      | P1 → P9b, P21                                        | biz P1 → tech                      |
| `m/catalog/subscription/subscription-view.service.ts`                                                                                         | P9b, P15                                             | tech                               |
| `m/catalog/plan/plan.mapper.ts`, `plan.repo.ts`, `plans.controller.ts` (+ `plan-facts`/`vendor-admin-*` đọc `PlanRepo`)                       | P1 → P9b                                             | biz P1 → tech                      |
| `src/cli/seed/steps/catalog.steps.ts`, `catalog.steps.spec.ts`, `src/cli/seed/fixture/shared-demo-v4/catalog.ts`                              | P1 → P9b, P22a                                       | biz P1 → tech                      |
| `test/http/catalog/subscriptions.http-spec.ts`                                                                                                | P1 → P9b, P21                                        | biz P1 → tech                      |
| `m/catalog/README.md`, `m/licensing/README.md`, `m/budgets/README.md`                                                                         | P1 → P23                                             | biz P1 → tech                      |
| `m/budgets/budget/invoice.repo.ts`                                                                                                            | P3 → P12b                                            | biz P3 → tech                      |
| `m/catalog/public/catalog-responsibility.api.ts`, `m/catalog/application-responsibility/responsibility-handover.service.ts`                   | P9b, P14                                             | tech                               |
| `m/licensing/license-key/license-key.repo.ts`                                                                                                 | P12a                                                 | tech                               |
| `m/licensing/device-activation/device-activation.repo.ts`                                                                                     | P12a, P20b                                           | tech                               |
| `m/licensing/assignment/occupancy/seat-usage-occupancy.service.ts` (đợt 2 cuối — DL-2)                                                        | P20b, P15                                            | tech                               |
| `m/licensing/device-activation/device-activation-query.service.ts`, `m/devices/initial-record/initial-record-activation.service.ts` (DL-3)    | P20b                                                 | tech                               |
| `m/catalog/public/subscription-period.api.ts`, `subscription-period.types.ts`, `m/catalog/subscription/period/subscription-period.service.ts` | P2, P5, P8, P18                                      | biz                                |
| `m/catalog/public/catalog.api.ts`                                                                                                             | P2, P16a                                             | biz                                |
| `m/catalog/subscription/seat-target.service.ts`                                                                                               | P16a, P13a, P20                                      | biz                                |
| `m/catalog/subscription/obligation/subscription-obligation.policy.ts`                                                                         | P5, P10                                              | biz                                |
| `m/catalog/subscription/pool/subscription-pool.service.ts`                                                                                    | P10, P16a                                            | biz                                |
| `m/requests/access-request/pricing.policy.ts`                                                                                                 | P2, P4, P13a                                         | biz                                |
| `src/core/term-limit.ts`                                                                                                                      | P2, P13a                                             | biz                                |
| `m/requests/grant/seat-release.policy.ts`, `seat-release.service.ts`                                                                          | P4, P13a, P13b                                       | biz                                |
| `m/requests/year-start-commitments/year-start-commitments-batch.service.ts`, `year-start-commitments.policy.ts`                               | P4, P13b                                             | biz                                |
| `m/requests/grant/access-request-grant.listener.ts`                                                                                           | P8, P20                                              | biz                                |
| `m/requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts`                                                           | P6, P8                                               | biz                                |
| `m/requests/purchase-invoice/purchase-invoice-plan.service.ts`, `purchase-invoice.dto.ts`                                                     | P6, P16b, P20                                        | biz                                |
| `m/requests/purchase-invoice/purchase-invoice-submission.service.ts`                                                                          | P16b, P20                                            | biz                                |
| `m/budgets/invoice/purchase-invoice-recorder.service.ts`                                                                                      | P6, P13b, P20                                        | biz                                |
| `m/budgets/public/budgets.api.ts`, `budgets.types.ts`                                                                                         | P4, P6, P7, P13b                                     | biz                                |
| `m/budgets/budget/running-uncommitted.policy.ts`, `running-uncommitted-facts.service.ts`                                                      | P7, P13b                                             | biz                                |
| `m/budgets/shared-pool-line/shared-pool-line.repo.ts`                                                                                         | P3                                                   | biz                                |
| `m/budgets/shared-pool-line/shared-pool-line.policy.ts`, `shared-pool-line-facts.service.ts`, `shared-pool-line-label.policy.ts`              | P5, P19, P20                                         | biz                                |
| `m/budgets/review/budget-review-period-writer.service.ts`                                                                                     | P4, P5                                               | biz                                |
| `m/licensing/shared-pool/shared-pool.policy.ts`                                                                                               | P2, P8, P16a                                         | biz                                |
| `m/licensing/shared-pool/shared-pool.service.ts`                                                                                              | P8, P16a, P13a, P20                                  | biz                                |
| `m/licensing/shared-pool/shared-pool-capacity.repo.ts`                                                                                        | P16a, P20                                            | biz                                |
| `m/licensing/shared-pool/seat-purchase.dto.ts`, `seat-purchase-route.service.ts`                                                              | P16b, P17                                            | biz                                |
| `m/licensing/provisioning/tasks/provisioning-grant-writer.service.ts`                                                                         | P16a, P13a, P17, P20                                 | biz                                |
| `m/licensing/public/licensing-seat-month.api.ts`, `licensing-seat-month.types.ts`                                                             | P5, P7                                               | biz                                |
| `m/licensing/subscription-renewal/subscription-renewal-sweep.service.ts`                                                                      | P10, P16b, P18                                       | biz                                |
| `m/licensing/subscription-renewal/subscription-renewal-view.service.ts`                                                                       | P18, P19                                             | biz                                |
| `m/licensing/subscription-renewal/savings/renewal-savings.repo.ts`, `renewal-savings.service.ts`                                              | P3, P8, P18                                          | biz                                |
| `m/catalog/subscription-line/purchase/seat-purchase.policy.ts`, `seat-purchase.service.ts`                                                    | P16b, P17                                            | biz                                |
| `m/optimization/usage-rules/potential-saving.policy.ts`                                                                                       | P2, P8, P13a                                         | biz                                |

Kiểm: file có cả `biz` và `tech` chỉ ở dạng **"biz Px → tech"** (đổi tay một lần, sau khi gói biz đã ở `int` và `tech` đã kéo về) hoặc ở danh sách
file chung; không file nào bị hai làn sửa **cùng lúc**. Mọi chiều đổi tay là `biz → tech`, xảy ra sớm (sau P1, P3 — hai gói đầu của `biz`), không có
chiều `tech → biz` trước C2. Thư mục mới chia theo file (`m/catalog/workspace/` = tech; `m/catalog/subscription-line/`: repo + controller/dto/service/
mapper/errors = tech; `subscription-line.policy.ts`, `ledger/*` trừ repo, `purchase/*` trừ repo, `correction/*` = biz; `m/catalog/license-lot/`:
repo/controller/dto/service/policy/mapper/errors/`license-lot-lock.service.ts` = tech; `license-lot-price.policy.ts`, `license-lot-stock.service.ts`
= biz; `m/budgets/commitment/month/`: repo = biz (P3), còn lại = biz; `m/budgets/shared-pool-line/`: `shared-pool-line.repo.ts` = biz (P3),
`license-lot-charge.repo.ts` = tech (P12a), còn lại = biz; `m/licensing/subscription-renewal/`: `savings/*` = biz, `lines/*.repo.ts` = tech, còn lại = biz).

## Cửa giữa hai làn (thay điểm gộp G1…G8)

| Cửa | Khi                                                            | Làm                                                                                                                                                     |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `biz` xong P8 ⟹ cắt `pr/redesign-w3-b1`, mở **PR B1 → `dev`**  | `tech` đẩy P9a + P9b (đã xong trên nhánh từ trước) vào `int` ⟹ `biz` làm P10 ngay. Nếu P9b chưa xong: `biz` làm việc lấp (bảng dưới), không kéo code B3 |
| C2  | `biz` xong P10 ⟹ cắt `pr/redesign-w3-b2`, mở **PR B2 → `dev`** | `tech` đẩy mọi gói B3 đã xong theo thứ tự (P11 → P12a → P20b → P12b → P21 → P14 …) ⟹ `biz` làm P16a ngay                                                |
| —   | sau C2                                                         | đẩy từng gói ngay khi xong (cả hai làn đều trên `int`); phụ thuộc "… ở int" trong bảng _Gói_ là điều kiện duy nhất                                      |
| C3  | cả hai làn xong P23                                            | cắt `pr/redesign-w3-b3`, **PR B3 → `dev`** (CI full xanh)                                                                                               |

**Ước lượng chặn và việc lấp** (đếm theo số gói; L ≈ 2 M, S ≈ ½ M; `biz` ≈ 19 M trước P23, `tech` ≈ 12 M):

| Có thể bị chặn                                      | Khi nào                                      | Khả năng                                              | Việc lấp                                                                                                                                                                                                                            |
| --------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tech` P9b chờ P1 ở `int`                           | sau P9a (≈ 1,5 M), P1 là gói đầu `biz` (1 M) | thấp                                                  | phần P9a còn lại; integration M4 viết trước                                                                                                                                                                                         |
| `tech` P11 chờ P3 ở `int`                           | sau P9b (≈ 2 M), P3 là gói thứ 2 `biz`       | thấp                                                  | —                                                                                                                                                                                                                                   |
| `biz` P10 chờ P9b (C1)                              | sau P8 (≈ 8 M)                               | rất thấp (P9b xong ≈ 2 M)                             | —                                                                                                                                                                                                                                   |
| `biz` P16a chờ P11 (C2); P13a chờ P12b; P20 chờ P14 | sau P10 (≈ 9 M), P13a ≈ 10 M, P20 ≈ 18 M     | rất thấp (`tech` có P11 ≈ 3 M, P12b ≈ 5 M, P14 ≈ 7 M) | —                                                                                                                                                                                                                                   |
| `tech` P14 bước cổng admin chờ P10 ở `int`          | `tech` ≈ 6,5 M, P10 xong ≈ 9 M               | **trung bình**                                        | làm P14 trừ bước cổng (ghi _Bàn giao_), quay lại sau C2; giữa chừng: integration/http B1 trên Docker cho PR B1                                                                                                                      |
| `tech` P15 chờ P16a ở `int`                         | `tech` ≈ 7 M, P16a xong ≈ 10 M               | **cao** (≈ 3 M)                                       | **Docker cho PR B1/PR B2** (nhánh `fix/redesign-w3-b<n>-tests` từ nhánh chụp) (CI full xanh là điều kiện PR — chỉ `tech` có Docker): chạy integration/http/seed, sửa test/fixture, ghi `FIX-TEST-tech.md`; P22a phần không cần dòng |
| `tech` P22b chờ P13a, P16b → P20 ở `int`            | `tech` ≈ 10 M, P20 xong ≈ 19 M               | **cao** (dồn cuối)                                    | Docker cho từng gói B3 vừa đẩy (cả gói `biz`); module card theo _Bàn giao_; P23 tech chuẩn bị (`arch:graph`, `arch:routes`); `FIX-TEST`                                                                                             |

Làn `tech` ít việc hơn ≈ 7 M: phần dư dành cho chạy test thật trên Docker (thay CI đỏ mù như đợt 2) — không chuyển luật tiền sang `tech`.

Thứ tự trong làn: **biz** P1 → P3 → P2 → P4 → P5 → P6 → P7 → P8 → (C1) P10 → (C2) P16a → P13a → P13b → P16b → P17 → P18 → P19 → P20 → P23;
**tech** P9a → P9b → P11 → P12a → P20b → P12b → P21 → P14 → P15 → P22a → P22b → P23. Đổi so với bản 2.3: P1, P3 sang `biz`; P9 tách; P21 trước P14;
P16a lên trước P13a (cùng làn, file chung chỉ trong `biz`; P16a chỉ cần P11 — mở khóa P15 sớm hơn ≈ 2 M); P22 tách a/b. Không đổi luật.

## Bộ kiểm nhanh (mỗi gói, mỗi commit)

```text
pnpm typecheck
pnpm lint                      # chậm: pnpm exec eslint <file…>
pnpm arch:check
pnpm arch:capabilities --module <module đã chạm>
pnpm rules:check               # + pnpm rules:format khi sửa docs/rules, README module
pnpm test:gates
pnpm openapi:export && git --no-pager diff --stat openapi.json
CI=true pnpm test -- <mọi *.spec.ts đã chạm/thêm>
pnpm prisma:validate && pnpm prisma:generate   # gói có prisma/
```

- Không chạy `pnpm check`, `test:http`, `test:integration`, `test:e2e`, seed, Docker, migration ở máy — **trừ** việc lấp của làn `tech` (Docker của Bảo,
  trên nhánh `fix/redesign-w3-b<n>-tests` tách từ nhánh chụp, chỉ sửa test/fixture, merge vào nhánh chụp rồi `int`). Test http/integration mới **viết** trong gói,
  CI GitHub chạy cuối làn.
- Luật mới: unit đỏ trước, rồi xanh. Ví dụ số của SPEC là ca kiểm **bắt buộc** (mỗi bảng tiêu chí ⟹ một `it.each`); mỗi luật tiền có ca biên + ca
  diệt đột biến (SPEC §11).
- Test cũ khẳng định hành vi cũ: unit của chính luật sửa ngay; http/integration ⟹ `FIX-TEST-<làn>.md`.
- File sát trần 500 dòng: `m/catalog/subscription/subscription.repo.ts`, `m/licensing/assignment/assignment.service.ts`,
  `m/licensing/assignment/assignment.repo.ts`, `m/licensing/provisioning/provisioning-task.repo.ts`. Vượt ⟹ tách theo chức năng, không suppression.
  `m/catalog/subscription/` đã đủ trần: không thêm file vào thư mục đó.

## Gói

| #    | Gói                                                                                                                                          | Mục W3                                          | Cỡ  | Làn     | Phụ thuộc                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --- | ------- | ------------------------------------------------------------------------------ |
| P1   | M1, giá tháng (DTO), kỳ cam kết định mua, từ vựng, thông báo giảm seat                                                                       | W3-01, W3-02 (ghi/đọc), W3-03                   | M   | biz     | điều kiện                                                                      |
| P3   | M2, M3, repo tháng cam kết, cột kho, tham số                                                                                                 | W3-07/05/06/09 (dữ liệu)                        | M   | biz     | P1                                                                             |
| P2   | Một phép quy đổi giá tháng; tháng lịch `K2`                                                                                                  | W3-02 (tính)                                    | M   | biz     | P1                                                                             |
| P4   | Cam kết theo tháng: giữ, áp, giải phóng, chốt, dọn năm                                                                                       | W3-07 (biz)                                     | M   | biz     | P2, P3                                                                         |
| P5   | Dòng kho seat-ngày, nhãn (2)(3), tỷ lệ 10 %                                                                                                  | W3-04, W3-06, W3-01 (`unallocated`)             | M   | biz     | P4                                                                             |
| P6   | Số kỳ vọng hóa đơn `K2`, ngưỡng, `SBF-11a`                                                                                                   | W3-05                                           | M   | biz     | P5                                                                             |
| P7   | Chi phí đang chạy không cam kết (`K2`)                                                                                                       | W3-08                                           | M   | biz     | P4                                                                             |
| P8   | Ba con số tiết kiệm                                                                                                                          | W3-09                                           | M   | biz     | P6 ⟹ **C1** (PR B1; mô tả PR ghi W3-03 xóa `increasesObligation` ở P10 — SPEC) |
| P9a  | M4 phần 1, bảng/model workspace, module `catalog/workspace/` (route + admin + người phụ trách), `WorkspaceApi`                               | W3-10, W3-13 (phần workspace)                   | M   | tech    | điều kiện                                                                      |
| P9b  | M4 phần 2, trường thuê bao (`workspaceId`, `seatCounting`, …), gói ↔ workspace, nơi đọc hồ sơ cũ, `VendorAdminRole`, khóa workspace, seed B2 | W3-11 (tech), W3-14 (khóa), W3-10 (gói)         | M   | tech    | P9a + **P1 ở int**                                                             |
| P10  | Cổng ≥ 2 admin, thông báo admin, trùng, theo thành viên, xóa `increasesObligation`                                                           | W3-11 (biz), W3-12, W3-14, W3-03                | M   | biz     | C1 (P9b ở int) ⟹ **C2** (PR B2)                                                |
| P11  | M5a, M5, repo dòng/sổ/lần mua/mục tiêu/ca tự ghi                                                                                             | W3-15/16/21 (dữ liệu)                           | M   | tech    | P9b + **P3 ở int**                                                             |
| P12a | M6 (lô, 6 hàm), repo lô/khóa/phí                                                                                                             | W3-24, W3-25 (dữ liệu)                          | M   | tech    | P11                                                                            |
| P20b | Chuyển code đợt 2 sang lô; `LicenseLotApi`; tồn `LICENSES`; bỏ `K1` ở tồn; `seat-usage`                                                      | W3-24 (K-B3), W3-17 (mục 5)                     | M   | tech    | P12a                                                                           |
| P12b | M7, repo phân bổ hóa đơn, cột `K1`                                                                                                           | W3-17/23 (dữ liệu)                              | S   | tech    | P20b                                                                           |
| P21  | Bỏ ô sửa tay, `isPrimaryForPlan`, khai `K1`/`PERPETUAL`                                                                                      | W3-27                                           | S   | tech    | P12b                                                                           |
| P14  | Route lô, người phụ trách lô, nhập khóa vào lô, route cũ, hợp đồng                                                                           | W3-24 (tech)                                    | M   | tech    | P21; bước cổng admin: **P10 ở int**                                            |
| P16a | Sổ (facade), chọn dòng, lối tắt khi cấp, mang quyền mua kỳ sau, xóa `addSeat`                                                                | W3-16 (biz), W3-15 (chọn dòng), W3-18 (lối tắt) | M   | biz     | C2 (**P11 ở int**)                                                             |
| P13a | `K1` không thuê bao, `K1` năm, hợp đồng ngắn, xin lại                                                                                        | W3-17                                           | M   | biz     | P16a + **P12b, P21 ở int**                                                     |
| P13b | Phân bổ hóa đơn `K1` năm, cam kết 01/01 áp ngay, không cam kết `K1`                                                                          | W3-23                                           | M   | biz     | P13a                                                                           |
| P15  | Route dòng, `lines[]` khi khai, sổ (đọc), `seat-usage` theo dòng                                                                             | W3-15 (tech)                                    | M   | tech    | P14 + **P16a ở int**                                                           |
| P16b | Route mua thêm seat, hóa đơn gắn lần mua, nhắc hạn, dòng _Nhà cung cấp thu tới_                                                              | W3-18, W3-20                                    | M   | biz     | P13b                                                                           |
| P17  | Nhảy bậc, ghi theo hãng, giảm giữa kỳ, đổi loại seat, theo thành viên                                                                        | W3-19                                           | M   | biz     | P16b                                                                           |
| P18  | Gia hạn theo dòng, chốt mục tiêu, tự gia hạn, đóng dòng `ENDED`                                                                              | W3-21                                           | L   | biz     | P17                                                                            |
| P19  | Nhãn (1), `KPI-4`, dòng kho theo sổ                                                                                                          | W3-22                                           | M   | biz     | P18                                                                            |
| P20  | Cấp `K4` từ lô, giá Request `K4`, tiền `K4`, ghost seat `K4`                                                                                 | W3-24 (biz), W3-25, W3-26                       | L   | biz     | P19 + **P12a, P20b, P14 ở int**                                                |
| P22a | Seed B3 phần lô + khóa, dòng khi khai (JetBrains, Visio, Sublime, Office LTSC, Claude Team 2 dòng, Microsoft hai thuê bao)                   | W3-28                                           | M   | tech    | P15                                                                            |
| P22b | Seed B3 phần `K1`, cấp từ lô, mua thêm seat, bậc Zoom, gia hạn `lines[]`, `budget-targets` đọc giá dòng                                      | W3-28                                           | M   | tech    | P22a + **P13a, P16b, P17, P18, P20 ở int**                                     |
| P23  | Chốt đợt: generator, module card, rule, `FIX-TEST`                                                                                           | —                                               | S   | mỗi làn | P1–P22b ⟹ **C3** (PR B3)                                                       |

Migration: M1 (P1), M2 + M3 (P3) — làn `biz`; M4 (P9a phần 1, P9b phần 2), M5a + M5 (P11), M6 (P12a), M7 (P12b) — làn `tech`. **M3, M5a không đảo được**: file
riêng, chỉ giá trị enum.

---

## Chi tiết gói

Mỗi gói: **File** (đủ tên; `*` = file chung chỉ thêm dòng), **Làm**, **Kiểm** (ngoài bộ kiểm nhanh; test http/integration chỉ viết), **Xong khi**.
Mọi gói đổi contract: `openapi.json` + manifest (`*`); mô tả OpenAPI không mã nội bộ.

### P1 — biz · M (bản 2.4: chuyển từ tech — B1 trọn một làn)

- **File:** `prisma/models/catalog.prisma`; `prisma/migrations/20261201000000_w3_monthly_price/migration.sql`;
  `m/catalog/subscription/subscription.dto.ts`, `subscription.mapper.ts`, `subscription.repo.ts`, `subscription.service.ts` (+spec),
  `subscription-change.service.ts` (+spec), `subscription-change-guard.service.ts`, `subscriptions.controller.ts`, `subscription.errors.ts`_,
  `subscription.http-errors.ts`_; `m/catalog/subscription/seat-increase/subscription-seat-increase.policy.ts` (+spec),
  `subscription-seat-increase.service.ts` (+spec); `m/catalog/plan/plan.dto.ts`, `plan.mapper.ts`, `plan.repo.ts`, `plan.service.ts` (+spec),
  `plans.controller.ts`, `plan.errors.ts`_, `plan.http-errors.ts`_; `m/licensing/license-key/license-key-template.policy.ts` (+spec);
  bốn file thông báo chung* (`notifications.types.ts`, `inbox.policy.ts`, `notification-texts-subscription.types.ts`, `notification-target.policy.ts` — đường dẫn ở _Hai làn_); `m/catalog/README.md`, `m/licensing/README.md`, `m/budgets/README.md`; `src/cli/seed/steps/catalog.steps.ts`,
  `catalog.steps.spec.ts`, `src/cli/seed/fixture/shared-demo-v4/catalog.ts`; `test/integration/catalog/subscription-monthly-price-migration.integration-spec.ts`;
  `test/http/catalog/subscriptions.http-spec.ts`.
- **Làm:** SPEC-B1 W3-01 (trừ mô tả `unallocated`), W3-02 mục 1, 4, 5 (ghi/đọc trường, M1, khối kiểm), W3-03 (thông báo giảm, mã
  `SUBSCRIPTION_SEATS_REDUCED` §8.2).
- **Kiểm:** `pnpm prisma:validate`, `pnpm prisma:generate`; unit bảng W3-02 phần ghi, W3-03 người nhận.
- **Xong khi:** ca ghi/đọc của bảng W3-02 và sáu ca W3-03 có unit/http; khối kiểm M1 có câu `SELECT` trong commit message.

### P2 — biz · M

- **File:** `m/catalog/subscription/price/subscription-price.policy.ts` (+spec), `subscription-price.service.ts`;
  `m/catalog/subscription/period/subscription-period.service.ts`, `subscription-period.repo.ts`; `m/catalog/public/subscription-period.api.ts`,
  `subscription-period.types.ts`, `catalog.api.ts`; `m/budgets/cycle/baseline.policy.ts` (+spec); `m/requests/access-request/pricing.policy.ts`
  (+spec); `src/core/term-limit.ts` (+spec); `m/optimization/usage-rules/potential-saving.policy.ts` (+spec); `m/licensing/shared-pool/shared-pool.policy.ts`
  (+spec).
- **Làm:** SPEC-B1 W3-02 mục 2, 3 (tháng lịch `K2`, `calendarMonthsIn`), 5 (lần mua đầu, `NULL` ⟹ 12).
- **Xong khi:** sáu chỗ của bảng hiện trạng W3-02 đọc một nguồn; `it.each` bảng W3-02 (phần tính) xanh, gồm ca diệt `ceil`/`floor`.

### P3 — biz · M (bản 2.4: chuyển từ tech)

- **File:** `prisma/models/budgets.prisma`, `licensing.prisma`, `requests.prisma`; `prisma/migrations/20261201000100_w3_commitment_months_pool_figures/migration.sql`,
  `prisma/migrations/20261201000200_w3_release_and_outcome_values/migration.sql`; **mới** `m/budgets/commitment/month/commitment-month.repo.ts`,
  `m/budgets/shared-pool-line/shared-pool-line.repo.ts`, `m/licensing/subscription-renewal/savings/renewal-savings.repo.ts`;
  `m/budgets/budget/invoice.repo.ts`, `m/budgets/review/budget-review.repo.ts`; `m/operating-parameters/parameter-definitions.policy.ts` (+spec);
  `test/integration/budgets/commitment-month-repo.integration-spec.ts`.
- **Làm:** W3-07 mục 1 (bảng tháng cam kết), cột W3-04/05/09 (CHECK `invoices_pool_figures`), M3 (enum + CHECK `mismatches`), ba tham số.
- **Kiểm:** integration CHECK `applied + released ≤ share`, trigger bất biến, CHECK `invoices_pool_figures`.
- **Thêm file (bản 2.4):** `prisma/models/organization.prisma`* nếu bảng mới có quan hệ `Organization`.
- **Xong khi:** repo có đủ phương thức P4–P6 cần (cùng làn — không cần _Bàn giao_).

### P4 — biz · M

- **File:** **mới** `m/budgets/commitment/month/commitment-month.policy.ts` (+spec), `commitment-month-settlement.service.ts` (+spec);
  `m/budgets/commitment/commitment.service.ts`; `m/budgets/budget/commitment.repo.ts`, `commitment-release.policy.ts` (+spec);
  `m/budgets/seat-month/seat-month.policy.ts`, `seat-month-plan.policy.ts`, `seat-month-subscription.service.ts`, `seat-month.service.ts`,
  `seat-month.job.ts`; `m/budgets/review/budget-review-period-writer.service.ts`; `m/budgets/public/budgets.api.ts`, `budgets.types.ts`;
  `m/requests/spend-effects/spend-effects.service.ts`; `m/requests/access-request/pricing.policy.ts`;
  `m/requests/year-start-commitments/year-start-commitments-batch.service.ts`, `year-start-commitments.policy.ts` (+spec);
  `m/requests/grant/seat-release.policy.ts` (+spec), `seat-release.service.ts`; `test/integration/budgets/commitment-month-settlement.integration-spec.ts`.
- **Làm:** SPEC-B1 W3-07 mục 2–9. Thứ tự khóa: comment đầu `commitment-month-settlement.service.ts`.
- **Kiểm:** integration ca A–L (H: hai connection, barrier, lặp 20).
- **Xong khi:** 22 ca W3-07 (A → M, F1, F2, F3, F3', F6, F15) có test; `Σ applied + Σ released = amount` cuối năm ở mọi ca.

### P5 — biz · M

- **File:** **mới** `m/budgets/shared-pool-line/shared-pool-line.policy.ts` (+spec), `shared-pool-line-label.policy.ts` (+spec),
  `shared-pool-line-facts.service.ts` (+spec), `shared-pool-line-alert.service.ts` (+spec); `m/budgets/seat-month/seat-month-pool.policy.ts`,
  `seat-month-pool.service.ts`, `seat-month.dto.ts`, `seat-month-query.service.ts`; `m/budgets/budget-view/budget-table-view.service.ts`,
  `budget-view.mapper.ts`; `m/budgets/budget/budget.dto.ts`; `m/budgets/review/budget-review-pool-watch.service.ts`, `budget-review.policy.ts`,
  `budget-review-snapshot.service.ts`, `budget-review-period-writer.service.ts`, `budget-review-reminder.service.ts` (+spec), `budget-review.dto.ts`;
  `m/catalog/subscription/period/subscription-period.service.ts`; `m/catalog/public/subscription-period.api.ts`, `subscription-period.types.ts`;
  `m/catalog/subscription/obligation/subscription-obligation.policy.ts` (+spec; `earliestReducibleOn`); `m/licensing/public/licensing-seat-month.api.ts`,
  `licensing-seat-month.types.ts`; bốn file thông báo chung* (`IDLE_SEAT_COST_RATIO_HIGH`);
  `test/integration/budgets/shared-pool-line-identity.integration-spec.ts`, `test/http/budgets/seat-month-charges.http-spec.ts`.
- **Làm:** SPEC-B1 W3-04, W3-06, mô tả `unallocated` (W3-01).
- **Xong khi:** bảng W3-04 (11 ca), W3-06 (8 ca) xanh; không mục `NESTED_ARRAYS` mới.

### P6 — biz · M

- **File:** **mới** `m/requests/purchase-invoice/pool-expectation/purchase-invoice-pool-expectation.policy.ts` (+spec);
  `m/requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts` (+spec); `m/requests/purchase-invoice/purchase-invoice-plan.service.ts`,
  `purchase-invoice.dto.ts`, `purchase-invoice.mapper.ts`; `m/requests/invoice-discrepancy/invoice-discrepancy-closure.policy.ts` (+spec),
  `invoice-discrepancy-closure.service.ts`, `invoice-discrepancy-opening.service.ts`, `invoice-discrepancy.types.ts`;
  `m/requests/invoice-discrepancy-queue/invoice-discrepancy.dto.ts`, `invoice-discrepancy.mapper.ts`; `m/budgets/invoice/purchase-invoice-recorder.service.ts`;
  `m/budgets/public/budgets.api.ts`, `budgets.types.ts`; bốn file thông báo chung* (`SUBSCRIPTION_PRICE_REVIEW`);
  `test/http/requests/purchase-invoice-confirmation.http-spec.ts`, `test/integration/requests/purchase-invoice-pool-variance.integration-spec.ts`.
- **Làm:** SPEC-B1 W3-05.
- **Xong khi:** 14 ca W3-05 có test; một hồ sơ mỗi hóa đơn gộp `mismatches`.

### P7 — biz · M

- **File:** **mới** `m/budgets/budget/running-uncommitted.policy.ts` (+spec), `running-uncommitted-facts.service.ts` (+spec);
  `m/licensing/public/licensing-seat-month.api.ts`, `licensing-seat-month.types.ts`; `m/licensing/assignment/assignment-seat-month.repo.ts`;
  `m/budgets/public/budgets.api.ts`, `budgets-read.api.ts`, `budgets.types.ts`; `m/requests/spend/budget-check.policy.ts` (+spec),
  `budget-check.service.ts`; `m/budgets/budget-view/budget-view-numbers.service.ts`; `test/http/budgets/budget-summary.http-spec.ts`.
- **Làm:** SPEC-B1 W3-08.
- **Xong khi:** 13 ca W3-08 (gồm 3 ca F7, ca F15b); kiểm tra ngân sách gửi và duyệt cùng số.

### P8 — biz · M

- **File:** `m/optimization/usage-rules/potential-saving.policy.ts` (+spec), `usage-rules-seat.service.ts`; `m/catalog/public/subscription-period.api.ts`;
  `m/licensing/shared-pool/shared-pool.policy.ts`, `shared-pool.service.ts`; `m/licensing/public/licensing.api.ts`; **mới**
  `m/licensing/subscription-renewal/savings/renewal-savings.policy.ts` (+spec), `renewal-savings.service.ts` (+spec);
  `m/licensing/subscription-renewal/outcome/renewal-outcome.policy.ts`, `renewal-outcome.service.ts`; `m/requests/grant/access-request-grant.listener.ts`
  (+spec); `m/requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts`;
  `test/integration/licensing/realised-saving-on-invoice.integration-spec.ts`.
- **Làm:** SPEC-B1 W3-09.
- **Xong khi:** 17 ca W3-09; không còn ghi tiết kiệm thực lúc IT ghi kết quả.

### P9a — tech · M (bắt đầu ngay, song song B1)

- **File:** `prisma/models/catalog.prisma` (**chỉ** model `Workspace`, `WorkspaceAdmin` thêm **cuối file** + trường quan hệ ở khối `Vendor`; không chạm
  khối `Plan`, `Subscription`, `PlanWorkspace*` — đang là của P1), `prisma/models/organization.prisma`* (quan hệ ngược `Organization`/`Employee`);
  `prisma/migrations/20261202000000_w3_workspaces/migration.sql` (M4 phần 1: bảng `workspaces`, `workspace_admins`, backfill từ hồ sơ theo gói, khối
  kiểm — không đổi cột `plans`/`subscriptions`);
  **mới** `m/catalog/workspace/workspaces.controller.ts`, `workspace.dto.ts`, `workspace.service.ts` (+spec), `workspace-admins.service.ts` (+spec),
  `workspace-responsible.service.ts` (+spec), `workspace.policy.ts` (+spec), `workspace.repo.ts`, `workspace.mapper.ts`, `workspace.errors.ts`,
  `workspace.http-errors.ts`; **mới** `m/catalog/public/workspace.api.ts`; `m/catalog/catalog.module.ts`_; `test/gates/api-collection-contract.gate-spec.ts`_
  (`workspaceGet#admins`); `test/integration/catalog/workspace-migration.integration-spec.ts`, `test/http/catalog/workspaces.http-spec.ts`.
  **Không** sửa `m/catalog/plan/*` (đọc `PlanRepo` của P1) — nơi đọc hồ sơ cũ ở P9b.
- **Làm:** SPEC-B2 W3-10 phần workspace (bảng, route Super Admin, admin, người phụ trách), W3-13 (route cũ ghi vào workspace — phần trong module mới).
- **Kiểm:** integration ca gộp hồ sơ Anthropic + dừng `K3`; http route workspace.
- **Xong khi:** tiêu chí W3-10 phần workspace, W3-13 phần module mới; gate collection xanh hoặc dừng hỏi. Không đẩy lên `int` trước C1.

### P9b — tech · M (sau khi kéo P1 về nhánh)

- **File:** `prisma/models/catalog.prisma` (khối `Subscription`, `Plan`: trường M4); `prisma/migrations/20261202000100_w3_subscription_workspace/migration.sql`
  (M4 phần 2: cột `plans`/`subscriptions`, backfill `workspace_id`); `m/catalog/plan/plans.controller.ts`, `plan.mapper.ts`, `plan.repo.ts`
  (`findProfile`/`findProfilesOf`/`findWorkspaceDuties` đọc qua workspace), `plan-workspace.service.ts` (+spec), `plan-facts.service.ts`,
  `vendor-admin-minimum.service.ts`, `vendor-admin-roles.service.ts`, `vendor-admin-roles.policy.ts`; `m/catalog/public/catalog-responsibility.api.ts`,
  `catalog-responsibility.types.ts` (`VendorAdminRole` **chỉ thêm** trường — người gọi ở personnel không sửa); `m/catalog/application-responsibility/responsibility-handover.service.ts` (+spec);
  `m/catalog/subscription/subscription.dto.ts`, `subscription.mapper.ts`, `subscription.repo.ts`, `subscription.service.ts`, `subscription-change.service.ts`,
  `subscription-view.service.ts`, `subscription.errors.ts`_, `subscription.http-errors.ts`_; `src/cli/seed/steps/catalog.steps.ts`, `catalog.steps.spec.ts`,
  `src/cli/seed/fixture/shared-demo-v4/catalog.ts`; `test/http/catalog/plans.http-spec.ts`, `test/http/catalog/subscriptions.http-spec.ts`.
- **Làm:** SPEC-B2 W3-10 phần gói + nơi đọc hồ sơ cũ (B2-R5, `countWorkspacesBelowMinimum`; `CatalogApi.workspaceDutiesOf` giữ chữ ký — không sửa
  `catalog.api.ts`), W3-13 phần gói, W3-11 (lưu trường, mặc định workspace), W3-14 (khóa workspace FU
  trước kỳ trong `declareIn`/`complete`/đổi `workspaceId`); seed B2 (`POST /workspaces` + admin, `workspaceId`, Slack `MEMBERS`). `seats` của
  `subscriptionGet`/`subscriptionList` giữ `null` cho gói không `K2` (D-18 đợt 2).
- **Xong khi:** tám tiêu chí W3-10 (đủ cùng P9a), phần lưu W3-11 (ca 2, 4), W3-14 phần khóa.

### P10 — biz · M

- **File:** `m/catalog/subscription/pool/subscription-pool.policy.ts` (+spec), `subscription-pool.service.ts` (+spec);
  `m/catalog/subscription/obligation/subscription-obligation.policy.ts` (+spec; xóa `increasesObligation`); **mới**
  `m/licensing/subscription-renewal/alerts/workspace-admin-alert.service.ts` (+spec); `m/licensing/subscription-renewal/subscription-renewal-sweep.service.ts`
  (+spec); `m/personnel/event-notice/personnel-notifier.service.ts` (+spec), `m/personnel/it-handover/it-handover-milestone.service.ts` (+spec);
  `m/dashboards/it-admin/it-admin-dashboard.dto.ts`, `it-admin-dashboard-facts.service.ts`; `m/dashboards/progress/dashboard-progress.policy.ts` (+spec),
  `dashboard-progress.service.ts`, `dashboard-progress.dto.ts`; bốn file thông báo chung* (`WORKSPACE_ADMIN_NOT_WORKING`);
  `test/integration/catalog/workspace-admin-gate.integration-spec.ts`, `test/integration/catalog/subscription-duplicate-workspace.integration-spec.ts`,
  `test/http/catalog/subscription-workspace.http-spec.ts`.
- **Làm:** SPEC-B2 W3-11 (luật C4, ngày thanh toán, `hasAdjustmentPoint`), W3-12, W3-14 (luật trùng); SPEC-B1 W3-03 (xóa `increasesObligation`).
- **Kiểm:** integration khai đồng thời (barrier, lặp 20).
- **Ghi chú đợt 2 cuối (DL-7):** `PersonnelNotifier.toSuperAdmin` nhận `notice` là giá trị **hoặc** hàm `(superAdminId) => NoticeParts`, trả người đã
  nhận; `vendorAdminsGone` ở `personnel-notifier.service.ts:387-414`, gọi từ `it-handover-milestone.service.ts:42-44`. Super Admin vừa là người nhận
  dự phòng vừa là IT phụ trách workspace ⟹ một thông báo (như `departureAccessBlocked` R1-5).
- **Xong khi:** tám ca W3-12; ba tiêu chí W3-14; ca 1, 3 W3-11; `grep -rn increasesObligation src` = 0.

### P11 — tech · M

- **File:** `prisma/models/catalog.prisma`, `licensing.prisma`, `requests.prisma`; `prisma/migrations/20261203000000_w3_b3_enum_values/migration.sql`,
  `prisma/migrations/20261203000100_w3_subscription_lines_seat_ledger/migration.sql`; **mới** `m/catalog/subscription-line/subscription-line.repo.ts`,
  `m/catalog/subscription-line/ledger/seat-ledger.repo.ts`, `m/catalog/subscription-line/purchase/seat-purchase.repo.ts`,
  `m/licensing/subscription-renewal/lines/subscription-line-target.repo.ts`, `m/licensing/subscription-renewal/lines/subscription-renewal-auto.repo.ts`;
  `src/infrastructure/database/database-role-judgement.ts`; `prisma/models/organization.prisma`*; `test/integration/catalog/seat-ledger-constraints.integration-spec.ts`,
  `test/integration/catalog/subscription-lines-migration.integration-spec.ts`, `test/integration/catalog/subscription-line-unique.integration-spec.ts`.
- **Làm:** SPEC-B3 §1.1 (M5a, M5: `closed_on`, unique, mở sổ `GREATEST`, `DRAFT` không sổ, `RENEWAL` cho kỳ chưa bắt đầu, CHECK cửa, trigger sức chứa,
  `subscriptions_fit_plan`, `decider_role`, `purchase_invoices.seat_purchase_id`).
- **Kiểm:** integration append-only với owner, dưới số đang chiếm, unique `TOP_UP`, C1, mở sổ, dừng khi trùng.
- **Xong khi:** câu `SELECT` kiểm trùng ở commit message; repo có chữ ký P15, P16a, P18 cần (_Bàn giao_).

### P12a — tech · M

- **File:** `prisma/models/catalog.prisma`, `licensing.prisma`, `budgets.prisma`, `requests.prisma`; `prisma/migrations/20261203000200_w3_license_lots/migration.sql`;
  **mới** `m/catalog/license-lot/license-lot.repo.ts`, `m/budgets/shared-pool-line/license-lot-charge.repo.ts`; `m/licensing/license-key/license-key.repo.ts`;
  (M6 có hai unique của F14: `purchase_invoices(license_lot_id)` còn hiệu lực, `license_lots(request_id)` `REQUEST`);
  `m/licensing/device-activation/device-activation.repo.ts` (chỉ ánh xạ kiểu khi `subscriptionId` thành nullable: `purchaseId = licenseLotId ?? subscriptionId`,
  không đổi hành vi); `test/integration/catalog/license-lot-migration.integration-spec.ts`, `test/integration/licensing/license-lot-capacity.integration-spec.ts`.
- **Làm:** SPEC-B3 §1.2: bảng, cột, khối kiểm, backfill (cùng id), rồi `CREATE OR REPLACE` sáu hàm (năm của đợt 2 + `license_assignment_check_capacity`), CHECK `link_kind`, trigger bất biến hóa đơn, trigger `license_lots_capacity`.
- **Kiểm:** integration: lô cùng id, `cost_borne`, guard mới chặn đổi `license_lot_id`, kích hoạt đợt 2 vẫn đếm đúng sau M6.
- **Đợt 2 cuối (DL-1, DL-3):** `plans_keep_children_valid` viết trên bản `20261124133500_plans_keep_children_valid_device_binding_entry` (giữ
  `NULL → ACCOUNT`, `KEY_BINDING_ASSIGNMENTS`) — ca integration: gói `K4` `ACCOUNT` không lô, có quyền ⟹ đổi sang `DEVICE_KEY` vẫn 23514;
  `DeviceActivationRepo.keySubscriptionIds` trả `licenseLotId ?? subscriptionId` (kiểu giữ `string`). Thêm `prisma/models/organization.prisma`*.
- **Xong khi:** tiêu chí 1 W3-24; test kích hoạt đợt 2 hiện có (unit) xanh không sửa kỳ vọng.

### P20b — tech · M

- **File:** **mới** `m/catalog/public/license-lot.api.ts`, `m/catalog/license-lot/license-lot-lock.service.ts` (+spec);
  `m/licensing/device-activation/device-activation.service.ts` (+spec), `device-activation-close.service.ts` (+spec), `device-activation.repo.ts`,
  `device-activation.policy.ts` (+spec); `m/licensing/assignment/occupancy/assignment-seat-occupancy.listener.ts`; `m/catalog/public/catalog.extension-points.ts`;
  `m/licensing/stock-summary/stock-summary.policy.ts` (+spec), `stock-summary-query.service.ts`, `stock-summary.types.ts`;
  `m/licensing/public/licensing-device-activation.api.ts`; `m/catalog/catalog.module.ts`*; **thêm (đợt 2 cuối)**
  `m/licensing/device-activation/device-activation-query.service.ts`, `m/devices/initial-record/initial-record-activation.service.ts` (+spec; sắp khóa
  theo **lô** = thứ tự khóa 6a, DL-3), `m/licensing/assignment/occupancy/seat-usage-occupancy.service.ts` (+spec; DL-2).
- **Làm:** K-B3 — chuyển mọi chỗ đọc `subscriptionId`/`purchasedQuantity` của khoản mua sang `licenseLotId`/`licenseCount`; khóa lô qua
  `LicenseLotApi.lockLot` (6a) thay `CatalogApi.lockSeatTarget`; **giữ chữ ký** `LicensingDeviceActivationApi`; wire `lotId` đọc `license_lot_id`; comment
  tầng khóa `7b`; tồn `LICENSES` theo lô; bỏ dòng `HOLDERS` của `K1` (W3-17 mục 5). **Refactor giữ hành vi** — LUẬT CỨNG 2.
- **Đếm `K4` không hai lần (DL-2):** sau M6 `device_activation_occupied(lô)` đã gồm khóa `ASSIGNED` và quyền cũ không khóa ⟹ ở
  `assignment-seat-occupancy.listener.ts` và `SubscriptionSeatUsageService`, gói `K4` lấy **chỉ** số của lô (cùng id thuê bao cũ), `purchased` =
  `license_count`; gói khác giữ `countOccupying/countHolding` như cũ. Unit: cùng dữ liệu, số `K4` trước/sau bằng nhau.
- **Xong khi:** mọi unit device-activation/stock-summary/seat-usage/initial-record đợt 2 xanh **không** đổi kỳ vọng (trừ ca `K1` HOLDERS); commit message liệt kê mọi lần kiểm cũ giữ.

### P12b — tech · S

- **File:** `prisma/models/licensing.prisma`, `catalog.prisma`, `budgets.prisma`; `prisma/migrations/20261203000300_w3_personal_rights_allocations/migration.sql`;
  **mới** `m/budgets/invoice/invoice-allocation.repo.ts` (dòng bù trừ `kind`, bucket `POOL_LOT_DIFFERENCE` âm — F8, F12, F13c),
  `m/budgets/invoice/invoice-year-application.repo.ts` (bảng `invoice_year_applications` — F9); `m/budgets/budget/invoice.repo.ts` (`spentOf` đọc phân bổ); `m/budgets/seat-month/seat-month.repo.ts`
  (`yearTotals`); `m/licensing/assignment/assignment.repo.ts` (hai cột `K1`; trần 500 ⟹ tách `assignment-k1.repo.ts` nếu vượt);
  `test/integration/budgets/invoice-allocation-repo.integration-spec.ts`; `prisma/models/organization.prisma`*.
- **Làm:** SPEC-B3 §1.3.
- **Xong khi:** integration Σ phân bổ = `actual_cost_minor`; `spentOf` đọc dòng phân bổ khi có.

### P13a — biz · M

- **File:** `m/licensing/provisioning/tasks/provisioning-grant-writer.service.ts` (+spec), `provisioning-replacement.service.ts` (+spec);
  `m/licensing/shared-pool/shared-pool.service.ts`; `m/catalog/subscription/seat-target.service.ts`; `src/core/term-limit.ts` (+spec);
  `m/requests/access-request/access-request.policy.ts` (+spec), `pricing.policy.ts`, `access-request.errors.ts`_, `access-request.http-errors.ts`_;
  `m/requests/renewal-request/renewal-request.policy.ts` (+spec); `m/requests/grant/seat-release.policy.ts`, `seat-release.service.ts`;
  `m/optimization/usage-rules/potential-saving.policy.ts`; `test/integration/licensing/k1-without-subscription.integration-spec.ts`.
- **Làm:** SPEC-B3 W3-17 mục 1–4.
- **Xong khi:** bảy ca W3-17; cấp `K1` không chạm `subscriptions`/`seat_changes` (integration).

### P13b — biz · M

- **File:** **mới** `m/budgets/invoice/invoice-allocation.policy.ts` (+spec); `m/budgets/invoice/purchase-invoice-recorder.service.ts` (+spec);
  `m/budgets/budget/running-uncommitted.policy.ts`, `running-uncommitted-facts.service.ts`; `m/requests/year-start-commitments/year-start-commitments-batch.service.ts`,
  `year-start-commitments.policy.ts`; `m/budgets/public/budgets.api.ts`, `budgets.types.ts`; `test/integration/budgets/k1-annual-allocation.integration-spec.ts`.
- **Làm:** SPEC-B3 W3-23 (K-A1, K-A2, K-A3, F8 dòng bù trừ khi điều chuyển, F9 advisory/mốc/thứ tự). Thêm file:
  `m/requests/grant/seat-release.service.ts` (gọi chuyển phân bổ lúc ghi quyền mới — F8), `m/budgets/invoice/invoice-allocation-transfer.service.ts` (**mới**, +spec).
- **Xong khi:** mười một ca W3-23; hai thứ tự (hóa đơn trước/sau 01/01) cùng số; ca F9(a) integration barrier.

### P14 — tech · M

- **File:** **mới** `m/catalog/license-lot/license-lots.controller.ts`, `license-lot.dto.ts`, `license-lot.service.ts` (+spec),
  `license-lot-responsible.service.ts` (+spec), `license-lot.policy.ts` (+spec), `license-lot.mapper.ts`, `license-lot.errors.ts`, `license-lot.http-errors.ts`;
  `m/catalog/public/license-lot.api.ts` (`createLot`); **mới** `m/licensing/license-key/license-lot-create.controller.ts`, `license-lot-create.service.ts`
  (+spec), `license-lot-keys.controller.ts`, `license-lot-key-import.service.ts` (+spec); `m/licensing/license-key/license-keys.controller.ts`,
  `license-key.service.ts`, `license-key.dto.ts`; `m/catalog/contract/contract-subscription.service.ts`, `contract.errors.ts`_, `contract.http-errors.ts`_;
  `m/catalog/subscription/responsible/subscription-responsible.service.ts` (+spec); `m/catalog/public/catalog-responsibility.api.ts`;
  `m/catalog/application-responsibility/responsibility-handover.service.ts`; `m/catalog/catalog.module.ts`_, `m/licensing/licensing.module.ts`_;
  `test/http/catalog/license-lots.http-spec.ts`.
- **Làm:** SPEC-B3 W3-24: route (6), người phụ trách, nhập khóa (K-A6), route cũ (K-B4, K-B7), hợp đồng, `SBF-16` chuyển lô. Cổng admin cho lô gọi
  service của P10 (không chép). `REQUEST` kiểm người làm qua `ProvisioningTaskFrame.requireActingItAdmin`.
- **Đợt 2 cuối:** `licenseLotKeyImport` cùng thân `licenseKeyImport` (`keys: string[]`, `maxActivations?`, `initialActivationsUsed?`) qua
  `LicenseKeyImportSettingsService` + `assertInitialActivationsAllowed` (409 `LICENSE_KEY.INITIALIZATION_CLOSED`, 422 `INITIAL_ACTIVATIONS_*` — DL-4).
  Lô `REQUEST`: `ProvisioningTaskFrame.requireActingItAdmin` (`:134`); người thụ hưởng chưa xếp phòng ⟹ theo OQ-D1 (chưa chốt: không truyền
  `taskId`, 403 như SPEC).
- **Thứ tự trong gói:** bước cổng admin (gọi service P10) làm **cuối**; P10 chưa ở `int` ⟹ làm mọi phần khác, ghi _Bàn giao_, quay lại sau C2.
- **Xong khi:** tiêu chí 2, 4, 7, 8, 9, 10 W3-24 (http/unit); tiêu chí 3, 5, 6 ở P20.

### P16a — biz · M

- **File:** **mới** `m/catalog/subscription-line/subscription-line.policy.ts` (+spec), `m/catalog/subscription-line/ledger/seat-ledger.policy.ts` (+spec),
  `seat-ledger.service.ts` (+spec), `seat-ledger.errors.ts`, `seat-ledger.http-errors.ts`; **mới** `m/catalog/public/seat-ledger.api.ts`;
  `m/catalog/subscription/seat-target.service.ts`; `m/catalog/public/catalog.api.ts`, `catalog.types.ts`; `m/catalog/subscription/pool/subscription-pool.service.ts`
  (xóa `addSeat`), `m/catalog/subscription/subscription-facts.service.ts`, `m/catalog/subscription/subscription-priced.repo.ts`;
  `m/licensing/shared-pool/shared-pool.policy.ts`, `shared-pool.service.ts` (`chooseLine`), `shared-pool-capacity.repo.ts`;
  `m/licensing/provisioning/tasks/provisioning-grant-writer.service.ts` (`takeSeat` qua sổ); `m/licensing/assignment/assignment.service.ts`
  (`carryOrBuy` mua kỳ sau); `m/catalog/catalog.module.ts`*; `test/integration/licensing/renewal-carry-purchase.integration-spec.ts`.
- **Làm:** SPEC-B3 W3-16 (facade, mang quyền Q-B, ngày hiệu lực), W3-15 (chọn dòng theo ngày phục vụ), W3-18 (lối tắt khi cấp).
- **Bản 2.4:** P16a làm **trước** P13a (chỉ cần P11). Đường cấp `K1` giữ nguyên tới P13a (sổ chỉ cho dòng `K2`); `carryOrBuy` ở
  `assignment.service.ts:442-473`.
- **Xong khi:** bảng W3-16 + ca Q-B; `grep -rn "addPoolSeat\|addSeat(" src` = 0; refactor `takeSeat`/`carryOrBuy` giữ mọi lần kiểm cũ (LUẬT CỨNG 2).

### P15 — tech · M

- **File:** **mới** `m/catalog/subscription-line/subscription-lines.controller.ts`, `subscription-line.dto.ts`, `subscription-line.service.ts` (+spec),
  `subscription-line.mapper.ts`, `subscription-line.errors.ts`, `subscription-line.http-errors.ts`; `m/catalog/subscription/subscription.dto.ts`,
  `subscription.mapper.ts`, `subscription.service.ts` (`lines[]`, thân cũ = một dòng, `SeatLedgerApi.openLines`), `subscription-view.service.ts`;
  `m/licensing/assignment/subscription-seats.controller.ts`, `assignment.dto.ts`; `m/catalog/catalog.module.ts`_;
  `test/gates/api-collection-contract.gate-spec.ts`_ (`subscriptionGet#lines`); `test/http/catalog/subscription-lines.http-spec.ts`.
- **Thêm file (đợt 2 cuối, DL-2):** `m/licensing/assignment/occupancy/seat-usage-occupancy.service.ts` (+spec) — `seat-usage` của `K2`: `purchased` =
  Σ `seatsToday` dòng phục vụ hôm nay. `seats` của `subscriptionGet` giữ `null` cho gói không `K2` (D-18).
- **Làm:** SPEC-B3 W3-15 (route, quyền IT phụ trách thuê bao, `lines[]`).
- **Xong khi:** bảy tiêu chí W3-15.

### P16b — biz · M

- **File:** **mới** `m/licensing/shared-pool/seat-purchases.controller.ts`, `seat-purchase.dto.ts`, `seat-purchase-route.service.ts` (+spec),
  `seat-purchase-invoice-due.service.ts` (+spec); **mới** `m/catalog/subscription-line/purchase/seat-purchase.policy.ts` (+spec), `seat-purchase.service.ts`
  (+spec), `seat-purchase.errors.ts`, `seat-purchase.http-errors.ts`; `m/catalog/public/seat-ledger.api.ts`;
  `m/requests/purchase-invoice/purchase-invoice-submission.service.ts`, `purchase-invoice.dto.ts`, `purchase-invoice-plan.service.ts`,
  `labels/purchase-invoice-labels.policy.ts` (+spec), `purchase-invoice.errors.ts`_, `purchase-invoice.http-errors.ts`_;
  `m/licensing/subscription-renewal/subscription-renewal-sweep.service.ts`; **mới** `m/requests/access-request/vendor-charge.policy.ts` (+spec);
  `m/requests/request-view/pricing-view.service.ts`; `m/requests/access-request/access-request.dto.ts`; `m/requests/spend-approval-view/spend-approval.dto.ts`,
  `spend-approval-view.service.ts`; `m/licensing/licensing.module.ts`_; bốn file thông báo chung_ (`SUBSCRIPTION_SEATS_BOUGHT`,
  `SEAT_PURCHASE_INVOICE_OVERDUE`); `test/http/licensing/seat-purchases.http-spec.ts`, `test/integration/licensing/seat-purchase-concurrency.integration-spec.ts`,
  `test/http/requests/access-request-get.http-spec.ts`.
- **Làm:** SPEC-B3 W3-18 (route, 403 từng mục, hạn, hóa đơn gắn lần mua, nhắc hạn), W3-20. Từng mục: `ProvisioningTaskFrame.requireActingItAdmin`
  (`:134`); người thụ hưởng chưa xếp phòng ⟹ theo OQ-D1 (chưa chốt: không truyền `taskId`, 403 `SEAT_PURCHASE.NOT_IN_CHARGE`).
- **Xong khi:** 11 ca W3-18, ca W3-20.

### P17 — biz · M

- **File:** **mới** `m/catalog/subscription-line/correction/subscription-line-correction.policy.ts` (+spec), `subscription-line-correction.service.ts`
  (+spec), `subscription-line-seats.controller.ts`, `subscription-line-correction.dto.ts`; `m/catalog/subscription-line/purchase/seat-purchase.policy.ts`,
  `seat-purchase.service.ts`; `m/licensing/shared-pool/seat-purchase.dto.ts`, `seat-purchase-route.service.ts`;
  `m/licensing/provisioning/tasks/provisioning-grant-writer.service.ts`; `m/licensing/provisioning/revocation-completion/revocation-completion.service.ts`
  (+spec); bốn file thông báo chung* (`SEAT_LEDGER_VENDOR_RECORDED`); `test/http/catalog/subscription-line-seats.http-spec.ts`.
- **Làm:** SPEC-B3 W3-19.
- **Xong khi:** tám ca W3-19.

### P18 — biz · L

- **File:** `m/licensing/subscription-renewal/seats-needed/renewal-seats-needed.policy.ts` (+spec), `renewal-seats-needed.service.ts`;
  `record/renewal-record.service.ts` (+spec), `record/renewal-record.policy.ts` (+spec); `outcome/renewal-outcome.service.ts`, `outcome/renewal-outcome.policy.ts`;
  `deadline/renewal-deadline.service.ts`; **mới** `lines/subscription-renewal-lines.policy.ts` (+spec), `lines/subscription-renewal-lines.service.ts`,
  `lines/subscription-renewal-auto.service.ts` (+spec); `subscription-renewal.dto.ts`, `subscription-renewals.controller.ts`,
  `subscription-renewal-view.service.ts`, `subscription-renewal-sweep.service.ts`, `subscription-renewal.mapper.ts`, `subscription-renewal-ranking.service.ts`,
  `subscription-renewal.errors.ts`_, `subscription-renewal.http-errors.ts`_ (tất cả dưới `m/licensing/subscription-renewal/`);
  `m/licensing/subscription-renewal/savings/renewal-savings.service.ts`; `m/licensing/assignment/renewal/assignment-renewal.service.ts`;
  `m/catalog/subscription/period/subscription-period.service.ts`; `m/catalog/public/subscription-period.api.ts`, `subscription-period.types.ts`;
  `test/integration/licensing/renewal-auto-record.integration-spec.ts`.
- **Làm:** SPEC-B3 W3-21. `renewal-record.service.ts` gần trần độ phức tạp: tách policy theo dòng. Seed `renewals.steps.ts` **không** sửa (P22b):
  ghi thân mới vào _Bàn giao_.
- **Xong khi:** mười ca W3-21; tự ghi hai instance một kết quả.

### P19 — biz · M

- **File:** `m/budgets/shared-pool-line/shared-pool-line.policy.ts`, `shared-pool-line-label.policy.ts`, `shared-pool-line-facts.service.ts`;
  `m/budgets/seat-month/seat-month-subscription.service.ts`, `seat-month-seat-facts.service.ts`; **mới**
  `m/licensing/subscription-renewal/kpi/kpi-missed-adjustment.policy.ts` (+spec), `kpi-missed-adjustment.service.ts`;
  `m/licensing/subscription-renewal/subscription-renewal-view.service.ts`; `m/catalog/plan/plan.policy.ts` (+spec).
- **Làm:** SPEC-B3 W3-22.
- **Xong khi:** năm ca W3-22.

### P20 — biz · L

- **File:** `m/catalog/subscription/seat-target.service.ts` (khóa lô cho `K4`); **mới** `m/catalog/license-lot/license-lot-price.policy.ts` (+spec),
  `license-lot-stock.service.ts` (+spec), `m/catalog/public/license-lot-stock.api.ts`; `m/licensing/provisioning/tasks/provisioning-grant-writer.service.ts`,
  `provisioning-grant-completion.service.ts`; `m/licensing/license-key/license-key-assignment.service.ts` (+spec); `m/licensing/shared-pool/shared-pool-capacity.repo.ts`,
  `shared-pool.service.ts`, `shared-pool-vacancy.service.ts`; `m/requests/grant/pool-grant-release.policy.ts` (+spec), `access-request-grant.listener.ts`;
  `m/budgets/invoice/purchase-invoice-recorder.service.ts`; **mới** `m/budgets/shared-pool-line/license-lot-cost.policy.ts` (+spec),
  `license-lot-cost.service.ts` (+spec); `m/budgets/shared-pool-line/shared-pool-line.policy.ts`, `shared-pool-line-alert.service.ts`;
  `m/requests/purchase-invoice/purchase-invoice-submission.service.ts`, `purchase-invoice.dto.ts`, `purchase-invoice-plan.service.ts`;
  `m/optimization/internal-rules/internal-rules.policy.ts` (+spec), `internal-rules-g1.service.ts`, `internal-rules-g2.service.ts`;
  `m/licensing/public/licensing-ghost-seat.api.ts`, `licensing-ghost-seat.types.ts`; `m/catalog/catalog.module.ts`_; bốn file thông báo chung_
  (`LICENSE_LOT_IDLE_COST_HIGH`); `test/integration/budgets/license-lot-charges.integration-spec.ts`.
- **Làm:** SPEC-B3 W3-24 (cấp, giá — K-A5, giữ m license — F11), W3-25 (W3-Q1 A, K-A4, K-A8, K-A9, `STOCK`, F10, F12 chênh lệch lô, F13, F14),
  W3-26 (K-A10).
- **Xong khi:** mười chín ca W3-25 (gồm 9 ca F10–F14), ca W3-26, tiêu chí 3, 5, 6 W3-24.

### P21 — tech · S

- **File:** `m/catalog/subscription/subscription.dto.ts`, `subscription.policy.ts` (+spec), `subscription-change.service.ts`, `subscription.service.ts`,
  `subscription.errors.ts`_, `subscription.http-errors.ts`_; `test/http/catalog/subscriptions.http-spec.ts`.
- **Làm:** SPEC-B3 W3-27 (luật ở `subscription.policy.ts`, **không** sửa `subscription-pool.policy.ts`).
- **Xong khi:** bốn ca lỗi W3-27.

### P22a — tech · M (bản 2.4: tách)

- **File:** `src/cli/seed/steps/catalog.steps.ts`, `catalog.steps.spec.ts`, `catalog-extra.steps.ts`, `assets.steps.ts` (+spec);
  `src/cli/seed/fixture/shared-demo-v4/catalog.ts`, `catalog-extra.ts`, `catalog-kit.ts`, `requests.ts` (khóa Office LTSC — DL-9), `README.md`.
- **Làm:** SPEC-B3 W3-28 phần không cần route/luật của `biz` (tạo dữ liệu, chưa cấp): `K4` qua `POST /license-lots`
  (JetBrains hai lô giá khác, Visio, Sublime, **Office LTSC 2024** gói `DEVICE_KEY` lô `STOCK`/`OPENING` giữ `maxActivations 30`,
  `initialActivationsUsed 8`) + `POST /license-lots/{id}/keys`; Windows 11 Pro OEM (`DEVICE_BUNDLED`) không lô; Claude Team một thuê bao 2 dòng
  qua `lines[]`; Microsoft hai thuê bao. Bước máy/người làm thay của đợt 2 (`device-new.steps.ts`, `department-substitutes.steps.ts`) không sửa.
- **Xong khi:** spec unit các step đã sửa xanh.

### P22b — tech · M (bản 2.4: tách)

- **File:** `src/cli/seed/steps/renewals.steps.ts`, `renewals.steps.spec.ts`, `demo-documents.steps.ts`, `request-actions.ts`, `budget-targets.ts`,
  `budget-targets.spec.ts`, `catalog.steps.ts` (bước mua thêm seat); `src/cli/seed/fixture/shared-demo-v4/renewals.ts`, `finance.ts`, `catalog.ts`;
  `docs/guides/seed.md`.
- **Làm:** SPEC-B3 W3-28 phần còn lại: một `POST …/purchases` 2 mục (`MUA-…` + hóa đơn _Mua thêm seat_), Zoom Workplace Business bậc 50, Jira theo
  `QĐ-119e`, gia hạn `lines[]`, `budget-targets.ts` đọc giá dòng; `K1` không khai thuê bao (bỏ 6 thuê bao `K1`), Claude Pro năm (cần P13a); cấp từ lô
  (cần P20); seed lịch sử seat _lỡ điểm điều chỉnh_ ghi `docs/guides/seed.md`.
- **Xong khi:** spec unit seed xanh; `seed check` liệt kê bước mới (CI hoặc Docker của `tech`).

### P23 — mỗi làn · S

- **tech:** `pnpm arch:graph`, `pnpm arch:routes`, `pnpm openapi:export` (sinh `docs/generated/*`, `openapi.json`); module card `m/catalog/README.md`,
  `m/licensing/README.md`, `m/budgets/README.md`, `m/requests/README.md`, `m/optimization/README.md`, `m/dashboards/README.md`, `m/personnel/README.md`
  theo _Bàn giao_ của `biz`; `docs/reviews/redesign-w3-2026-11-22/FIX-TEST-tech.md`.
- **biz:** `docs/rules/security-jobs.md` (đoạn `SeatMonthSweeper`, `BudgetReviewSweeper`, `SubscriptionRenewalSweeper`); `docs/rules/database-business.md`
  (bảng khóa gộp SPEC §6.2: thêm 5b, 6a, 6c, 6d, 7b, 9b, bỏ tên 6b); `docs/reviews/redesign-w3-2026-11-22/FIX-TEST-biz.md`.
- **Xong khi:** CI full trên nhánh làn (`gh workflow run ci.yml --ref <nhánh>`; làn `biz` = `int/redesign-w3`) ghi vào `PROGRESS-<làn>.md`; rồi C3.

## Rủi ro

| Rủi ro                                                                   | Giảm                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M4/M5/M6 dừng vì khối kiểm trên DB demo                                  | Owner chạy các câu `SELECT` của SPEC trước deploy, sửa dữ liệu bằng tay                                                                                                                |
| M6 đổi hàm đợt 2 làm vỡ kích hoạt máy                                    | P12a giữ mọi luật cũ (bảng sáu hàm); P20b chạy lại unit đợt 2 không đổi kỳ vọng; integration ở P12a                                                                                    |
| Trigger sức chứa theo sổ chậm khi nhiều quyền                            | cùng cách đếm đỉnh của trigger cũ; integration đo trên 500 quyền                                                                                                                       |
| Đổi `INV-01` từ kỳ sang dòng gây deadlock                                | mọi luồng khóa kỳ (6) rồi dòng (6c); test barrier ở P11, P16a, P16b                                                                                                                    |
| Hai làn cùng sửa `*.module.ts`, manifest, `organization.prisma`          | chỉ thêm dòng; gộp hợp khi merge; `openapi.json` sinh lại sau merge                                                                                                                    |
| Đẩy nhầm gói B2/B3 vào `int` trước cửa ⟹ PR phần trước kéo code phần sau | đẩy chỉ ở C1/C2; PR từ nhánh chụp `pr/redesign-w3-b<n>`; trước khi mở PR: `git --no-pager diff --stat origin/dev...pr/redesign-w3-b<n> -- prisma/migrations` chỉ có dải số của phần đó |
| PR B1/B2 bị review đòi sửa trong lúc `int` đã đi tiếp                    | sửa trên nhánh chụp rồi merge vào `int`; migration sửa dùng số trong dải của phần                                                                                                      |
| Gate collection từ chối `NESTED_ARRAYS` mới (`lines`, `admins`)          | dừng hỏi Owner; phương án: subresource phân trang                                                                                                                                      |
| Seed qua API không tạo được seat _lỡ điểm điều chỉnh_                    | seed lịch sử (`QĐ-115as`), ghi `docs/guides/seed.md`                                                                                                                                   |
