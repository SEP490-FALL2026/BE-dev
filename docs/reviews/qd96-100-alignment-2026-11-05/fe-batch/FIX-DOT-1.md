# Danh sách sửa sau review Đợt 1 (06/11/2026)

Nguồn: 5 review tĩnh (personnel/identity, requests/licensing, budgets, G7, renewal/member/seed/E2E) trên cây chưa commit, base
`808318a4`. Mức: **C** cao (phải sửa trước khi giao FE), **T** trung (sửa tối nay), **L** thấp (sửa nếu gọn, không thì ghi vào
đợt sau). Mỗi mục sửa kèm test chứng minh (đỏ trước/xanh sau khi được). Sửa xong ghi mục _Changes and acceptance_ của spec liên quan.

Luật chung: như `PROMPT-SONNET-DOT-1.md` (CHỐNG SA ĐÀ, KIỂM TRA, GIỚI HẠN); integration trên `slm-test-db`; migration mới đặt timestamp
theo vùng của chat (Chat 1: `20261108100300+`, Chat 2: `20261108200000+`, Chat 3: `20261107000400+`, Chat 4: `20261108300000+`);
OpenAPI sửa xong thì `pnpm openapi:export` + manifest; mỗi chat chỉ sửa vùng file của mình.

## Chat 1 — personnel / identity-access

| #     | Mức | Việc |
| ----- | --- | ---- |
| P-0   | C   | **Bước 5 chưa làm**: `qd96-100-transfer-review-defaults` Task 2 (bỏ `NEEDS_NEW_TOOL`/`newToolNote` ⟹ 422, giữ giá trị enum cũ chỉ để đọc lịch sử) + `qd96-100-transfer-replacement-request` Task 0 (`reason` trim 1..500 bắt buộc). `transfer-review.dto.ts:29-36`, `transfer-review-decision.service.ts:88`. |
| P-H1  | C   | Hủy hồ sơ sau khi IT ghi khóa tài khoản vỡ CHECK (migration `20261108100100` chỉ cho `HANDING_OVER/LEFT`) ⟹ 409 `CONCURRENT_CHANGE`. Cho `CANCELLED` giữ `account_lock_at`. Test khóa rồi hủy. |
| P-M1  | T   | `AccessBlockRepo.upsert` (`access-block.repo.ts:48-70`) không được dời lệnh chặn đang hiệu lực về sau / bỏ releasable sai (giữ `LEAST`). |
| P-M2  | T   | Hủy hồ sơ `BLOCK_NOW` ⟹ bị chặn vĩnh viễn. Mở rộng `appUserUnlock` (SA, có `reason`, QĐ-81): xóa lệnh chặn `releasable` trong cùng transaction + Audit; chưa releasable ⟹ 409 `ACCESS_BLOCK_NOT_RELEASABLE`. |
| P-M3  | T   | `offboarding_cases_guard`: luật "khóa tài khoản ghi một lần" áp cả `OLD.state = 'HANDING_OVER'`. |
| P-M5  | T   | Test guard/login với múi giờ tổ chức ≠ UTC; ca P-H1, P-M1. |
| P-ISS | T   | Owner chốt: `grounds.issuedOn` > hôm nay (ngày tổ chức) ⟹ 422 ở mọi op có `grounds`. |
| P-L   | L   | L2 `accessBlockedFrom` null cho `CANCELLED`, tra theo `source_case_id`; L3 `accountLockMissing` tính cả `HANDING_OVER` đã chặn; L4 listener không mặc định `WITH_LAST_DAY` + `DROP DEFAULT access_block_mode`; L5 `AccessBlockService.set` không thấy nhân viên ⟹ throw; L6 CLI `--basis-type` kiểm 3 giá trị. |
| P-M4  | ghi | Hủy hồ sơ không rút tác vụ thu hồi đã mở — phần B (`revocation-deadline-and-withdraw`); ghi rủi ro trong spec. |

## Chat 2 — requests / licensing grant / budgets (được sửa `src/` của các vùng này)

