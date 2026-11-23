# SPEC — fix G3: dòng "có tên, ngày trống" của nguồn có *ngày hoạt động cuối* (V-Q14)

- Nhánh: `fix/usage-listed-empty-date-g3` từ `origin/dev` (đọc tại `c4be9b59`).
- Cỡ: **S** — 1 file nguồn + 1 dòng fixture demo + test. Không migration, không đổi contract API/OpenAPI, không đổi cấu hình nguồn.
- Quyết định Owner (V-Q14): nguồn có *ngày hoạt động cuối* (báo cáo `AGGREGATE`, capability `lastActivity`) mà dòng có tên, ô ngày trống ⟹ **chưa từng hoạt động** (`G3`). Chỉ nguồn *chỉ danh sách thành viên* và nguồn *nhật ký sự kiện* (`EVENT`, gồm log đăng nhập) mới coi dòng không ngày là *có xuất hiện*.

## 1. Vấn đề

CSV *Export users* của Atlassian liệt kê mọi thành viên site; người được mời mà chưa từng mở Jira có ô `Last seen in Jira - <site>` trống. Hiện tại BE giữ dòng đó thành một lần xuất hiện `AUTH_ONLY` vào ngày cuối cửa sổ ⟹ `appeared = true` ⟹ `assessUsage` ra `INACTIVE` (`G4`, số ngày = mọi ngày bao phủ) thay vì `NEVER_ACTIVE` (`G3`). Phụ hệ: `lastAuthOnlyDate = window.to` ⟹ `contradictionsOf` thêm câu sai *"the person logged in after the last day of activity"* ⟹ mức tin cậy bị hạ một bậc vô cớ.

## 2. Luật (BRD 4.x, `Docs/Requiments/BRD - ...md`)

- 5.4.1: **G3** = *Seat đã gán nhưng **chưa từng** có hoạt động*; **G4** = *Seat từng dùng nhưng **đã ngừng***.
- `FR-4.1`: dạng **tổng hợp** = *mỗi người một dòng, thường có ngày hoạt động cuối*; nguồn chỉ cho bằng chứng dương **không** được dùng để kết luận *không hoạt động*.
- `FR-4.4`: *Chỉ có danh sách thành viên* ⟹ chỉ G1, G2; *+ ngày hoạt động cuối* ⟹ G1–G4.
- `FR-4.10`: *Chưa từng hoạt động — có dữ liệu bao phủ, người này không xuất hiện — kết luận được → G3*; *Chưa khớp được danh tính — không kết luận, vào hàng đợi*.
- `FR-4.11`: *Sự kiện chỉ xác thực không tính là hoạt động*.
- `FR-4.3`: cửa sổ bao phủ bắt buộc (tránh kết luận nhầm *chưa từng hoạt động* ngoài cửa sổ).
- `FR-4.9` cổng 1–8, `TC-2` (không báo động giả), `FR-4.14` (tín hiệu mâu thuẫn hạ tin cậy).

Đọc luật: với nguồn có ngày hoạt động cuối, ô trống chính là câu trả lời của nhà cung cấp "chưa từng" — không phải "có mặt". Dòng đó không phải sự kiện xác thực, nên việc biến nó thành `AUTH_ONLY` là sai nghĩa với `FR-4.11`.

## 3. Hiện trạng (origin/dev `c4be9b59`)

Đường đi thật:

