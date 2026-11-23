# SPEC — QĐ-113 (18/11/2026)

Repo làm trước: **BE-WDP** (`WDP301-FA26-GR8/BE`), nhánh `feat/qd113`; sau khi xanh mới chép sang BE đồ án (SEP).
Giữ phương án **Dự phòng** của `QĐ-113a`. `QĐ-113b` (bản 18/11 chiều): mỗi loại seat là một gói **và một workspace riêng**, hóa đơn tách theo
workspace — không cần code. `QĐ-113f`: thuê bao `K1` giữ một bản ghi giá/chu kỳ — không cần code.
Căn cứ nghiệp vụ: Docs `Decisions/project-decisions.md` `QĐ-113a` → `QĐ-113e`, BRD 4.14 (`FR-1.2`, `FR-1.6`, `FR-2.2`, `FR-3.1`,
mục 5.3 bảng rút Request) — Docs commit `65fccd1`, `cc7e3fe`, `bfe96ac`. Nhánh: `feat/qd113` từ `dev`. Không đổi gì ngoài 4 gói dưới đây.
Không làm: sửa từng phần hồ sơ workspace (đã có `PUT /plans/:id/workspace-profile`), API sửa thuê bao (đã có
`PATCH /subscriptions/:id`, `POST /subscriptions/:id/completions`).

## P1 — Rút Request trước quyết định đầu tiên (`QĐ-113d`)

Hiện: `checkWithdrawal` (src/modules/requests/access-request/withdrawal.policy.ts) cho người yêu cầu rút ở mọi trạng thái chưa kết thúc
(kể cả AWAITING_SPEND_*, AWAITING_IT_ASSESSMENT, AWAITING_EXECUTION, EXECUTING). Dòng của Request nhóm: `checkLineWithdrawal`
(group-request/group-withdrawal.policy.ts) chỉ chặn dòng đã kết thúc.

Luật mới cho **người yêu cầu** (trưởng phòng giữ nguyên `HEAD_MAY_WITHDRAW_AT`: BLOCKED, RESERVE_CONFIRMATION, có lý do):
1. Rút được khi Request **chưa có quyết định nào**:
   - bước nhu cầu đang chờ (`PENDING` giao trưởng phòng) hoặc đang đứng chờ vì phòng chưa có trưởng phòng (`WAITING_CONTROLLED`/`WAITING`);
   - Request đang `AWAITING_REQUESTER_REVISION` (bị *Trả về bổ sung* ở bất kỳ bước nào).
2. Request **không có bước nhu cầu** (`needStep = NOT_REQUIRED`: trưởng phòng tự xin — ONE_STEP; `K5` ở phòng chưa có trưởng phòng):
   rút được khi **người quyết đầu tiên chưa quyết** — Request một bước: chưa có quyết định của Người duyệt chi (đang ở kiểm tra ngân sách /
   chờ Người duyệt chi); `K5` cấp thẳng: tác vụ cấp chưa bắt đầu (AWAITING_EXECUTION, chưa EXECUTING).
3. Ngoài các trạng thái trên ⟹ từ chối 409, mã mới `ACCESS_REQUEST.WITHDRAWAL_AFTER_DECISION` (theo quy ước mã lỗi hiện có của
   module; `details` nêu trạng thái hiện tại). Thông điệp EN; FE hiện câu tiếng Việt theo catalog lỗi.
4. Dòng Request nhóm: người yêu cầu rút một dòng chỉ khi dòng đó còn `AWAITING_NEED` (hoặc cả Request đang
   `AWAITING_REQUESTER_REVISION`); rút cả Request nhóm theo cùng điều kiện của mục 1.
5. Request tiếp tục sử dụng (`RENEWAL`) theo cùng luật 1–3.
6. Hậu quả khi rút (rời lô, giải phóng cam kết, hủy tác vụ) giữ nguyên code hiện có.
7. `canWithdrawOwn` (requests/my-requests/my-requests.policy.ts) phải khớp luật mới (FE dùng để hiện nút).
8. Cập nhật mô tả controller (withdraw/withdrawal.controller.ts, group-lines.controller.ts) và ví dụ lỗi OpenAPI
   (access-request.http-errors.ts).

