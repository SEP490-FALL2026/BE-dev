# FIX-W3 — Sửa sau review gộp hai làn (25/11/2026)

Nguồn: review `int/redesign-w3` @ `21de7c9a` (gộp làn tech + B1 + FIX-B1) bằng 3 reviewer Opus (FIX-B1, làn tech P9a/P9b/P11/P21,
làn tech P12a/P12b/P14/P20b/P22a) + 1 Opus độc lập đối kháng kiểm từng mục. Quyết định Owner 25/11 ghi ở mục "Owner đã chốt".
Owner 25/11: làn **biz (Neon) làm toàn bộ** phần còn lại của đợt 3, kể cả sửa code làn tech.

**Khi nào làm:** xong gói đang làm dở thì làm hết FIX-W3 (thứ tự bảng), rồi mới sang gói kế của PLAN. Mục **X** (transaction) sẽ được
điều phối bổ sung sau audit — `git pull --ff-only` sau mỗi gói.

## Skill Preflight và LUẬT CỨNG

- Code: `superpowers:executing-plans` + `superpowers:test-driven-development` + repo skill `be-quick-check`; verify:
  `superpowers:verification-before-completion`. Liệt kê skill đã đọc ở đầu báo cáo.
- Áp nguyên văn **LUẬT CỨNG 1–11** của [CODE-PROMPT.md](CODE-PROMPT.md). Test phải **đi qua code thật** (repo/service/policy thật —
  không tự dựng kỳ vọng bằng chính công thức, không mock thứ đang kiểm); test lỗi assert **mã lỗi**; luồng khóa mới có integration
  barrier lặp 20 (CODE-PROMPT §3.7).
- **Không ghi `xong` khi test integration của mục đó còn đỏ trên CI** (bài học F3 của FIX-B1).

## Owner đã chốt (25/11)

| Mã           | Quyết định                                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-13 / F8    | Phương án **A**: facade chỉ đọc cho seat-month + mở rộng `CatalogPricingApi`; **được thêm 1–2 dòng `PUBLIC_CONTRACT_EXPORTS`**; reader `runningUncommitted` inject bắt buộc qua constructor (bỏ hook đăng ký lúc `onModuleInit`) |
| D-11         | Sửa trong đợt: _Dự kiến cuối năm_ cộng `runningUncommitted` (tiêu chí W3-08 chưa đạt)                                                                                                                                            |
| Giá lúc giữ  | Request nhóm `K2`: số tiền giữ dùng **giá tháng ngày gửi** — lưu `monthlyPriceMinor` vào `pricing` của Request lúc gửi                                                                                                           |
| D-6          | `workspaceId` không tồn tại khi khai thuê bao ⟹ **422 `SUBSCRIPTION.WORKSPACE_NOT_FOUND`**                                                                                                                                       |
| D-20         | **Bỏ** `K1` và `HOLDERS` khỏi enum tồn kho ở schema API (báo FE qua API description đợt 3)                                                                                                                                       |
| Mua sẵn `K4` | **Mở mục đích `STOCK` cho gói `ACCOUNT`**: tiền lô vào license dư của kho (`POOL_IDLE`), cùng nghĩa _license dư_ của F13c; sửa bảng W3-25 của SPEC-B3; seed JetBrains/Visio/Sublime đổi `REPLACEMENT` ⟹ `STOCK`                  |
| D-3          | Giữ bảng riêng `invoice_pool_variance_resolutions`; `invoices` chỉ ghi thêm                                                                                                                                                      |
| D-4          | Giữ PATCH workspace sửa `ownerLimit`, `adminLimit`, `ownerTransferProcedure` — **mọi đường ghi một transaction chuẩn** (xem W-6)                                                                                                 |
| D-28         | Giữ theo SPEC-B3: 409 `CONTRACT.SUBSCRIPTION_NOT_K2`; test cũ sang FIX-TEST                                                                                                                                                      |
| Registry     | Duyệt 3 mục `NESTED_ARRAYS` (`workspaceGet#admins.flags`, `workspaceGet#flags`, `workspaceList#flags`) và 4 trường `COLLECTION_EXCEPTIONS` của `subscriptionList` — ghi một dòng vào `OVERNIGHT-DECISIONS-tech.md`               |