1. Đọc file: `src/modules/usage/vendor-import/parse/csv-report.policy.ts:66-83` — ô ngày trống ⟹ `lastActivityDate: null`, `activeDates: []`, `events: []`. JSON: `json-report.policy.ts:51-65` — `activity` vắng hoặc `lastActivityDate: null` ⟹ giống hệt.
2. Phân loại dòng: `vendor-import-parse.policy.ts:88-91` `isListedOnly(raw)` = không ngày, không ngày cuối, không sự kiện — **không xét nguồn**.
3. `vendor-import-parse.policy.ts:215` gom mọi dòng `isListedOnly` vào `listed`; `:191-202` `judgeAgainstWindow` đẩy `{ date: window.to, eventClass: 'AUTH_ONLY', basis: 'ACTIVE_DATE' }` cho dòng `listed` không lỗi, không phải bot. Comment `:191` và `:204-209` (`parseReport`) mô tả hành vi này ("a member listed, a person with no activity ... one appearance").
4. Ghi: `confirmation/vendor-import-confirmation.policy.ts:55-75` `daysToWrite` ghi ngày đó vào `usage_activity_days` (`event_class = AUTH_ONLY`).
5. Bằng chứng: `usage-evidence/usage-evidence.service.ts:95-114` — `appeared = own.length > 0` (đếm cả `AUTH_ONLY`), `lastAuthOnlyDate = ngày AUTH_ONLY cuối`; `:89-91` chỉ giữ nhân viên `appeared || mappingChangedOn`.
6. Gộp: `optimization/usage-rules/usage-assessment.policy.ts:175-220` (`personEvidenceOf`, `chainEvidenceOf`) — `appeared` OR qua mọi nguồn (kể cả nguồn không kết luận được).
7. Cổng + đánh giá: `usage-rules-seat.service.ts:113-133` → `evidenceGateOf` (`usage-gates.policy.ts:146-160`, TC-2 `unmatchedGateOf :119-132`: `!appeared && unmatched.length > 0` ⟹ `UNMATCHED_IDENTITY`) → `assessSeat :213-257` (cổng bao phủ `coverageGateOf`, rồi `assessUsage`).
8. `assessUsage` `usage-assessment.policy.ts:102-126`: `!lastActiveDate && !appeared` ⟹ `NEVER_ACTIVE` (G3, `ACTION`); ngược lại `INACTIVE`/`ACTIVE` với `inactiveDays = daysAfter(ranges, lastActiveDate)`.
9. Tin cậy: `confidence.policy.ts:56-76` `contradictionsOf` — `lastAuthOnlyDate` sau ngày hoạt động cuối ⟹ một câu mâu thuẫn.

Nơi khác đọc `usage_activity_days`/`appeared` (đã kiểm, **không bị ảnh hưởng về nghĩa**):

- `usage-overview.repo.ts:103-106`, `usage-employee.repo.ts:66-70`: chỉ `VALUE`/`PASSIVE` ⟹ UI "ngày hoạt động" không đổi; không có UI/KPI nào hiển thị `appeared`.
- `usage-evidence.repo.ts:151-174` (`unmatched`): `last_date` chỉ `VALUE`/`PASSIVE`.
- `vendor-import-people.service.ts`: mapping viết theo `outcome = MATCHED` (không theo ngày) ⟹ người dòng trống vẫn được gắn danh tính; hàng đợi chưa khớp theo `outcome`; finding `FR-4.8` chỉ `VALUE`/`PASSIVE`.
- `vendor-account-review/*`: đọc finding + hàng đợi, không đọc ngày.
- `identity.repo.ts:306-336` `reopenAfterEnd`: dùng ngày ghi để biết "lần nhập thấy cuối" khi mapping không có dòng hàng đợi — xem ca biên E7.

## 4. Thay đổi

### 4.1 `src/modules/usage/vendor-import/parse/vendor-import-parse.policy.ts` (thay đổi duy nhất trong `src`)

Trước (`:88-91`, `:215`):

```ts
/** Whether the row names no date, no last activity and no event: it only says the person is there. */
function isListedOnly(raw: RawReportRow): boolean { ... }
...
const listed = new Set(raw.rows.flatMap((row, index) => (isListedOnly(row) ? [rows[index]] : [])));
```

Sau (ý định; tên có thể khác, giữ nguyên `isListedOnly`):

```ts
/**
 * Whether a row that names no date says the person is there. A vendor that tells the last activity in a report of one row per person
 * (`AGGREGATE`) leaves the date empty for a person who never used the application: that row is no appearance, the person was never
 * active (`G3`). A source that only lists members, and a log of events, keep such a row as one appearance.
 */
function emptyRowIsAppearance(source: ReadingSource): boolean {
  return !(source.reportShape === 'AGGREGATE' && source.capabilities.lastActivity);
}
...
const listed = emptyRowIsAppearance(input.source)
  ? new Set(raw.rows.flatMap((row, index) => (isListedOnly(row) ? [rows[index]] : [])))
  : new Set<ReportRow>();
```