| #     | Mức | Việc |
| ----- | --- | ---- |
| R-H1  | C   | Cầu nối R1 đặt ngày kết thúc cho **mọi** quyền. Spec `approved-end-date:87`: nội bộ miễn phí, tài khoản dịch vụ ⟹ `null`. Mang nhánh/cờ `termBound` trong answer `GRANTABLE` (`grant.policy.ts`), `endOfTerm` chỉ khi có phí và không phải `SERVICE`. Test 2 ca null. (Lỗi do hướng dẫn R1 của điều phối viên.) |
| R-M1  | T   | "Linh hoạt" đọc từ thuê bao IT đang cấp (`target` khóa theo `subscriptionId`), không `getPlanPrice` (`provisioning-grant-writer.service.ts:121`, `request-facts.service.ts:228`). |
| R-M2  | T   | `renewalEndOf` (`core/term-limit.ts:58-62`) cắt ở cuối năm tài chính cho gói linh hoạt (dùng `effectiveEndOf`, start = ngày sau ngày hết hoặc hôm nay nếu đã hết). Unit test ngày cụ thể (cuối tháng, đã hết, cắt linh hoạt). |
| R-M3  | T   | Request tiếp tục đúng hạn: giá + `budgetYear` theo ngày bắt đầu kỳ mới (`addDays(previousEnd,1)`), không theo hôm nay (`renewal-request-writer.service.ts:54`). |
| R-M4  | T   | Request tiếp tục trễ (NEW_REQUEST): không truyền `expectedEndDate` (`renewal-request.service.ts:104`), để ngày tính lúc cấp. |
| R-M5  | T   | OpenAPI: gỡ mã không còn xảy ra (`NO_SPEND_FOR_FREE_SOFTWARE`, `RENEWAL_REQUEST.END_NOT_AFTER/END_TOO_FAR` + `checkNewEnd`, `SPEND.PLAN_LINE_NOT_UPDATED`), sửa mô tả còn nhắc dòng kế hoạch/xác nhận thời hạn (danh sách file trong review requests M5). R7: `@ApiTags('grant-queue')`. |
| R-D2  | T   | `spend-decision.service.ts:74-87`: kiểm người quyết (hoặc người thay) **trước** khi khóa hàng và trả 404/409 trạng thái; sửa flow `mf1-request-contract.flow-spec.ts:188,194`. |
| R-D1  | T   | IT tự tạo tác vụ cấp cho Request của chính mình: gọi `selfExecutionMode` cả nhánh cá nhân (`provisioning-grant-writer.service.ts:57-71`) — QĐ-77m; flow `mf1-request-contract.flow-spec.ts:204-205` đổi thành 403. |
| B-M1  | T   | Policy kiểm ngân sách bỏ hẳn luật ngưỡng giá trị cao (`budget-check.policy.ts:118-119`), QĐ-97c; phiên bản cũ còn ngưỡng không còn tác dụng. |
| B-M2  | T   | `send`/`decide` phiên bản `kind = 'REVISION'` ⟹ 409 (revision đã gỡ). |
| B-M3  | T   | Sửa `base` mà dự phòng đang bằng mặc định ⟹ tính lại dự phòng mặc định (`version-figures.service.ts:53-58`). Integration test. |
| B-M4  | T   | OpenAPI budgets: `budgetVersionSend` khai `RESERVE_REASON_REQUIRED` thay `REVISION_REASON_REQUIRED`; bỏ mô tả threshold/window/PROPOSAL_INCOMPLETE/WINDOW_BACKWARDS; manifest `openapi-example-route-codes-budgets.ts:181,189`. |
| B-L   | L   | `reserveReason` vào lịch sử (`version-history.policy.ts`), cho phép `null` để xóa, CHECK DB (`btrim <> ''`, độ dài); code chết revision/plan-line (`version-line-moved.service.ts`, lỗi không còn ném, `planLineOverdue`, `fallback`). |
| T-1   | T   | `dot-1-removed-fields.http-spec.ts`: mỗi ca field bỏ có body đối chứng hợp lệ + assert `issues[].path` chứa đúng key bỏ (đặc biệt ca budgets 202-209 đang 422 vì `currency`). |
| T-2   | L   | `budget-year-end.integration-spec.ts:82` khôi phục `toEqual` (có `years`); ca SKIPPED `OVERRIDE_REQUIRED` của duyệt hàng loạt; `renewal-request.policy.spec.ts` bỏ test `checkNewEnd` 120 tháng (R8). |
| R-L   | L   | Code chết request (`GroupBody.expectedSpendOn`, `approves`, `assessment` inject, `setSpendPlan`, select cột plan-line, `termCheck` gọi `getPlanPrice` lần hai). |

## Chat 3 — G7 devices / usage / security