## Danh sách sửa

### Phần FIX-B1 chưa đạt (B)

| Mã                 | Sửa                                                                                                                                                                                                                    | Test bắt buộc                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1 (F3)           | Fixture `newK2Pool` của `commitment-month-settlement.integration-spec.ts` đủ sức chứa (20 vòng × 2 seat ⟹ ≥ 42)                                                                                                        | CI: Ca H xanh **và** ca "một cam kết lỗi CHECK, cam kết còn lại vẫn chốt" thật sự chạy tới (đọc log)                                        |
| B-2 (F7)           | `NextYearBudgetService` đếm trùng: `keptByCostCenter` trả kèm danh sách `requestId` đã cộng `next_year_amount`; `runningUncommittedOfYear(…, { exceptRequestIds })` bỏ seat của các Request đó                         | Service + policy thật: seat của Request `COMPLETED` có số năm sau 4.800.000, ngày 15/11 ⟹ _Còn lại_ = duyệt − 4.800.000 (không − 9.600.000) |
| B-3 (D-11)         | `budget-review-figures.service.ts`: _Dự kiến cuối năm_ cộng `runningUncommitted`                                                                                                                                       | Ví dụ W3-08 của SPEC-B1                                                                                                                     |
| B-4 (F8)           | D-13 phương án A (bảng trên)                                                                                                                                                                                           | Test module worker khởi động có reader; worker qua `BudgetCheckService` thật ra `USES_RESERVE` khi chi phí không cam kết đẩy vượt cơ sở     |
| B-5 (giá ngày gửi) | Lưu `monthlyPriceMinor` vào `pricing` lúc gửi; `group-spend-hold.service.ts:132` và `lineAmountsOf` đọc giá đã lưu, không đọc catalog lúc duyệt                                                                        | Giá đổi giữa gửi và duyệt ⟹ số giữ theo giá ngày gửi; test không tự gán `pricing.monthlyPriceMinor`                                         |
| B-6                | Fixture `setPrice`/`planAt` ghi cả `monthly_unit_price_minor`; `year-start-commitments-kept` T-XY1 kỳ vọng theo luật tháng lịch (8 × 600.000 = 4.800.000, × 3 người = 14.400.000); kiểm lại `group-request-spend` RQ-2 | CI hai suite xanh với kỳ vọng mới (ghi căn cứ W3-02 trong commit)                                                                           |
| B-7                | `BudgetsReadApi.runningUncommittedOfYear` gọi `ofYear` một lần rồi lọc theo Cost Center                                                                                                                                | Unit: một lần đọc cho n Cost Center                                                                                                         |
| B-8                | `pnpm arch:graph` (job `quality` đỏ vì `docs/generated/module-graph.md` cũ) — chạy lại sau mỗi đổi import                                                                                                              | `quality` xanh                                                                                                                              |

### Phần làn tech (T)