- `judgeAgainstWindow` giữ nguyên logic; chỉ sửa comment `:191` cho đúng: "...keeps a person who is only listed, where the source counts that as being seen, as one appearance on the last day of the window".
- **Comment `parseReport` `:204-209` phải sửa**: thay "a row that names no date at all (a member listed, a person with no activity) is kept as one appearance on the last day of the window, which counts as being seen and never as activity" bằng: "a row that names no date is, for a source that only lists members or logs events, one appearance on the last day of the window (seen, never activity); for an aggregate report of a source that tells the last activity it is nothing at all: the person never was active (`FR-4.10`, `G3`)". Không chứa mã QĐ/V-Q trong comment ngoài các mã FR/G đã dùng sẵn trong file.
- Vì sao xét capability chứ không xét cột template: `judgeCapabilities` (`vendor-source.policy.ts:53-64`) bảo đảm `AGGREGATE` + `lastActivity` ⟺ có cột ngày (`activeDates` hoặc `lastActivityDate`), và `eventDetail` buộc `EVENT`; điều kiện áp như nhau cho CSV và JSON chuẩn hóa của cùng nguồn (FR-4.1: hai định dạng vào cùng kho).

### 4.2 Fixture demo (giữ nguyên ý bẫy)

`src/cli/seed/fixture/shared-demo-v4/usage.ts:43` `row('NV-DES9', null)` → `row('NV-DES9', 20)`.

Lý do: Figma là nguồn `lastActivity`; sau fix dòng trống của DES9 không còn "xuất hiện", mà Figma có định danh chưa khớp `vo.thi.old@…` ⟹ TC-2 trả `UNMATCHED_IDENTITY` trước cổng bao phủ, khác README demo (`README.md:256`: *Bỏ qua `COVERAGE`*). Ngày 20 hôm trước (seat cấp 30 hôm trước, cửa sổ tới hôm qua) giữ DES9 *xuất hiện* ⟹ vẫn bị cổng `COVERAGE` (bao phủ < 60). Không có `FR-4.8` finding (ngày nằm trong seat). `NV-DES6` (`null`) không đổi: cổng `NEW_ASSIGNMENT` chạy trước bằng chứng.
Cập nhật comment đầu file `usage.ts:13-22` nếu có câu nào nói dòng trống = xuất hiện (hiện không có; không đổi gì khác).

## 5. Ca biên

| # | Ca | Kết quả sau fix |
|---|----|-----------------|
| E1 | Jira/Figma `AGGREGATE`+`lastActivity`, dòng có tên, ô trống | Không ghi ngày nào; không `appeared`, không `lastAuthOnlyDate`; mapping vẫn ghi (MATCHED) ⟹ `NEVER_ACTIVE` (G3, `ACTION`) nếu qua các cổng |
| E2 | Nguồn chỉ danh sách thành viên (`memberList`, không `lastActivity`) | Giữ nguyên `AUTH_ONLY` @ `window.to` (`appeared = true`) — test cũ `parse.spec:176` giữ nguyên |
| E3 | Nguồn `EVENT` (log đăng nhập/sự kiện), dòng chỉ có tên | Giữ nguyên xuất hiện. Sự kiện `login` thật ⟹ `AUTH_ONLY` thật như cũ (`parse.spec:157`, integration confirm `:111`) |
| E4 | `POSITIVE_ONLY` | Parse không biết hướng; nguồn vẫn `canConcludeAbsence = false` ⟹ một mình thì `INSUFFICIENT_EVIDENCE`, không kết luận (không đổi). Đi kèm nguồn khác kết luận được: dòng trống của nguồn `POSITIVE_ONLY` không còn làm người "xuất hiện" — đúng nghĩa ô trống |
| E5 | JSON chuẩn hóa vendor-sources | Schema/đọc không đổi. Subject có ngày: không đổi. Subject `lastActivityDate: null` (Atlassian adapter: `nullReason NO_LAST_ACTIVE_REPORTED`) trong nguồn `AGGREGATE`+`lastActivity` ⟹ G3 như CSV (nhất quán). Bot/`notAPerson`: không đổi |
| E6 | Dòng có ngày cuối (kể cả trước cửa sổ) | `VALUE`/`LAST_ACTIVITY` như cũ ⟹ G4 theo số ngày bao phủ sau ngày đó |
| E7 | Lần nhập sau thay thế lần trước | Không còn ngày giả để thay thế. Dữ liệu cũ đã ghi `AUTH_ONLY` giả: bị lần nhập mới **phủ** nếu cửa sổ mới chứa `window.to` cũ (`supersede` theo khoảng ngày); nếu không phủ, người đó vẫn "xuất hiện" từ dữ liệu cũ (chỉ ảnh hưởng dữ liệu đã nhập trước deploy; demo seed chạy lại là sạch). `reopenAfterEnd`: mapping của người chỉ có dòng trống, nếu bị kết thúc, không có ngày để suy "lần nhập thấy cuối" ⟹ không mở lại vào hàng đợi (giống người được gắn tay chưa từng có ngày) |
| E8 | TC-2: ứng dụng có định danh chưa khớp (OPEN hoặc DISMISSED) | Người dòng trống giờ là `!appeared` ⟹ `UNMATCHED_IDENTITY` (không kết luận) thay vì G4. Xem **D-1** |
| E9 | Ô có chữ không phải ngày, vd. `Never` | Không đổi: `dayOf` ⟹ null ⟹ `DATE_INVALID` ⟹ dòng `INVALID`, không ghi gì, không mapping, không vào hàng đợi; người đó như không có dòng ⟹ G3 (nếu qua TC-2). Preview đếm dòng đó là *invalid*. Xem **D-2** |
| E10 | Dòng trống có lỗi khác (định danh rỗng/bí mật/trùng) | Như cũ: `INVALID` |
| E11 | Ân hạn người mới, nghỉ dài, máy, miễn trừ, thu hồi đang chạy | Cổng seat chạy trước bằng chứng ⟹ không đổi |
| E12 | Bao phủ < ngưỡng review | Người dòng trống: TC-2 xét trước cổng bao phủ (E8); không có định danh chưa khớp ⟹ `COVERAGE` như cũ |
| E13 | Tin cậy | Hết câu mâu thuẫn giả "logged in after the last day" cho người dòng trống; G3 dùng `daysOverLowerThreshold = null` như mọi G3 |
| E14 | Cửa sổ suy ra | Không ảnh hưởng (`derivedWindow` chỉ đọc `ACTIVE_DATE` thật; báo cáo chỉ có ngày cuối vốn bắt khai cửa sổ) |
| E15 | Kết quả nhập `daysWritten` | Giảm đúng bằng số dòng trống (không còn ngày giả); preview của dòng đó `days: []`. Hình dạng DTO không đổi |