## P2 — Sửa lần xếp phòng đầu tiên (`QĐ-113e`)

Hiện: chỉ có `POST /employees/:id/first-placements` (EmployeeFirstPlacementService). Trigger DB `employee_placements_keep_history`
(migration mới nhất trong 20261029100200_job_title_history_names) cấm đổi person/department của placement; `valid_from` chỉ đổi được khi
chưa có thông báo PLACEMENT_START (lần xếp đầu không có thông báo). Trigger `employee_placements_keep_one` (20261103130000) cấm xóa
placement duy nhất.

Thêm `PATCH /employees/:id/first-placement` — SUPER_ADMIN; body strict `{ departmentId?: uuid, effectiveFrom?: business date, reason: string 1..500 }`,
phải có ít nhất một trong hai trường đổi.
1. Từ chối khi: người gọi sửa hồ sơ của chính mình (`QĐ-87c`); nhân viên không ACTIVE; nhân viên không có đúng **một** placement; placement
   đó có `validFrom ≤ hôm nay` (theo ngày nghiệp vụ của tổ chức); placement đã bị tham chiếu — có Request (người yêu cầu hoặc thụ hưởng),
   điều chuyển, giai đoạn trưởng phòng/kế nhiệm, hồ sơ nghỉ việc. Mỗi ca một mã lỗi 409/422 rõ nghĩa
   (vd. `EMPLOYEE.FIRST_PLACEMENT_ALREADY_EFFECTIVE`, `EMPLOYEE.FIRST_PLACEMENT_IN_USE`, `EMPLOYEE.NOT_PLACED`).
2. Giá trị mới kiểm như xếp phòng lần đầu (`firstPlacementProblem`, `requireEffective`): phòng đang hoạt động và có hiệu lực tới ngày đó;
   ngày ≥ hôm nay và ≥ ngày vào làm. Không đổi gì ⟹ lỗi rỗng như các PATCH khác.
3. Đổi phòng: migration mới cho phép trigger keep_history/keep_one **thay** placement đầu tiên chưa hiệu lực, chưa có thông báo (đổi
   department_id tại chỗ, hoặc xóa + chèn trong cùng giao dịch — chọn cách gọn nhất, ghi lý do trong migration). Không nới luật cho
   placement khác.
4. Audit `EMPLOYEE.FIRST_PLACEMENT_CORRECTED` (trước/sau, lý do). Thông báo: đổi phòng ⟹ gửi tin *có người mới* như xếp phòng lần đầu cho
   trưởng phòng và IT Admin phụ trách phòng mới (dùng lại đường thông báo của `place`); đổi ngày không gửi.
5. DB role grants (H7) cho thao tác mới nếu cần; `docs/generated/routes.md` qua `arch:docs:check`.

## P3 — Ảnh đại diện phòng, tải lên (`QĐ-113c`)

Hiện: ảnh nhân viên ở identity-access (`ProfileAvatarService`, `judgeAvatar`/`avatarObjectKey` trong profile.policy.ts, link ký 15 phút,
`AvatarPurge`, `profile-purge.job.ts`). Department (organization.prisma) không có ảnh. ADR-0019 cấm organization ghi bảng của identity-access.

1. Đưa phần **thuần** dùng chung ra `src/infrastructure/object-storage/` (hoặc shared): kiểm chữ ký file png/jpeg/webp ≤ 1 MB, tạo object
   key; identity-access dùng lại, không đổi hành vi.