| Mã   | Sửa                                                                                                                                                                                                                                                 | Test bắt buộc                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| T-1  | Thứ tự khóa: `workspace-admins.service.ts` (`set`/`update`) và `workspace.service.ts:161-166` khóa **employee** (FOR SHARE, sắp id) **trước** workspace (LUẬT 11)                                                                                   | Integration barrier ×20: SBF-16 bàn giao ‖ `workspaceAdminsSet` nêu người nghỉ ⟹ 0 lần 40P01   |
| T-2  | `workspace.repo.ts:252` `subscriptionCountsOf` thôi trả 0: đếm thuê bao sống theo `workspace_id` (định nghĩa "sống" ghi D-n)                                                                                                                        | Http `workspaceGet` ra đúng 2 (bỏ mock 3)                                                      |
| T-3  | SBF-16: `ResponsibilityCounts` thêm `workspaces`, `licenseLots`; mốc bàn giao, `departure-impact`, `NOTHING_TO_HAND_OVER` tính tổng mới                                                                                                             | Integration: IT chỉ phụ trách 1 workspace + 1 lô nghỉ việc ⟹ có mục bàn giao, chuyển đủ cả hai |
| T-4  | Route nhập khóa cũ: `responsibleOnly: true` và chỉ nhận lô có `legacy_subscription_id = id`; đảo test "open to every IT Admin"                                                                                                                      | Http: IT khác ⟹ 403 `LICENSE_LOT.NOT_RESPONSIBLE`; id lô mới ⟹ 404 `LICENSE_LOT.NOT_FOUND`     |
| T-5  | Khóa giá lô khi đã **từng** cấp (lịch sử cấp/kích hoạt hoặc đã có dòng `license_lot_charges`), không theo số khóa đang `ASSIGNED`                                                                                                                   | Integration: cấp → thu hồi → PATCH `unitPrice` ⟹ 409 `LICENSE_LOT.PRICE_LOCKED`                |
| T-6  | K-A6: chỉ đếm khóa thật sự mới (bỏ dòng sẽ thành `ALREADY_IN_STORE`)                                                                                                                                                                                | Nhập lại đúng lô đang đầy ⟹ mọi dòng `ALREADY_IN_STORE`, không 422                             |
| T-7  | `RUNTIME_TABLE_EXCEPTIONS` thêm `seat_changes`, `invoice_allocations` (SPEC §5)                                                                                                                                                                     | Integration vai runtime UPDATE ⟹ 42501                                                         |
| T-8  | D-6: 422 `SUBSCRIPTION.WORKSPACE_NOT_FOUND`; D-20: bỏ `K1`/`HOLDERS` khỏi enum tồn kho; `WorkspaceApi.workspaceOfSubscription`; http W3-13 (409 `AMBIGUOUS` / 422 `VENDOR_REQUIRED` / 403)                                                          | Http assert mã; `openapi:export` diff đúng ý                                                   |
| T-9  | Mở `STOCK` cho gói `ACCOUNT` (policy `license-lot.policy.ts`, trigger M6 STOCK/PURPOSE ⟹ **migration mới**, không sửa M6); tiền vào `POOL_IDLE`; seed P22a JetBrains/Visio/Sublime đổi sang `STOCK`; sửa bảng W3-25 trong SPEC-B3 kèm "Owner 25/11" | Http tạo lô `STOCK` cho gói `ACCOUNT` ⟹ 201; dòng kho tháng ghi license dư ở `POOL_IDLE`       |
| T-10 | Unit chỉ `toThrow(Class)` ⟹ assert mã lỗi (LUẬT 3) ở file làn tech; spec của `subscription.policy.ts` dời cạnh file                                                                                                                                 | —                                                                                              |

### X — Transaction (Owner 25/11)

Owner: "mọi đường ghi một transaction chuẩn; kiểm mọi chỗ cập nhật cần transaction". Audit Opus 25/11 (toàn BE, 7 module ưu tiên;
side effect đều qua outbox trong `tx`, không có listener sau commit) ⟹ 2 Important + 1 Minor sửa trong đợt; 2 Minor cũ để đợt 8.