## 6. Ma trận test

Unit — viết **đỏ trước** (chạy `pnpm jest <file>` thấy fail trên code cũ), rồi sửa:

| ID | File | Ca | Kỳ vọng | Trước fix |
|----|------|----|---------|-----------|
| U1 | `src/modules/usage/vendor-import/parse/vendor-import-parse.policy.spec.ts` | CSV nguồn `aggregate` (`lastActivity: true`), `email,last_active` / `a@x.com,` / `b@x.com,2026-08-01`, cửa sổ khai 06-01→08-31 | `rows[0].days = []`, `errors = []`; `rows[1].days = [{2026-08-01, VALUE, LAST_ACTIVITY}]` | ĐỎ (có AUTH_ONLY) |
| U2 | cùng file | JSON nguồn `aggregate`: subject `{ activity: { lastActivityDate: null } }` và subject không có `activity` | cả hai `days = []`, không lỗi | ĐỎ |
| U3 | cùng file (test cũ `:176`) | nguồn `members` dòng chỉ email | giữ `AUTH_ONLY` @ `2026-08-31` | xanh, giữ nguyên |
| U4 | cùng file | nguồn `events`, CSV `email,day,event` / `a@x.com,,` | `days = [{window.to, AUTH_ONLY, ACTIVE_DATE}]` (cửa sổ khai) | xanh (khóa hành vi) |
| U5 | cùng file | nguồn `aggregate`, ô `Never` | `codes = [['DATE_INVALID']]`, `days = []` | xanh (khóa E9) |
| U6 | cùng file (test cũ `:130`) | ngày cuối trước cửa sổ | không đổi | xanh |
| U7 | `src/modules/optimization/usage-rules/usage-assessment.policy.spec.ts` (`:84` đã có) | `activeDates: [], appeared: false` | `NEVER_ACTIVE`, `ACTION` | xanh, đã có — không thêm |
| U8 | `src/modules/usage/vendor-import/confirmation/vendor-import-confirmation.policy.spec.ts` | `daysToWrite` với dòng MATCHED `days: []` | `[]` | xanh (khóa: không ghi gì) |
| U9 | `src/modules/optimization/usage-rules/usage-gates.policy.spec.ts`, `usage-evidence.policy.spec.ts`, `vendor-source.policy.spec.ts` | `POSITIVE_ONLY` không kết luận | không đổi, không sửa | xanh |

