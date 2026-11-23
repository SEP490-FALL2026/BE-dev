# PROGRESS — Đợt 2 thiết kế lại, làn `biz` (thẳng trên `int/redesign-w2` — Owner)

Tracker sống qua compact context. Người code đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối
mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp:** đọc lại `SKILL.md` của process skill, TDD skill, `superpowers:verification-before-completion`;
  đọc lại SPEC/PLAN của gói kế (CODE-PROMPT mục 0).
- **Chế độ tự quyết:** câu hỏi nhỏ ⟹ chọn theo căn cứ, ghi `OVERNIGHT-DECISIONS-biz.md`; chỉ dừng ở CODE-PROMPT mục 5.
- **Đã chốt:** SPEC mục 13 (W2-D1 → W2-D18, 13.3 quyết định Owner + QĐ-118) và dòng `Owner đã chốt:` của CODE-PROMPT. Không hỏi
  lại. Q7 → Q9 đã chốt (SPEC §14).
- **Nền:** làm thẳng trên `int/redesign-w2` (Owner tạo từ `dev` mới nhất, có `4e029dbd` làm tổ tiên). Pha B chỉ sau khi Owner đã
  merge pha 1 của làn `tech` vào `int/redesign-w2` và đã `git pull --ff-only`. Không sửa `prisma/**`, `src/cli/seed/**` (của làn
  `tech`). Commit bằng git identity của Owner; push `int/redesign-w2` được; không merge vào `dev`/`main`, không deploy, không
  co-author. Báo lỗi quyền gắn máy (W2-24) **không** làm (đợt 7).

## Gói