| Mã  | Sửa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Test bắt buộc                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W-6 | Route cũ W3-13 `plan-workspace.service.ts:144-176` đang chạy **3 tx** (tạo workspace → thay admin → sửa hồ sơ) ⟹ gộp **một** `runner.run`: `resolveAndLock` (5b) một lần sau khi khóa employee (T-1), gọi biến thể nhận `tx` của admins-set/update; kiểm admin và giới hạn **một lần theo giá trị mới** (hiện `set` kiểm theo `adminLimit` **cũ** ⟹ "tăng `adminLimit` 2→4 kèm 4 admin" bị từ chối sai); `updatedAt` đọc trong tx; map `WorkspaceStaleError` ở `asPlanError`. Áp cùng chuẩn cho `PATCH /workspaces/{id}` (D-4) | Http: người giữ tài khoản khẩn cấp sai ⟹ 422 và admin **không đổi**, không có workspace mồ côi; tăng `adminLimit` 2→4 kèm 4 admin ⟹ 200; integration hai connection sửa xen ⟹ mã stale của plan |
| W-7 | TOCTOU lô `REQUEST`: `licensing/license-lot/license-lot-create.service.ts` đọc task cấp + `requireActingItAdmin` **ngoài tx**, catalog mở tx riêng ghi lô ⟹ `LicenseLotApi.createLot(tx, …)`; licensing mở **một** tx: khóa task cấp (3a), kiểm lại trạng thái/gói/người làm, rồi gọi catalog (5b → 7)                                                                                                                                                                                                                         | Integration 2 connection: hủy Request ‖ tạo lô `REQUEST` ⟹ tạo lô bị từ chối (mã lỗi), không có lô gắn Request đã kết thúc                                                                      |
| W-8 | Comment còn ghi "tier 6b" cho khóa license key (nay 7b): `license-key.service.ts:55,190`, `device-activation.repo.ts:120`, `devices/initial-record/initial-record.service.ts:50`                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                               |

Để đợt 8 (ghi `FIX-TEST-biz.md` mục "Nợ transaction"): `subscription.service.ts:204` kiểm `requireItAdmin(responsible)` ngoài tx khi
khai thuê bao; `budget-review-snapshot.service.ts:56-60` đọc `pool`/`companyMinor` ngoài tx của writer.

## Nhắc cho gói PLAN sau (không làm trong FIX-W3)

- **P10:** barrier W3-14 + http W3-11; luật `MEMBERS` đã có sẵn trong `subscription-pool.*` (làn tech viết trước) — chỉ thêm test,
  chú ý chỉ đổi `renewalDate` nay bị kiểm lại kỳ/chu kỳ; cổng ≥ 2 admin cho lô (D-29).
- **P16a:** xóa `addSeat` và ghi sổ khi mua thêm (sau M5 trigger sức chứa đọc sổ ⟹ cấp kèm mua seat trên dòng backfill hỏng tới P16a);
  integration cấp kèm mua seat trên dòng có sổ. Không deploy P11 tách rời P16a.
- **P15:** ghi giá dòng khi kích hoạt nháp (M5 đã `COALESCE(...,0)`).
- **P20:** `lockSeatTarget` của `K4` khóa lô trước (gỡ 40P01 cấp ‖ rút khóa) + barrier; kiểm tác vụ của lô `REQUEST` trong tx;
  `setInvoiceActual` chặn ghi đè; `fromPool` không coi lô `REQUEST` của chính Request là kho; giá Request `K4` lấy từ lô; barrier
  cấp ‖ kích hoạt; tiền lô theo `QĐ-120a` — ca kiểm: A 36 tr/n 3/m 1 ⟹ u 12 tr, `POOL_IDLE` 24 tr; A 39,6 tr ⟹ u 13,2 tr, tỷ lệ Trống
  trên giá chưa thuế 66,7 %; A 10.000.000/n 3 ⟹ 3.333.333 / … / 3.333.334 (diệt `ceil`); m = n = 3, A 10.000.001 ⟹ phòng chịu đúng A;
  A 33 tr ⟹ `POOL_LOT_DIFFERENCE` −2 tr.
- **P22b/P23:** gỡ trigger cầu nối test `legacy-perpetual-lot-bridge.ts` (ghi FIX-TEST), dọn mã `W3-xx` trong comment `src`, dọn
  `SUBSCRIPTION_SEATS_REDUCED` và code chết (`assertKeysWithinLicenses`, `costBorneOf`, `SeatMonthPoolService`, repo tháng cam kết).

## Xong khi

Mỗi mục có test như bảng, bộ kiểm nhanh xanh, commit theo LUẬT 7; `PROGRESS-biz.md` mục **FIX-W3** bảng mã → test → file:line; CI tay
trên `int/redesign-w3` sau khi xong cả mục X, các spec của FIX-W3 xanh.