Integration (chỉ viết/liệt kê, **không chạy local**; CI chạy):

- `test/integration/usage/usage-evidence.integration-spec.ts` — thêm 1 ca trong `describe('DA6-14, FR-4.4 ...')`: nguồn mặc định (`AGGREGATE`, `lastActivity`), `aggregate([['empty1@acme.vn', '']])`, cửa sổ 06-01→08-31 ⟹ `vendor.employees` **không** chứa người đó (không `appeared`). Ca `ROSTER1` (`:84-103`) giữ nguyên `appeared: true, lastAuthOnlyDate: '2026-08-31'`.
- Liên quan, kỳ vọng **không đổi** (CI): `test/integration/usage/vendor-import-confirm.integration-spec.ts` (`:111` AUTH_ONLY thật), `vendor-import-preview.integration-spec.ts` (`:100`), `test/integration/optimization/ghost-seat-g3-g4.integration-spec.ts`.
- Seed spec `src/cli/seed/fixture/shared-demo-v4.spec.ts` (unit, chạy được bằng `pnpm jest`): không kiểm ngày của DES9 ⟹ không đổi.

Test cũ đổi kỳ vọng: **không có** (test `:176` dùng nguồn `members`, vẫn đúng). Nếu Sonnet thấy test nào khác đỏ ⟹ dừng, ghi lại, không nới.

## 7. Thành công khi

1. U1, U2 đỏ trên code cũ, xanh sau sửa; U3–U9 xanh.
2. `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates` sạch; `pnpm openapi:export` không tạo diff `openapi.json`.
3. Diff `src` chỉ ở `vendor-import-parse.policy.ts` + 1 dòng `shared-demo-v4/usage.ts`; test ở các file spec đã nêu.
4. CI `ci.yml` trên nhánh xanh mọi job.

## 8. Cần Owner

- **D-1 (TC-2, quan trọng)**: sau fix, người có tên mà ô ngày trống bị xử như *không có dòng*. Nếu ứng dụng còn **bất kỳ** định danh chưa khớp (kể cả đã *DISMISSED*), `unmatchedGateOf` trả `UNMATCHED_IDENTITY` cho họ thay vì G3. Với export Atlassian thật (thường có khách/ngoài công ty) G3 có thể ít khi ra. Lựa chọn: (a) **chấp nhận** (SPEC này; đúng luật hiện tại của TC-2 với người vắng mặt); (b) fix tiếp cỡ M: mang tín hiệu "có tên trong báo cáo" (vd. mapping đang hiệu lực cho nguồn đó) vào `EvidenceSource.employees` để TC-2 coi người đã định danh là *đã thấy* — đổi type public `usage-evidence.types.ts` + repo, không migration; (c) xét lại việc `DISMISSED` vẫn chặn. Khuyến nghị: (a) ngay, hỏi Owner có muốn (b) không.
- **D-2 (`Never`)**: chưa live-test ô `Last seen` là trống hay chữ `Never` (ACCESS-2590). Hiện chữ `Never` ⟹ dòng `INVALID` ⟹ thực tế vẫn ra G3 (như không có dòng; chịu D-1), chỉ là preview đếm lỗi `DATE_INVALID` và không gắn mapping. Phương án tối thiểu: **không làm gì trong fix này**. Nếu Owner muốn dòng `Never` hợp lệ: thêm trường template tùy chọn (vd. `noDateValues: string[]`, mặc định rỗng) coi giá trị đó là ô trống — **đổi contract cấu hình nguồn** (DTO + OpenAPI + JSON template), làm thành fix riêng.
- **D-3 (dữ liệu đã nhập)**: ngày `AUTH_ONLY` giả của các lần nhập trước deploy vẫn còn nếu không bị lần nhập mới phủ (E7). Môi trường demo seed lại là sạch; nếu có dữ liệu thật cần dọn ⟹ một data fix riêng (cần Owner).

## Owner đã chốt (23/11/2026)

- D-1 = (a): giữ cổng `UNMATCHED_IDENTITY` như hiện tại (TC-2, `INV-12`); không làm phương án (b), (c).
- D-2: không xử lý chữ "Never" trong fix này (dòng `INVALID` như cũ).
- D-3: không dọn dữ liệu `AUTH_ONLY` cũ (môi trường demo seed lại).
