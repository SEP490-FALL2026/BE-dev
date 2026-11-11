# PLAN v2.1 — MF-2, MF-3 và các thay đổi đi kèm (`QĐ-110`)

> **v2.1 (11/11):** theo SPEC v2.1 — kế nhiệm bắt buộc (MF2-B, MF3-A), X-IT thêm `QĐ-110u`/`QĐ-110v`, gói mới **RD** (ba màn đọc), một chat code tuần tự thay hai làn, seed sửa
> `NV-ITA2`. Nhánh `feat/mf2-mf3` chậm 4 commit so với `origin/dev` (`fix/flows-v4` đã merge qua PR #43/#44) ⟹ cập nhật ở §0.

> **Cho chat code:** đọc [SPEC.md](SPEC.md) (§4 API, §5 gói, §6 dữ liệu) và luật [QD-110-DRAFT.md](QD-110-DRAFT.md). Cần `file:line` hiện
> trạng ⟹ [A3](A3-MF2-CODE-API.md) (MF-2), [A4](A4-MF3-CODE-API.md) (MF-3), [R2](R2-DATA-HANDOVER-IMPACT.md) (bàn giao). Spec thắng báo cáo.
> Không có `plan.md` hạng mục riêng — plan này là nguồn task.

**Cách làm (Owner chốt 11/11 — thay mô hình hai làn):** **một chat code (Sonnet, effort high)** làm tuần tự từng gói theo bảng §1 trên
một nhánh `feat/mf2-mf3`, không worktree, không làn song song. Năm pha:

1. **Code từng gói:** code + tự đọc lại diff của gói + test nhanh (`pnpm typecheck`, `pnpm lint` và 1–2 file test của gói, vài giây). Không
   chạy full suite, không integration/HTTP toàn bộ.
2. **Tự review tổng thể** sau gói cuối (trước Z): đọc lại toàn bộ diff so với SPEC §1 S1–S14 và §4 P1–P24, sửa chỗ lệch.
3. **Full test + chạy thật:** `pnpm check`, `pnpm test:http`, `pnpm test:integration`, `pnpm test:flows`, gọi API trên DB có dữ liệu thật
   (seed v4 hiện tại) ⟹ sửa lỗi tới xanh.
4. **Seed (gói Z):** sửa seed v4, reset DB local, seed lại, chạy lại `test:flows` + vài kịch bản tay ⟹ sửa seed.
5. **Bàn giao chat review** (chat này): review/verify logic, luồng, kiến trúc, migration/authz ⟹ chat code sửa ⟹ full test lần cuối ⟹ Owner
   duyệt push/merge `dev`/deploy.

Cột "Cỡ" là độ lớn tương đối để chia task, **không** phải giờ đồng hồ.

**Stack:** NestJS + Prisma + PostgreSQL, modular monolith (`src/modules/*`, tầng ở `scripts/arch/tiers.cjs`: `requests` T5 không import
`personnel` T6 ⟹ extension point `Hook`/`Listeners` do `personnel` bind trong `*.listener.ts`), sweeper trong API process (ADR-0018), Jest.

## 0. Trước gói đầu tiên

- [ ] Owner duyệt SPEC v2.1; Docs `QĐ-110` đã commit (pin Docs mới ghi vào đầu SPEC).
- [ ] Repo chính đã ở `feat/mf2-mf3` (`a2dad526`) với ~206 thay đổi tài liệu chưa commit ⟹ Owner commit chúng, rồi `git merge origin/dev`
      (`4f1c510d`, gồm `fix/flows-v4`) vào `feat/mf2-mf3` trước X0. Kiểm lại `rules:check` + `test:gates` sau merge.
- [ ] Docker chạy được; đếm SQL ở SPEC §6 trên DB có seed v4, ghi vào `HANDOFF.md`.

## 1. Thứ tự gói (tuần tự, một nhánh)

| #   | Gói   | Cần trước | Cỡ  | Ghi chú                                       |
| --- | ----- | --------- | --- | --------------------------------------------- |
| 1   | X0    | §0        | M   | nền dùng chung                                |
| 2   | X-H   | 1         | M   | bỏ bàn giao (pha A)                           |
| 3   | X-SA  | 1         | M   | bỏ tài khoản dịch vụ (pha A)                  |
| 4   | MF2-A | 1         | S   |                                               |
| 5   | MF2-B | 4         | S   | gồm kế nhiệm bắt buộc (policy chung)          |
| 6   | MF2-C | 5         | S   |                                               |
| 7   | MF2-D | 1         | M   |                                               |
| 8   | MF2-E | 6, 7      | M   |                                               |
| 9   | MF2-G | 2, 3, 8   | S   | **mốc:** MF-2 trọn (S1–S3, S6, S7)            |
| 10  | MF1-X | 1         | S   |                                               |
| 11  | MF3-A | 5         | S   | dùng lại policy kế nhiệm của MF2-B            |
| 12  | MF3-B | 11        | M   |                                               |
| 13  | MF3-C | 12        | M   | **mốc:** MF-3 trọn                            |
| 14  | X-IT  | 1         | M   |                                               |
| 15  | DS    | 1         | M   | **mốc:** S8–S10, S13                          |
| 16  | RD    | 9, 13, 14 | M   | ba màn đọc                                    |
| —   |       |           |     | **Pha 2–3:** tự review tổng thể, full test    |
| 17  | Z     | 16        | M   | seed + tài liệu API FE + `test:flows` (pha 4) |

Migration: timestamp tăng dần bắt đầu `20261112000000`, mỗi gói một hoặc vài file, đặt tên theo gói. Sau mỗi gói đổi route/OpenAPI chạy
`pnpm openapi:export`, `pnpm arch:routes`, `pnpm arch:graph` để file sinh không lệch.

## 2. Quy trình mỗi gói (chat code)

1. Đọc SPEC §5 gói đó + vế QĐ + dòng audit liên quan. Policy thuần (mốc ngày, phân nhánh): viết test trước, thấy đỏ rồi mới code.
2. Code theo `AGENTS.md` (capability folder, `public/` facade, không query bảng module khác, suffix đúng vai trò).
3. Migration SQL tay + `prisma/models/*.prisma`; enum `ALTER TYPE … ADD VALUE`; không drop ở đợt này (pha B).
4. Test nhanh: `pnpm typecheck`, `pnpm lint`, 1–2 file test của gói. Không `pnpm check`, không full suite (để pha 3).
5. Commit theo gói (`feat(personnel): …`), ghi một dòng vào `HANDOFF-CODE.md`: gói, commit, lệnh + kết quả thật, lệch so với spec, câu
   hỏi. Gặp luật chưa có trong QĐ-110 ⟹ dừng, hỏi Owner, không tự chế.

## 3. Review (chat review, pha 5)

Một lần sau pha 4, trên toàn bộ diff `origin/dev..feat/mf2-mf3`: đọc theo SPEC (5 trục), tự đọc migration/raw SQL/authz/test bị sửa;
mutation một điều kiện chính ở gói có luật thời gian/tiền (MF2-D, MF3-C, X0 cancellation); ghi `REVIEW.md` (mức Critical/Required/Optional).
Xong khi Critical + Required đã sửa và full test xanh lại.

## 4. Task theo gói

### X0 — nền

- [ ] `src/core/working-days.ts` `nthWorkingDayFrom(start, n, calendar)`: `start` là ngày 1 nếu là ngày làm việc, nếu không thì ngày làm
      việc kế tiếp là ngày 1. Test bảng: (Thứ Hai 06/07, 5) ⟹ 10/07; (06/07, 3) ⟹ 08/07; (Thứ Bảy 04/07, 5) ⟹ 10/07; ngày lễ bị bỏ qua.
- [ ] Tham số ở `operating-parameters/parameter-definitions.policy.ts` (nhóm `PERSONNEL`); `TRANSFER_REVIEW_WORKING_DAYS` ngừng dùng.
- [ ] `provisioning_tasks.created_by_system` + `created_by_app_user_id` nullable + CHECK; `LicensingApi.openRevocation` nhận tác nhân hệ thống;
      `RevocationSource.TRANSFER`. Integration: mở bởi hệ thống ghi đúng cột.
- [ ] Mã thông báo mới (`notifications.types.ts`, `inbox.policy.ts`): `REVOCATION_OVERDUE`, `DEPARTURE_ACCESS_BLOCKED`, `ACCOUNT_LOCK_OVERDUE`,
      `TRANSFER_GRACE_STARTED`, `TRANSFER_GRACE_ENDING`, `TRANSFER_RIGHTS_REVOKING`, `REQUEST_CANCELLED_BENEFICIARY_GONE`,
      `DEPARTMENT_SOFTWARE_PROPOSED`, `DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED`, `VENDOR_ADMINS_BELOW_MINIMUM`, `DEPARTMENT_WITHOUT_HEAD`,
      `SUBSCRIPTION_SEATS_INCREASED`.
- [ ] `groundsNote`: schema một trường (`string` 1–500) cho create/last-day-change/cancellation của offboarding và create/reschedule/cancellation
      của transfer; ghi vào cột `reference`, migration làm `type`, `issuer`, `issued_on` nullable; đọc ra giữ trường cũ (null) một bản.
- [ ] `requests/cancellation/beneficiary-gone-cancellation.service.ts` (+ facade trong `requests/public`): input (employeeId, cause
      `BENEFICIARY_LEFT`/`BENEFICIARY_TRANSFERRED`, phạm vi: mọi Request trả phí còn mở / chỉ của phòng cũ); chưa có tác vụ cấp đang chạy ⟹ hủy,
      giải phóng cam kết chưa chi (dùng `DepartureCancellationService`), thông báo người gửi + Finance; có ⟹ đánh dấu `NEEDS_IT_CHECK`, inbox
      IT phụ trách. Nhận cả `GRANT`, `RENEWAL`, dòng Request nhóm. Integration 3 ca: chưa duyệt / đã duyệt chưa cấp / đang cấp.
- [ ] Commit thư mục `docs/reviews/mf2-mf3-2026-11-10/` cùng gói này nếu chưa commit.

### X-H — bỏ bàn giao (pha A)

- [ ] `licensing.module.ts`: gỡ đăng ký `HandoverRevocationHook`, `HandoverDutySweeper`; mọi nơi gọi tạo duty → no-op (danh sách file ở R2).
- [ ] `personnel/offboarding/offboarding-handover.service.ts`: bỏ giữ gỡ gói mất dữ liệu; `checklist.dataHandover` luôn `DONE`.
- [ ] Return-request: bỏ `PROVISIONING.HANDOVER_PENDING`; `POST /return-requests/{id}/handover-confirmation` ⟹ 410.
- [ ] `/handover-duties` GET rỗng, POST 410; `rights[].handover = null`; thẻ tác vụ thu hồi thêm `plan.preRevocationNote`.
- [ ] Migration: `UPDATE` duty đang mở ⟹ `CANCELLED` lý do `RULE_CHANGED`. Dời `OperatorAuditActor` sang types dùng chung.
- [ ] Test: xóa test cổng 409/duty, sửa test còn lại (R2 liệt kê); integration MF-5 thu hồi ghost seat không sinh `HANDOVER_*`, claim không 409.

### X-SA — bỏ tài khoản dịch vụ (pha A)

- [ ] Migration cột `license_assignments.is_machine_account boolean default false`, `machine_account_note text`; chuyển Assignment loại
      _dịch vụ_ còn hiệu lực thành seat cá nhân của người chịu trách nhiệm hiện tại, bật cờ, chép lý do (theo trả lời Q2 nếu người đó không
      phải IT Admin); Request `SERVICE_ACCOUNT` mở ⟹ hủy lý do `OUT_OF_SCOPE`.
- [ ] Route tài khoản dịch vụ (P12) ⟹ 410; P13 mới (IT Admin, `note` bắt buộc khi bật). Cổng 2 ghost seat (`optimization` FR-4.9) đọc cờ.
- [ ] Gỡ listener/duty/blocker tài khoản dịch vụ ở offboarding/transfer/role-duties; seed-baseline import bỏ cột dịch vụ (hoặc map sang cờ).
- [ ] Test: HTTP 410; ghost seat bỏ qua seat có cờ; offboarding không còn blocker tài khoản dịch vụ.

### MF1-X — phòng không có trưởng phòng chờ

- [ ] `requests/access-request/routing.policy.ts`: phòng không có trưởng phòng ⟹ bước nhu cầu chờ (`WAITING_CONTROLLED`, `NO_HEAD`), trừ
      Request cá nhân của chính trưởng phòng (vẫn một bước).
- [ ] `requests/reassignment/one-step-conversion.service.ts`: không chạy khi `HEAD_PERIOD_END`; `HEAD_PERIOD_START` chuyển bước chờ cho
      trưởng phòng mới (listener có sẵn); thông báo `DEPARTMENT_WITHOUT_HEAD` cho Super Admin.
- [ ] Sửa test MF-1 đang mong một bước cho phòng không có trưởng phòng (unit/http/integration/flows) theo luật mới; không nới assert.

### MF2-A … MF2-G, X-IT, MF3-A … MF3-C, DS

Làm đúng nội dung SPEC §5 của từng gói. Ghi chú thêm:

- **MF2-B:** `departureEffectiveOn` giữ công thức (chặn ngay ⟹ hôm sau); unit + HTTP 422 khi `lastWorkingDay` ≠ hôm nay với `blockNow`.
  Kế nhiệm: một policy `successor-required.policy.ts` trong `personnel` (người là trưởng phòng hiện tại hoặc đã được gán với ngày hiệu lực
  tương lai ⟹ bắt buộc `EMPLOYEE`); dùng ở offboarding create/last-day-change và transfer create/reschedule (MF3-A gọi lại). Đường ghi từ
  `BM-09` (`super-admin-event`) cũng qua policy này; bản thân thông báo `BM-09` vẫn cho trống. HTTP 422 `PERSONNEL.SUCCESSOR_REQUIRED` cho
  `NONE` và thiếu; test cũ mong `NONE` hợp lệ ⟹ sửa theo luật mới, không nới assert.
- **MF2-D:** job theo mẫu `licensing/expiry/expiry-reminder.job.ts`; `eventKey = taskId:ngày`; unit hạn (Thứ Tư 30/09 ⟹ 01/10; ngày lễ;
  tham số = 2).
- **MF2-E:** job theo giờ trong `personnel/offboarding/`; chạy lại không báo trùng; hồ sơ hủy trước mốc ⟹ không báo.
- **MF2-G:** đóng trong cùng sweeper hoặc listener tác vụ cuối hoàn tất — chọn một, ghi lý do trong HANDOFF; integration: tác vụ thất bại ⟹
  không đóng.
- **X-IT:** P5 dùng chung cho hai route; P19 kiểm ở service tạo/sửa thuê bao và tạo kho, **theo kiểu cấp của gói** (`K2`/`K4` bắt buộc ≥ 2;
  `K1`/`K5` gửi danh sách ⟹ 422); cột `owner_account_email` (kiểm định dạng email, không lưu gì khác của tài khoản) + `admin_note`; cảnh báo
  khi người giữ quyền admin có hồ sơ nghỉ việc/điều chuyển (listener sự kiện personnel); P20 ở `organization/department-management`.
  P24: phát `SUBSCRIPTION_SEATS_INCREASED` tại **một** chỗ đổi `purchasedQuantity` tăng (tìm mọi nơi ghi cột này, gom về một service nếu
  đang rải); unit: tăng ⟹ một thông báo, giảm/không đổi ⟹ không, người ghi = IT phụ trách thuê bao ⟹ không; thuê bao chưa có IT phụ trách ⟹
  inbox IT chung.
- **RD:** RD-1 trong capability dashboard hiện có (`dashboards`), thay `offboardingHandovers` bằng mục mới (giữ khóa cũ = `[]` một bản);
  RD-2 đặt ở module đọc báo cáo đã có, đọc dữ liệu `personnel`/`licensing` qua facade `public/` (`arch:check` ngay task đầu); RD-3 tách
  phần “tính tác động” của P1/P6 thành service thuần dùng chung cho ghi và xem trước — integration: gọi preview rồi đếm bảng không đổi.
  Test bảng mốc ngày cho “lịch 10 ngày làm việc” và “đúng hạn ≤ 1 ngày làm việc”.
- **MF3-A:** test cũ của rà soát điều chuyển xóa hoặc chuyển sang `POST_SETUP_REVIEW`; không nới assert.
- **MF3-B/C:** test bảng mốc ân hạn; integration hành trình: điều chuyển 3 quyền (K1, K2, K5) ⟹ ngày 1 hủy Request cũ, mở ân hạn ⟹ xin lại
  Figma trong ân hạn được nhận (không 409) ⟹ hết ân hạn đúng 3 tác vụ thu hồi nguồn `TRANSFER` ⟹ hoàn tất ⟹ đóng một lần. Ghi nghỉ việc giữa
  ân hạn ⟹ `SUPERSEDED`.
- **DS:** HTTP theo vai (IT phòng khác ⟹ 403; nhân viên phòng khác không thấy); trùng ⟹ 409; một đề xuất mở/(phòng, ứng dụng, gói).

### Z — seed, tài liệu, flows

- [ ] Seed `src/cli/seed/fixture/shared-demo-v4/`: thêm `NV-ITA3`, chia lại phòng để mỗi IT Admin ≤ 4 (`NV-ITA2` hiện 5 phòng); bỏ mẫu
      tài khoản dịch vụ; `vendorAdmins` (≥ 2 IT Admin) cho mọi thuê bao `K2`/`K4`, `ownerAccountEmail` mẫu dạng `it-saas@<miền demo>`; mọi
      trưởng phòng trong kịch bản nghỉ/chuyển có kế nhiệm; dữ liệu đủ để RD-1/RD-2 có số (1 thu hồi quá hạn, 1 cấp lại kịp trong ân hạn); danh sách phần mềm cho ENG, DES + 1 đề xuất chờ; 1 nghỉ việc có ngày cuối, 1 chặn ngay, 1 điều chuyển
      đang ân hạn; README fixture (sửa cả N-2 của báo cáo flows: K1 có phòng sở hữu). Spec seed cập nhật. Owner chạy reset production.
- [ ] Tài liệu API FE: viết lại `flows/department-transfer.md`, sửa `flows/offboarding.md`, thêm flow danh sách phần mềm của phòng, `roles/*`,
      changelog các route 410.
- [ ] `test/flows`: viết lại kịch bản MF-2/MF-3 theo luật mới, bỏ 9 `skip`.
- [ ] Roadmap: Story MF-2/MF-3 và Story mới ⟹ `merged-dev` khi PR vào `dev`; hạng mục mới thay đích `deferred` G6.

### X-FX — tỷ giá job 01/01 (ngoài đợt, hạn `dev` trước 15/12)

- [ ] Nhánh riêng `fix/new-year-fx` từ `origin/dev`. Trong job tự tạo khoản cam kết năm mới (`docs/workspace/items/qd103-new-year-auto-commitments/`),
      thiếu tỷ giá ngày 01/01 ⟹ dùng tỷ giá gần nhất ≤ 01/01, ghi ngày tỷ giá trên khoản cam kết; không có tỷ giá nào ⟹ hành vi cũ.
- [ ] Unit 3 ca (có 31/12 không có 01/01; có cả hai; không có gì) + integration theo file job. 2–3 giờ.

## 5. Tự rà

- Mọi `P1…P20` và `S1…S12` có gói: P1/P2 ⟹ X0 + MF2-B/C; P3 ⟹ MF2-A/D + X-H/X-SA; P4 ⟹ MF2-G; P5/P19/P20 ⟹ X-IT; P6/P9 ⟹ MF3-A; P7/P8 ⟹
  MF3-B; P10 ⟹ MF3-C; P11 ⟹ MF1-X; P12/P13 ⟹ X-SA; P14/P15 ⟹ X-H; P16–P18 ⟹ DS; P21–P23 ⟹ RD; P24 ⟹ X-IT. S13 ⟹ X-IT; S14 ⟹ RD.
- Kế nhiệm bắt buộc (`QĐ-110h`) có ở P1 (MF2-B) và P6 (MF3-A), một policy chung.
- Hàm dùng chéo được định nghĩa ở gói trước: `nthWorkingDayFrom`, `BeneficiaryGoneCancellation`, `created_by_system` (X0).
- Rủi ro lớn nhất: MF1-X đổi MF-1 đã deploy (test MF-1 nhiều chỗ mong một bước); X-SA chuyển dữ liệu cũ (đếm trước, Q2); hook `requests` →
  `personnel` ở MF3-C (`arch:check` ngay task đầu).