2. `Department`: cột `avatarObjectKey`, `avatarContentType`, `avatarUpdatedAt` (nullable) + migration.
3. `PUT /departments/:id/avatar` (multipart, field `file`) và `DELETE /departments/:id/avatar` — SUPER_ADMIN; phòng phải ACTIVE.
   Ghi object trước, đổi cột trong giao dịch; object cũ: xóa theo cơ chế dọn của organization (bảng purge riêng của organization hoặc xóa
   sau commit với log lỗi — chọn cách đơn giản, không ghi vào `AvatarPurge` của identity-access). Audit `DEPARTMENT.AVATAR_CHANGED` /
   `DEPARTMENT.AVATAR_REMOVED`.
4. Response phòng (list, detail và các nơi trả `departmentSchema`) thêm `avatarUrl: string | null` — link ký 15 phút như ảnh nhân viên.
5. Không bắt buộc ảnh; phòng ngừng hoạt động vẫn giữ ảnh.

## P4 — Giá tham chiếu của gói (`QĐ-113a`, `QĐ-113b`)

Hiện: gói không có giá; giá chỉ ở thuê bao. Điểm chung: `SubscriptionPriceService.priceOfPlan`
(catalog/subscription/price/subscription-price.service.ts) qua `CatalogApi.getPlanPrice` / `CatalogPricingApi.getPlanPrice`.

1. `Plan`: `referencePriceMinor BigInt?` + `referencePriceCurrency Char(3)?` (chỉ `VND`), migration có CHECK: hai cột cùng có hoặc cùng
   null; ≥ 0; chỉ khi kiểu cấp `K1`/`K2`/`K4` (không `K5`, không `K3`). Đổi kiểu cấp sang `K5` ⟹ xóa giá; `K2`↔`K4` ⟹ bắt nhập lại
   (xóa giá, ghi audit).
2. DTO khai/sửa gói (plan.dto.ts, và gói đầu của application-intake) nhận `referencePrice: { amount, currency }` **không bắt buộc**,
   `null` để xóa khi sửa; tiền là chuỗi (ADR-0007); khác VND ⟹ lỗi như `SUBSCRIPTION.PRICE_NOT_VND` (mã riêng cho gói). Response gói thêm
   `referencePrice` (null khi chưa có). Requestable-software **không** lộ số (giữ nguyên quy ước "never the price itself").
3. `priceOfPlan`: thứ tự — (a) thuê bao định giá gói như hiện nay (`pickPriceSource`, `livePricedOf`); (b) không có ⟹ giá tham chiếu:
   `K1`/`K2` = giá tháng (billingCycle `MONTHLY`, kind TERM), `K4` = giá mua một lần (PERPETUAL); (c) không có ⟹ `null` như cũ. Nguồn
   giá trả kèm `source: 'SUBSCRIPTION' | 'PLAN_REFERENCE'` nếu cấu trúc cho phép (để preview/hồ sơ ghi được). Facade worker
   (`catalog-pricing-facade.module.ts`) phải đọc được giá gói.
4. Mọi nơi đọc qua `priceOfPlan` tự hưởng fallback (preview/intake, nhóm, repricing ở kiểm tra ngân sách, Request tiếp tục, 01/01, giá
   tháng của rà soát ngân sách). `requestable-software` trạng thái "định giá được" (`pricedCyclesOfPlans`/`priceOf`) phải tính cả giá
   tham chiếu để không lệch với preview.
5. Case B: khi IT tạo/gắn gói từ Request case B (catalog-link.service.ts hoặc luồng tạo mục sau duyệt chi), báo giá đã duyệt của đánh giá
   (assessment quote) chép vào giá tham chiếu của gói nếu gói chưa có: báo giá MONTHLY ⟹ giữ; QUARTERLY ⟹ ÷3; ANNUAL ⟹ ÷12, **làm tròn
   lên tới đồng**; chỉ khi gói là `K1`/`K2`; `K4` thì không chép (IT nhập tay).