| #     | Mức | Việc |
| ----- | --- | ---- |
| G-H1  | C   | `credential-throttler.guard.ts:13-17`: token máy giả trên route bất kỳ ⟹ bucket riêng, vượt giới hạn reset mật khẩu và chống flood. Chỉ dùng `device:<id>` khi route có metadata `@DeviceAuthenticated` (reflector); còn lại luôn `req.ip`. Test. |
| G-M1  | T   | Trên route thiết bị, bucket theo id chưa xác thực ⟹ ai biết id làm collector 429 mãi. Trước xác thực đếm theo `ip` (hoặc `ip+id`); bucket `device:<id>` chỉ đếm sau `verify()` OK. |
| G-M2  | T   | Xoay token bằng secret cũ (PREVIOUS) làm mất ân hạn (`credential.policy.ts:135-142`); giữ `previousSecretHash/previousValidUntil` như spec `g7-device-credential-enrollment:255`; sửa unit test. |
| G-ACC | T   | Verifier kiểm `isAccessBlocked` (chặn theo ngày cuối của Chat 1) ⟹ 401; test trước/sau ngày cuối, `BLOCK_NOW`. Sửa đỏ do G7: `personnel-file-hooks` (hook thiếu `onRecorded`), `mobile-session-roles`. |
| G-L   | L   | L1 `markSecretUsed` thêm `AND secret_hash = …`; L2 cùng hash ⟹ `generated_at = GREATEST(...)`; L3 tạo credential AI mới ⟹ thu hồi credential AI đang sống của đăng ký (hoặc partial unique index); L7 `openapi-response-examples` yêu cầu 3 mã 401 thiết bị. |

## Chat 4 — subscription renewal / member detail / seed / E2E

| #     | Mức | Việc |
| ----- | --- | ---- |
| A-H1  | C   | Trưởng phòng sở hữu tự đề xuất (là IT Admin) ⟹ hồ sơ kẹt im lặng. Chốt: từ chối lúc đề xuất 409 `PROPOSER_IS_OWNER_HEAD` (IT khác đề xuất). Integration test. |
| A-H2  | C   | Đề xuất cũ (`PROPOSAL_STALE`) là ngõ cụt vĩnh viễn. Chốt: khi confirm gặp stale ⟹ trả 409 và đóng hồ sơ ở trạng thái kết thúc (vd `STALE`) trong cùng transaction để IT đề xuất lại (`ALREADY_PROPOSED` bỏ qua hồ sơ đã đóng); list hiện lý do. Không thêm route. Test. |
| A-M1  | T   | `readScopeOf` (`subscription-renewal-parties.service.ts:85-92`): người đang là trưởng phòng hôm nay đọc được hồ sơ phòng mình **không cần vai `MANAGER`** (khớp người quyết). |
| A-M2  | T   | `renewal-decision.service.ts:62-79`: xác định người quyết/phạm vi đọc **trước** khi đọc snapshot tài chính và khóa hàng; ngoài phạm vi ⟹ 404, trong phạm vi nhưng không phải người quyết ⟹ 403 `NOT_DECIDER`. |
| B-L1  | L   | `open-request.repo.ts:46-53` trang + đếm cùng snapshot RepeatableRead như `heldPage`. |
| C-M1  | T   | Cập nhật spec/plan `qd96-100-seed-demo-v3` (mục _Changes_): marker `SV`, `saoviet.example`, `NV-*`/`CC-*`, mã phòng không tiền tố, ngân sách 2 năm; phần A1 (R10–R16, ngân sách 6 phòng) hoãn tới Đợt 3; bảng tài khoản đăng nhập mới. |
| C-L   | L   | Code chết `spendDay`, `forceNextFiscalYear`; README fixture; test "không chữ demo" quét cả EXTRAS, FINANCE, `revocationNote`, chuỗi trong `steps/`. |
| D-M3  | T   | `mf4-budget.flow-spec.ts`: `toContain('3000000')` → so khớp chính xác; assert response kiểm ngân sách; nhánh refused không ném TypeError; ghim một status (không `[409,422]`). |
| D-M4  | T   | Thêm ca thiếu: F0-01 vai gọi ngoài vai 403, INVITED 401; F4-01 `costCenterId`/`currency` 422; F5-02 SoD-3, `NO_HEAD`+cảnh báo, sai số `releasedAssignmentIds`, field trên RENEW/CANCEL, `acknowledgeActiveUsers`, trưởng phòng khác 404, A-H1, A-H2. Sau đó viết F2/F3 (Chat 1 xong) và G7-01 (Chat 3 xong G-ACC). |
| D-L   | L   | Đồng hồ giả bắt đầu không trước giờ thật; dọn DB clone khi app lỗi; spec E2E mục lệch (7) cập nhật. |