| Gói   | Mục                                   | Trạng thái | sha | Lệnh kiểm + kết quả | FIX-TEST thêm | D-n | Ghi chú / chưa kiểm được |
| ----- | ------------------------------------- | ---------- | --- | ------------------- | ------------- | --- | ------------------------ |
| B0    | policy thuần (pha A)                  | xong       | 0586ed00       | `tsc --noEmit` (0), `eslint` 10 file (0), `depcruise` (0), `arch:capabilities` (0), `rules:check` (0), `test:gates` (17/17, 335 pass), `openapi:export` (0 diff), unit B0 (5/5, 143 pass) | —             | D-1 | Chưa đẩy remote (`origin/int/redesign-w2` chưa tồn tại); chạy bằng binary cục bộ do sandbox chặn đọc config `pnpm` ngoài workspace |
| H-1   | `retireDevice` ghi `retirementKind = 'DISPOSED'` | xong | 4adeab1c | `eslint` 2 file (0), `tsc --noEmit` (0), `depcruise` (0), `arch:capabilities` devices (0), `rules:check` (0), `test:gates` (17/17, 335 pass), `openapi:export` (0 diff), `registry.repo.spec.ts` (1/1) | — | — | Sửa theo H-1 review T1 (tránh 500 CHECK `managed_devices_retired_complete`) |
| B1    | W2-03, W2-05 + đăng ký provider T2/T5 | chưa       |     |                     |               |     |                          |
| B2a-1 | W2-06, W2-08                          | chưa       |     |                     |               |     |                          |
| B2a-2 | W2-09                                 | chưa       |     |                     |               |     |                          |
| B2b   | W2-07                                 | chưa       |     |                     |               |     |                          |
| B3a-1 | W2-19 licensing                       | chưa       |     |                     |               |     |                          |
| B3a-2 | W2-19 devices, W2-03 (b)              | chưa       |     |                     |               |     |                          |
| B3b   | W2-20, W2-22                          | chưa       |     |                     |               |     |                          |
| B4    | W2-10, W2-11, W2-12                   | chưa       |     |                     |               |     |                          |
| B10a  | W2-27 (a), H1                         | xong       | 03ea1c6b | `eslint` 40 file (0), `tsc --noEmit` (0), `depcruise` (0, 2732 modules), `arch:capabilities` org (0), `rules:check` (0), `test:gates` (17/17, 335 pass), `openapi:export` (ok), unit `organization` (41/41, 374 pass); cập nhật unit `department.policy.spec.ts` / `organization-read.api.spec.ts` theo SPEC W2-27 (a), H1 | 1 dòng (`department-contract-http`) | — | I mới `department-it-substitute.integration-spec.ts` chỉ chạy trên CI |
| B5a   | W2-14 sinh/đổi hạn/hủy, E4            | chưa       |     |                     |               |     |                          |
| B5b   | W2-14 danh sách/hoàn tất, W2-15       | chưa       |     |                     |               |     |                          |
| B5c   | W2-14 quá hạn/chờ, W2-26 (mã)         | chưa       |     |                     |               |     |                          |
| B6    | W2-18 requests, S-4 grant             | chưa       |     |                     |               |     |                          |
| B7    | W2-13                                 | chưa       |     |                     |               |     |                          |
| B8    | W2-23                                 | chưa       |     |                     |               |     |                          |
| B10b  | W2-27 H2–H4                           | xong       | aae7883b | `eslint` 30 file (0), `tsc --noEmit` (0), `depcruise` (0, 2735 modules), `arch:capabilities` lic (0), `rules:check` (0), `test:gates` (17/17, 335 pass), `openapi:export` (ok), unit `provisioning`+`http-errors` (22/22, 353 pass); sửa unit `provisioning.policy.spec.ts` / `provisioning-task-frame.service.spec.ts` theo SPEC W2-27 H2–H4, Q9 | 10 dòng (`licensing-provisioning-*`, `provisioning-*`, `grant-self-claim`, `dashboards-http`, `mf1-request-contract`) | D-2 | I mới `provisioning-in-charge.integration-spec.ts` chỉ chạy trên CI |
| B10c  | W2-27 H5–H7                           | xong       | `a3b781e2` (B10c-1), `38a0203f` (B10c-2) | `B10c-1`: 21/21 unit (172 pass), `B10c-2`: `prisma validate`/`generate` ok, `eslint` 28 file (0), `tsc` (0), `depcruise` (0, 2740 modules), `arch:capabilities` lic/notif (0), `rules:check` (0), `test:gates` (17/17, 335 pass), `openapi:export` (ok), unit `saas-issue`+`notifications` (25/25, 838 pass) | 8 dòng (`subscription-renewal-*`, `ghost-seat-*`, `saas-issue-*`) | D-3 | Đã thêm migration 4 `20261124100400_saas_issue_awaiting_assignee` + `SAAS_ISSUE_AWAITING_ASSIGNEE` |
| B10d  | W2-27 (c), W2-26 (mã)                 | xong       | b7449bcf | `eslint` 24 file (0), `tsc --noEmit` (0), `depcruise` (0, 2744 modules), `arch:capabilities` id/org/notif (0), `rules:check` (0), `test:gates` (17/17, 335 pass), `openapi:export` (0 diff), unit `notif`+`org`+`it-coverage` (63/63, 1192 pass); sửa `inbox.policy.spec.ts:349` cho phép `departmentName` (SPEC §5.5 (c) W2-27 `:1132` bắt buộc params `departmentName` ở `DEPARTMENT_IT_COVERAGE_MISSING`, không phải tên người) | — | D-4 | `ItCoverageSweeper` kiểm `!isWeekend` (`D-4`, cần Owner); I `department-it-substitute.integration-spec.ts` thêm ca (b) thông báo & (i) sweeper chỉ chạy trên CI |
| B10e  | W2-27 H9–H11 (Q8)                     | đang làm   |     | `B10e-1`: `eslint` (0), `tsc` (0), `depcruise` (0, 2745 modules), `arch:capabilities` lic (0), `rules:check` (0), `test:gates` (17/17, 335 pass), `openapi:export` (ok), unit `saas-issue` (5/5, 60 pass) | 3 dòng (`saas-issue-handling`, `saas-issue-department`, `saas-issue-notifications`) | D-5 | Tách theo module: xong `B10e-1` (licensing H9 + I mới `saas-issue-in-charge.integration-spec.ts`), còn `B10e-2` (requests H10+H18) và `B10e-3` (optimization H11+H18) |
| B10f  | W2-27 H12, H13 (Q8)                   | chưa       |     |                     |               |     |                          |
| B10g  | W2-27 H15 (Q8)                        | chưa       |     |                     |               |     |                          |
| B11   | W2-28 (RC-9)                          | chưa       |     |                     |               |     |                          |
| B9    | chốt làn, W2-26 (tài liệu)            | chưa       |     |                     |               |     |                          |

Trạng thái: `chưa` · `đang làm` · `xong` · `dừng hỏi` · `bị chặn`.

## Phụ thuộc đợt 1 (SPEC mục 12) — kết quả kiểm lúc tách nhánh

| Dòng | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| D-1 → D-10 | khớp `4e029dbd` | Nhánh `int/redesign-w2` (`c4be9b59`) có tổ tiên `4e029dbd`, các commit sau chỉ cập nhật docs (`#78`, `#79`, `#80`) |

## Bàn giao cho làn tech (file của làn tech cần sửa)

| Gói | File | Việc |
| --- | ---- | ---- |

## Bị chặn

## CI GitHub

| Lần | Commit | Link run | Kết quả từng job |
| --- | ------ | -------- | ---------------- |

## Dừng ở đâu