6. Không đổi: chi phí theo seat, điểm điều chỉnh, đối chiếu hóa đơn, *tránh được* — vẫn theo thuê bao/hóa đơn.
7. `MissingPriceReason` giữ `NO_PRICED_SUBSCRIPTION` cho trường hợp thiếu cả hai (mô tả đổi thành "không có thuê bao có giá và gói chưa có
   giá tham chiếu").

## P5 — Seed demo (review toàn bộ seed theo luật mới)

Seed chạy qua **API thật** (`src/cli/seed/steps/*`, `demo-api-client.ts`), nên mọi luật mới của P1–P4 áp vào seed. Rà **từng** kịch bản trong
`src/cli/seed/fixture/shared-demo-v4/*` và `README.md` của fixture:

1. **Rút Request (P1):** kịch bản rút phải hợp luật mới. R05 (`requests.ts`, "tự rút khi còn chờ") phải rút lúc còn chờ trưởng phòng.
   Kịch bản *"withdrawn while the task waits to be closed"* trong `requests-extra.ts` (rút khi tác vụ cấp lỗi/chờ chấp nhận — `QĐ-77g` đã
   bị thay) **không còn hợp lệ**: đổi thành một kịch bản hợp lệ cùng mục đích demo (vd. Request bị **từ chối**/**thất bại** hoặc
   Request có tác vụ cấp lỗi được IT đóng *thất bại* theo `SBF-17`), giữ bất biến dataset (SPEC 4.2 của seed). Thêm 1 Request bị
   *Trả về bổ sung* rồi người yêu cầu rút (nếu chưa có) để demo luật mới.
2. **Giá tham chiếu (P2):** mọi gói trả phí có `referencePrice` VND chưa thuế — `K2`: bằng giá tháng quy đổi của thuê bao đang có;
   `K1`: giá gói tháng; `K4`: giá một khóa. Thêm **một gói `K1` chưa có thuê bao**, chỉ có giá tham chiếu, và một Request của gói đó ở
   trạng thái chờ duyệt chi (demo Request tính tiền từ gói).
3. **Claude Team (`QĐ-113b`):** thay gói `claude-team` bằng hai gói `claude-team-standard` và `claude-team-premium` — **hai workspace,
   hai thuê bao**, mỗi thuê bao có hồ sơ workspace riêng (≥ 2 IT Admin, `QĐ-110k`) và giá riêng (Standard ≈ 500.000 đ/seat/tháng trả năm,
   Premium ≈ 2.500.000 đ). Chia seat hiện có (NV-DEV5, NV-DEV6, NV-ITO1) giữa hai gói; sửa các chỗ nhắc `claude-team` (finance.ts
   dòng `BM-10`, renewals, usage, devices nếu có, README, spec của fixture).
4. **Sửa xếp phòng (P4):** thêm một nhân viên đã xếp phòng lần đầu với ngày **tương lai**, chưa có Request/tài khoản dùng — để demo sửa.
5. **Ảnh phòng (P3):** không seed ảnh.
6. Cập nhật `shared-demo-v4.spec.ts`, `catalog.steps.spec.ts` và các spec seed liên quan; `README.md` của fixture (bảng gói, bảng Request,
   kịch bản DEMO) và `docs/guides/demo-dataset.md`.

## Chung

- OpenAPI: `pnpm openapi:export` rồi commit `openapi.json`; cập nhật `test/support/api-coverage-manifest.ts`,
  `openapi-example-manifest.ts` cho route mới; `docs/generated/routes.md`.
- README module chạm tới (requests, catalog, organization, personnel) ghi luật mới kèm `QĐ-113x`.
- Migration: P2 dùng `20261118100000_*`, P3 `20261118110000_*`, P4 `20261118120000_*` (tránh trùng khi chạy song song).
- Mỗi luật mới có test đỏ trước rồi xanh (policy spec + 1 http/integration cho route mới). Test cũ hỏng vì luật đổi (đặc biệt P1: các
  test rút Request sau khi duyệt) thì sửa test theo luật mới; test hỏng ngoài phạm vi ghi vào `## Nợ test` của PLAN.
