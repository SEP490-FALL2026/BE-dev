# SPEC — mở rộng seed demo `shared-demo-v4` (17/11/2026)

Nguồn: [SEED-AUDIT.md](SEED-AUDIT.md) cùng thư mục (Review 1: đường dẫn cũ `verify-logs/p5/…` sai), kế hoạch 22 bước, 5 đợt, đã chỉnh
theo mục "Owner chốt 17/11". Code nền: repo này, nhánh `feat/p5` @ `d3757876` (HEAD `739b8616` chỉ thêm tài liệu). Mọi route, body và
luật trong spec đều đối chiếu với `openapi.json` và code của commit đó (17/11/2026). PLAN cho chat Sonnet: [PLAN.md](PLAN.md). Review 1:
[REVIEW-SPEC.md](REVIEW-SPEC.md) — các chỗ sửa ghi "Review 1", yêu cầu bổ sung của Owner ghi "Owner 17/11" (§5b). Review 2:
[REVIEW-SPEC-2.md](REVIEW-SPEC-2.md) — áp Q-B…Q-E, sửa ghi "Review 2". Review 2: `feat/p5` đi tiếp trong lúc review, tới `0f086c61`
(sửa F1–F5, T1 của prompt 5). `src/cli/seed/**`, `test/flows/**` và `test/support/flows/**` không đổi so với `d3757876`. `openapi.json`
chỉ thêm `CANCELLED` vào chữ ví dụ của `SUBSCRIPTION_RENEWAL.NOT_RENEWABLE`. F5 (`65375780`) bỏ ngày cảnh báo gia hạn của thuê bao
không có điểm điều chỉnh. CP1 kiểm lại cảnh báo của `claude-team` (S06).

## 0. Skill preflight (người viết spec)

| Skill | Vai trò | Dùng để |
| --- | --- | --- |
| `agent-skills:spec-driven-development` | process | Khung spec: mục tiêu, lệnh, cấu trúc, test, ranh giới, tiêu chí xong |
| `superpowers:writing-plans` | process (PLAN) | Chia task nhỏ, mỗi task có tệp, test, lệnh kiểm, commit |
| `superpowers:verification-before-completion` | verification | Mọi luật ghi ở đây có nguồn `file:dòng`; chỗ chỉ suy luận được ghi rõ "kiểm trước" |
| (domain) | — | Không có skill riêng cho seed nghiệp vụ; thay bằng đọc trực tiếp code, OpenAPI, flows test, tài liệu FE |

## 1. Mục tiêu

Seed demo hiện đủ 5 luồng chính nhưng nhiều màn còn rỗng hoặc dưới 20 dòng: danh mục 13 ứng dụng, thiết bị/collector 0, SBF-20 chưa
có lượt ghi nào, AI tắt, nhiều trạng thái MF-1 chưa có (SEED-AUDIT §1–§3). Mục tiêu:

1. Danh mục **25 ứng dụng / 32 gói** tên SaaS thật, giá **mô phỏng bằng VND**, đủ K1/K2/K4/K5, gói tháng và gói năm; danh sách ứng
   dụng, gói, thuê bao đều > 20 dòng (thấy phân trang, `pageSize=20`).
2. Ngày gia hạn **neo theo ngày chạy seed** (`D0`): ở `D0` và `D0+1` luôn có thuê bao tháng/năm **trong** và **ngoài** cửa sổ điều
   chỉnh, có thuê bao báo động đỏ, có lượt SBF-20 đã ghi.
3. MF-1 có thêm `IT_REJECTED`, `AWAITING_REQUESTER_REVISION` (ba nguồn trả về), `EXECUTING`, `FAILED`, `AWAITING_IT_CLOSE`, duyệt chi
   **từ chối**, Request nhóm có **một dòng bị từ chối**; hàng chờ nhu cầu của nhiều trưởng phòng và hàng duyệt chi ≥ 5 dòng.
4. Thiết bị/collector làm **trọn như tool thật** (`Tool-wdp`): thông báo giám sát, máy, bản ký `BM-06`, xác nhận, allowlist (phát hành
   **trước** khi xác nhận), mã đăng ký, token thiết bị, usage AI và trạng thái công cụ qua API thiết bị, yêu cầu dừng (chờ và đã xong).
5. AI bật ở `SIMULATED`, có 3 lần gọi tóm tắt mẫu.
6. Hoàn trả, báo lỗi SaaS nhiều trạng thái, BM-09 đã gắn/bị từ chối/đã ghi, nhập nhân sự, tài khoản bị khóa và lời mời chưa kích hoạt,
   nhân viên chưa xếp phòng, ứng dụng đã ngừng, hợp đồng/hóa đơn/hồ sơ thuế thêm.
7. Tài liệu FE cập nhật theo dataset mới, kèm giải thích phòng `ADMIN` của Super Admin (Q1 = A).

**Thành công** = seed trên DB trống exit 0, chạy lại cùng ngày exit 2, `--continue` ở `D0+1` exit 0 (Review 2), `pnpm test:flows`
không đỏ thêm, `pnpm exec jest src/cli/seed` xanh, CI GitHub xanh, và các số đếm ở §6 đúng.

## 2. Quyết định đã chốt (không mở lại)

| Mã | Nội dung | Hệ quả cho spec |
| --- | --- | --- |
| Q1 = A | Giữ Super Admin ở phòng `ADMIN` (`FR-8.7`, `QĐ-87f(1)`, `QĐ-67a`) | Không đổi code cài đặt; chỉ sửa chữ "phòng gốc" trong README fixture và tài liệu FE (§9) |
| Q2 | Reset DB demo khi deploy; giữ tên fixture `shared-demo-v4` | Được thêm ghế nền mới (bước nạp ghế đóng sau `catalog.baseline-close`) và thêm phần tử vào mảng cũ. Không tạo `shared-demo-v5` |
| Q3 | Tên SaaS thật, giá mô phỏng VND, ghi rõ trong tài liệu | §4.4 |
| Q4 | AI bật sẵn `SIMULATED`, vài lần gọi mẫu; Owner tự đổi `MODEL` | Seed **không bao giờ** ghi `AI_PROVIDER_MODE` |
| Q5 | Ngày gia hạn neo theo ngày seed | Thêm `renewalInDays` cho gói tháng; neo lại cả 7 gói tháng K2 cũ (§4.5) |
| Q6 | Collector làm trọn như tool thật | §5 S16–S18; giới hạn "nhiều ngày" ở §10 Q-A |
| Q7 | Khối lỗi 500 trong log là lượt cũ | Không cần điều tra |
| Q-A | Usage AI 1–2 ngày (seed `D0`, `--continue` `D0+1`) | §5 S17; không đổi luật server |
| Q-B | Ghế K2 mới của Adobe/Zoom ở **BOD**; R10 của MKT giữ nguyên | Review 2: NV-MKT3/4/5 đổi thành NV-BOD4/5/6 (S01); MKT không giữ ghế K2 mới (S08, S12, S14, S16, S18) |
| Q-C | Ngân sách ENG/FIN/BOD/ITO tính theo ngày seed, rải ngày cấp ghế, hóa đơn tháng trước; đủ 4 đèn, có xu hướng | Review 2: §5b S24 (đèn đích, công thức, giới hạn ngày) |
| Q-C (FR-5.10) | Chỉ số "tỷ lệ chi phí seat Trống" chưa có route ⟹ **nợ prompt 4b** | Seed không làm, không nghiệm thu |
| Q-D | `pdf-lib` (dependency thường) + font Noto Sans (OFL) trong repo | Review 2: §5b S23 mục 4a |
| Q-E | BM-10 ghi số đề nghị, dòng nhu cầu, cơ sở + dự phòng **đề xuất**; XLSX Finance ghi cơ sở + dự phòng **đã chốt** và chênh lệch | Review 2: §5b S23 mục 2–3 |

## 3. Lệnh

```bash
pnpm install --frozen-lockfile && pnpm prisma:generate
pnpm typecheck && pnpm lint                         # max-lines 500, max-lines-per-function 60, complexity 12 (eslint.config.mjs:54-58)
pnpm exec jest src/cli/seed                         # unit của seed
pnpm build && pnpm seed:local -- --confirm-reset <tên-db-local>   # seed DB trống, cần .env.seed.local; API/worker phải tắt
pnpm seed:local -- --continue                        # chạy lại cùng ngày: exit 2
TEST_DATABASE_ADMIN_URL=... pnpm test:flows          # flows dùng chính seed này (test/support/flows/flow-template.ts:93-131)
gh workflow run ci.yml --ref feat/seed-v4-expand     # suite đầy đủ
```

## 4. Ràng buộc chung

### 4.1 Cách ghi

1. **Chỉ ghi qua HTTP API đúng vai** (`DemoApiClient`), không SQL. Ngoại lệ có sẵn giữ nguyên: tài khoản demo qua `DemoAccountsApi`
   (in-process). Không thêm ngoại lệ mới.
2. **Idempotent:** mỗi bước đọc trước rồi mới ghi, theo khóa nghiệp vụ (mã nhân viên, tên ứng dụng/gói, `assetCode` của máy, số hợp
   đồng/hóa đơn, thẻ `[SV-…]` ở đầu văn bản tự do, sự kiện Audit Trail theo `actorAppUserId` + `action`). Bước đã đủ trả `present`.
   Runner (`seed-runner.ts:15-57`): 4xx ⟹ `conflict`, 5xx/không tới được ⟹ `failed` dừng lượt.
3. **`--continue` an toàn:** bước mới nằm trong `demoSteps()` (`seed-steps.ts:28-47`) sau mọi bước nó `needs`; test
   `seed-steps.spec.ts` kiểm thứ tự. Lượt chạy lại ở `D0+1` được phép ghi thêm đúng hai thứ phụ thuộc ngày: điều chỉnh ngân sách (có sẵn,
   DEMO-14) và ngày usage AI của hôm đó (S17). Mọi thứ khác ra `present`. Review 1: nếu `D0+1` sang tháng mới thì bước chốt tháng có sẵn
   chốt thêm một tháng. Năm mới bị `calendarRefusal` chặn. Bước nào đăng nhập người có thể bị chặn hoặc khóa (NV-DEV7, NV-BOD3) phải đọc
   bằng người khác (C-1, C-2).

   **Review 2 — Critical N-1 (`D0+1`, lỗi có sẵn):** `placedAsWanted` (`organization.steps.ts:107-125`) đọc
   `GET /departments/{id}/employees`. Route này chỉ trả người có placement còn hiệu lực **hôm nay** (`department.repo.ts:489-515`).
   Điều chuyển của NV-DEV4 hiệu lực `D0+1` đóng placement ENG và mở placement ITO (`transfer-change-writer.service.ts:30-33`;
   `usage.ts:125`). Vì vậy ở `D0+1`, `org.employees` ra `conflict`. Mọi bước cần `org.accounts` thành `blocked`, exit 4. DEMO-14 và ngày usage
   thứ hai không bao giờ được ghi. NV-OFF1 và NV-DEV7 (`BLOCK_NOW`, ngày cuối `D0`) có cùng rủi ro khi placement kết thúc. Cách sửa (chỉ
   trong seed):
   - Người có sự kiện nhân sự trong fixture (`personnel`, S13d) được kiểm bằng `GET /employees/{id}` (Super Admin), không qua danh sách
     thành viên phòng.
   - `TRANSFER`: đạt khi `department.code` là phòng gốc (trước `effectiveOn`) hoặc `toDepartment` (từ `effectiveOn`).
   - `OFFBOARDING`: đạt khi `department.code` đúng fixture, hoặc `status = TERMINATED`, hoặc `workState ∈ {HANDING_OVER, LEFT}`.
   - Họ tên vẫn phải khớp. Có test unit. Checkpoint phải chạy thử `D0+1` (PLAN §0.6).
   - Review 2: ở `D0+1` các trạng thái do job đẩy đi tiếp được coi là đã tới đích (ISSUE3 `RESOLVED → CLOSED`, R57 `CANCELLED`).
4. **Không "bom ngày":** mọi ngày là `dayOffset(ctx.today, n)` (`demo-dates.ts`); không ngày tuyệt đối. Ca chỉ có sau một job hoặc sau
   một mốc được ghi là giới hạn (§8), không giả bằng dữ liệu.
5. Thời gian thật: chỉ `Date.now()` cho `occurredAt`/`generatedAt`/`observedAt` như code hiện có (`extras.steps.ts:51`). Không đặt
   `generatedAt` ở tương lai (server từ chối quá 5 phút, `ai-usage-day.policy.ts:65-71`).

### 4.2 Bất biến của dataset hiện có (không được phá)

| Bất biến | Nguồn | Hệ quả |
| --- | --- | --- |
| MKT, DES, SAL không có Request nào khác giữ hoặc chờ ngân sách | README fixture §Ngân sách; R10, R21, R11 | **Không** Request mới ở MKT, DES, SAL. Review 1: ghế nền K2 không tạo cam kết nhưng **là thực chi** (ghế-tháng tính cho phòng người giữ, `invoice.repo.ts:180-209`; chốt tháng trong seed tính luôn) và duyệt chi kiểm lại ngân sách (`spend-decision.service.ts:101`). Review 2 (Q-B): **không người MKT nào có ghế K2 mới**; ghế Adobe/Zoom chuyển sang BOD. Ghế-tháng tính từ `granted_on` của dòng baseline (`assignment.policy.ts:40`, `core/seat-month-cost.ts:61-72`). SAL đã bị chặn nên ghế SAL không đổi kịch bản |
| 1Password 0 ghế Trống, DataGrip 0 khóa, GitHub còn Trống | R15, R20, R22 | Không thêm ghế/khóa cho 3 thuê bao này |
| LGL không trưởng phòng; OPS không Cost Center | R13, R30, nháp NV-OPS1 | Không gán trưởng phòng LGL, không tạo CC-OPS |
| Không thêm usage cho ghế bẫy DES; không ghost-seat mới ở DES | README §MF-5 | Nguồn usage mới không có dòng của người DES |
| Miro, Whimsical, Canva Enterprise **không** vào danh mục | R08, R25, R29 | Danh sách §4.4 không có ba tên này |
| ITA1, ITA2 mỗi người đúng 4 phòng | `QĐ-110l` | Không đổi IT Admin phụ trách phòng |
| Figma Professional: 18 mua, 0 Request mở, không lượt SBF-20, đúng 2 tác vụ thu hồi | `test/flows/mf5-rightsizing.flow-spec.ts:72-79,133-138` | Không đụng Figma (thuê bao, ghế, Request, usage) |
| NV-DEV1 giữ đúng 5 quyền; NV-MKT2 không giữ quyền nào; NV-DEV2 không giữ Jira | `mf2-offboarding.flow-spec.ts:11`, `mf2-abrupt-departure.flow-spec.ts:10`, `mf5-ghost-seat.flow-spec.ts:96` | **Không** cấp ghế/Request mới cho người cũ, trừ trưởng phòng FINH, DEP, ITOH, SALH (chỉ ghế nền; Review 2: bỏ MKTH theo Q-B) |
| NV-NEW1, NV-INT1 không có tài khoản | `f0-auth-roles.flow-spec.ts:106-118` | Lời mời chưa kích hoạt dùng người **mới** |
| Không có `subscription_renewals` ở trạng thái `PROPOSED` | `mf5-rightsizing-no-head.flow-spec.ts:110` | SBF-20 chỉ ghi bằng `POST /subscription-renewals` (một lần ghi ⟹ `OUTCOME_RECORDED`) |
| Không thêm điều chuyển phòng | `mf3-transfer.flow-spec.ts:57` đọc một dòng `transfer_reviews` | Không có bước điều chuyển mới |
| Mỗi người ≤ 3 Request đang mở (quy ước fixture, README) | `requests.ts:9`; luật thật GH-2 là 10 Request **gửi trong tuần** mỗi người, kể cả đã rút/từ chối (`REQUEST_OPEN_NEW_LIMIT`, `request-limits.service.ts:20`) — Review 1 | Request mới dùng người mới, mỗi người ≤ 3 đang mở; trưởng phòng cũ chỉ được **gửi** (R42 NV-FINH, R49 NV-DEP), không nhận ghế mới qua Request |
| Một người không xin gói đã giữ | `shared-demo-v4.spec.ts:107` | Bảng §5 S10 đã tránh; test fixture giữ nguyên |

Quy tắc rút gọn: **dữ liệu mới gắn với người mới, ứng dụng mới và thuê bao mới**; người cũ chỉ được thêm ghế nền nếu là trưởng phòng
FINH, DEP, ITOH, SALH (Review 2: Q-B).

### 4.3 SoD và luật nghiệp vụ

- Super Admin không gửi Request/hoàn trả, không cấp ghế, không tạo Cost Center, không làm trưởng phòng (`SoD-1`, `QĐ-39b`, `QĐ-95d`).
- NV-CEO (Người duyệt chi) không là người yêu cầu/thụ hưởng/người gửi hoàn trả (`REQUEST_PARTY.INELIGIBLE`).
- Request của IT Admin đi qua NV-ITOH; Request trưởng phòng tự gửi là một bước (`REQUESTER_IS_HEAD`).
- Mỗi tài khoản một vai (`QĐ-95a`). Không ai thao tác hồ sơ/sự kiện của chính mình (`PERSONNEL.SELF_CHANGE_FORBIDDEN`).
- Người nghỉ là trưởng phòng phải có kế nhiệm: spec **không** cho trưởng phòng nào nghỉ.
- Allowlist collector không nhận ứng dụng `INTERNAL`, nhóm _Liên lạc_ hoặc đã ngừng (`allowlist.policy.ts:21-31`); nguồn usage nhà cung
  cấp cũng từ chối nhóm _Liên lạc_ (`USAGE_SOURCE.COMMUNICATION_APP`).
- Ngừng ứng dụng bị chặn khi còn ghế hoặc thuê bao kỳ đang chạy (`APPLICATION.RETIREMENT_BLOCKED`).

### 4.4 Danh mục mới (Q3): 12 ứng dụng, 18 gói

Giá là **giá mô phỏng** gần giá niêm yết, quy ra đồng; gói báo giá USD giữ `originalPrice` (FX-1). Cột "IT" là IT Admin phụ trách thuê
bao (người ghi danh mục vẫn là `catalogAdmin` = NV-ITA1, `catalog.steps.ts:15-19`).

| Ứng dụng (vendor) · nhóm | Gói (key) | Kiểu | Chu kỳ · giá/ghế | IT | `renewalInDays` | Ghi chú demo |
| --- | --- | --- | --- | --- | --- | --- |
| Microsoft 365 (Microsoft) · Văn phòng & cộng tác | Business Basic (`m365-basic`) | K2 | tháng · 150.000 | ITA1 | 20 | ngoài cửa sổ tháng |
| | Business Standard (`m365-standard`) | K2 | năm · 3.800.000 | ITA1 | 120 | năm ngoài cửa sổ; điều khoản đã rà |
| Zoom Workplace (Zoom) · Liên lạc | Pro (`zoom-pro`) | K2 | tháng · 360.000 | ITA1 | 3 | trong cửa sổ; ITA2 ghi SBF-20 (S15) |
| | Business (`zoom-business`) | K2 | năm · 5.200.000 | ITA1 | −3 | ngày gia hạn đã qua, `autoRenew` ⟹ job ghi `AUTO_RENEWAL_INCIDENT` (§8) |
| Notion (Notion Labs) · Văn phòng & cộng tác | Business (`notion-business`) | K2 | tháng · 500.000 | ITA2 | 10 | điểm mở từ `D0+3` |
| | Plus (`notion-plus`) | K2 | năm · 2.900.000 | ITA2 | 45 | trong cửa sổ, chưa đỏ (đỏ từ `D0+8`); điều khoản rà từ lâu ⟹ `plan-warnings` |
| Confluence (Atlassian, cùng vendor Jira) · Lập trình & kỹ thuật | Standard (`confluence-standard`) | K2 | tháng · 160.000 | ITA1 | 5 | trong cửa sổ |
| | Premium (`confluence-premium`) | K2 | năm · 3.700.000 | ITA1 | 70, `noticeDeadlineInDays` 25 | hạn hủy **khai báo** ⟹ trong cửa sổ; chưa có điều khoản ⟹ `plan-warnings` |
| Adobe Creative Cloud (Adobe) · Thiết kế & sáng tạo | Teams All Apps (`adobe-cc-teams`) | K2 `dataLossOnRemoval` | năm · 22.000.000 | ITA2 | 35 | **báo động đỏ** (hạn `D0+5`); seed ghi SBF-20 (S15) |
| | Photoshop (`adobe-photoshop`) | K2 | tháng · 560.000 | ITA2 | 25 | ngoài cửa sổ |
| Claude (Anthropic) · Trợ lý AI | Claude Pro (`claude-pro`) | K1 `PARTIAL` | tháng · 508.000 (20 USD) | ITA1 | — | allowlist `CLAUDE_CODE` trỏ ứng dụng này |
| | Claude Team (`claude-team`) | K2 | năm · 7.500.000 | ITA1 | **không ngày** | `withoutDates`: không ngày kết thúc/gia hạn/hạn hủy ⟹ cảnh báo `NO_ALERT_ANCHOR`, SBF-20 `CONTRACT_DATA_INCOMPLETE` |
| GitHub Copilot (GitHub) · Trợ lý AI | Pro (`copilot-pro`) | K1 `UNCONTROLLABLE` | tháng · 254.000 (10 USD) | ITA1 | — | mức kiểm soát thứ ba (nếu API từ chối tổ hợp K1 + `UNCONTROLLABLE` thì dùng `PARTIAL`, ghi `D-n`) |
| Microsoft Visio (Microsoft) · Văn phòng & cộng tác | Visio Professional (`visio-pro`) | K4 `hasAdminConsole`, `sharingPolicy: ALLOWED` | mua một lần · 13.000.000/khóa | ITA1 | — | hồ sơ workspace 2 IT Admin; kho 3 khóa; điều khoản `installLimit.maxDevicesPerKey: 2` |
| Sublime Text (Sublime HQ) · Lập trình & kỹ thuật | License (`sublime-license`) | K4 | mua một lần · 2.500.000/khóa | ITA1 | — | không trang quản trị; kho 2 khóa |
| HubSpot Sales Hub (HubSpot) · Chuyên ngành | Starter (`hubspot-starter`) | K2 | tháng · 450.000 | ITA1 | 1 | ngày trả `D0+1`: lượt job ngày demo gửi `SUBSCRIPTION_RENEWAL_KEPT` |
| Hệ thống Chấm công (nội bộ) · Khác | Truy cập Chấm công (`attendance-access`) | K5 | không phí | — | — | Request K5 ở ITO/OPS |
| Skype for Business (Microsoft) · Liên lạc | Online Plan 2 (`skype-online`) | K2 | **không thuê bao** | — | — | bị **ngừng** ở S21 |

Review 1:

- **Tên gói** ghi đầy đủ như fixture cũ (`'Canva Teams'`, `'Jira Standard'`), ví dụ "Microsoft 365 Business Basic", "Zoom Workplace Pro",
  "Notion Business", để không trùng tên ("Pro", "Business"). Flows tìm gói theo tên (`test/support/flows/flow-calls.ts:120-139`).
- **Khóa thuê bao** = khóa gói ở cột "Gói (key)" (`visio-pro`, `sublime-license`…), dùng thống nhất ở S06–S20.
- `adobe-cc-teams` có `dataLossOnRemoval`, nên bắt buộc kèm `revocationNote` (`catalog/plan/plan.policy.ts:78`).

`sharingPolicy` mặc định `NOT_ALLOWED`; `dataSensitivity` trải LOW/MEDIUM/HIGH (Claude, Copilot, HubSpot HIGH; Zoom, Skype LOW; còn lại
MEDIUM). Tổng: 25 ứng dụng (23 SAAS, 2 INTERNAL), 32 gói, 29 thuê bao (13 cũ + 16 mới).

### 4.5 Neo ngày gia hạn (Q5)

Luật code (`subscription-obligation.policy.ts`): gói tháng mở điểm điều chỉnh `monthlyDays`=7 ngày trước ngày trả kế tiếp; ngày trả là
lưới tháng tính từ `renewalDate` (không có thì `endDate`), ngày đầu tiên ≥ hôm nay và sau ngày bắt đầu. Gói năm mở `annualDays`=30 ngày
trước hạn hủy (khai báo, hoặc `renewalDate − noticePeriodDays`), báo động đỏ 7 ngày trước hạn. Ràng buộc tạo: `renewalDate ≤ endDate+1`,
`noticeDeadline ≤ renewalDate` (`subscription.policy.ts:140-148`); không cấm ngày quá khứ.

Đổi `subscriptionTerms()` (`catalog.steps.ts:216-241`):

| Trường fixture | Gói tháng | Gói năm |
| --- | --- | --- |
| `renewalInDays = n` | `renewalDate = D0+n`; `startDate = Y-01-01`; `endDate = Y-12-31`, trừ khi `D0+n > Y+1-01-01` thì `endDate = D0+n−1` | như hiện nay (`startDate = renewal − 12 tháng`, `endDate = renewal − 1`) |
| `noticeDeadlineInDays = k` (mới) | — | `noticeDeadline = D0+k` |
| `withoutDates: true` (mới) | — | chỉ `startDate = D0−200`, `billingCycle`, `commitmentTermMonths`; không `endDate`/`renewalDate`/`noticePeriodDays`; `autoRenew: false` |
| `autoRenew` (mới, mặc định `true`) | | |

7 thuê bao tháng K2 cũ (Jira, Slack, GitHub, 1Password, Postman, Mailchimp, Canva) nhận `renewalInDays: 20` ⟹ ngoài cửa sổ từ `D0` tới
`D0+12`, hết cảnh "ngày 23–31 cả 7 gói cùng vào cửa sổ". K1 (`chatgpt`, `cursor`, `grammarly`) không có điểm SBF-20 (`NOT_POOL_TERM`)
nên giữ nguyên. Figma giữ nguyên `renewalInDays: 50`.

Kết quả ở `D0` và `D0+1` (ngày demo): **trong cửa sổ** zoom-pro, confluence-standard, hubspot-starter (tháng), figma, notion-plus,
confluence-premium, adobe-cc-teams (năm, adobe đỏ); **ngoài cửa sổ** 7 gói tháng cũ, m365-basic, notion-business, adobe-photoshop
(tháng), m365-standard (năm); **không điểm** claude-team.

## 5. Các bước (22 bước, 5 đợt)

Ký hiệu: **[sửa]** thêm phần tử/đổi bước cũ, **[mới]** bước mới. "Vai" là người gọi route. Cột "Kiểm" là kết quả đếm được sau seed
(DB trống, ngày `D0`). Người mới ở S01.

### Đợt 1 — tổ chức và danh mục

#### S01 [sửa] `org.employees`, `org.accounts` — người mới

- **Dữ liệu:** 17 người mới, mọi người vào làm 400 ngày trước như cũ:

  | Mã | Phòng | Tài khoản | Dùng ở |
  | --- | --- | --- | --- |
  | NV-DEV5, NV-DEV6, NV-DEV7 | ENG | EMPLOYEE | Request mới, thiết bị, hoàn trả, nghỉ đột ngột (DEV7) |
  | NV-ITO1, NV-ITO2 | ITO | EMPLOYEE | Request qua NV-ITOH, thiết bị, BM-09 ghi nghỉ dài (ITO2) |
  | NV-FIN2 | FIN | EMPLOYEE | Request, máy chưa xác nhận |
  | NV-BOD1, NV-BOD2 | BOD | EMPLOYEE | Request, Request nhóm, thiết bị, báo lỗi |
  | NV-BOD3 | BOD | EMPLOYEE | **tài khoản bị khóa** (S03); ghế Notion không dùng 95 ngày (G4) |
  | NV-BOD4 | BOD | EMPLOYEE | ghế Adobe, Zoom; ISSUE5; máy SV-LT-004 có yêu cầu dừng chờ (Review 2, Q-B: thay NV-MKT3) |
  | NV-BOD5, NV-BOD6 | BOD | không | ghế Adobe: G4 (BOD5), G3 (BOD6); BM-09 bị từ chối (BOD5) (Review 2, Q-B: thay NV-MKT4, NV-MKT5) |
  | NV-SAL3, NV-SAL4 | SAL | không | ghế HubSpot, Zoom; SAL4 G3 và ghế Zoom hết hạn |
  | NV-OPS2 | OPS | EMPLOYEE | Request K5 chờ NV-OPSH |
  | NV-NEW2 | **chưa xếp phòng** | EMPLOYEE (Review 1: `DemoAccountsApi` không kiểm phòng, `local-demo-account.api.ts`) | lọc `unplaced`, nút "Xếp phòng" (`QĐ-93g`) |
  | NV-NEW3 | BOD | không (S03 tạo lời mời) | lời mời chưa kích hoạt |

- **Code:** `DemoPerson.department: string | null`; `employeeBodyOf` bỏ `departmentCode` khi `null`; `placedAsWanted` với người chưa xếp
  phòng kiểm hồ sơ không có phòng (đọc `GET /employees/{id}` hoặc lọc `unplaced` của `GET /employees`, kiểm route thật) thay vì danh
  sách thành viên phòng.
- **Route · vai:** `POST /employees` · Super Admin; tài khoản qua `DemoAccountsApi` như cũ.
- **Phụ thuộc:** `org.departments`.
- **Màn/DEMO:** danh sách nhân viên (phân trang, lọc `unplaced`), tài khoản (lọc vai).
- **Kiểm:** 58 nhân viên + NV-SA sau S01 (61 sau S02); 42 tài khoản demo + Super Admin; `unplaced` = 1.

#### S02 [mới] `org.employee-imports` — nhập nhân sự (SBF-01a)

- **Dữ liệu:** (a) một lần nhập **đã xác nhận**: CSV 3 người mới hợp lệ NV-IMP1 (ENG), NV-IMP2 (OPS), NV-IMP3 (FIN), không tài khoản;
  (b) **sau đó** một lần nhập **chỉ xem trước, không xác nhận**: 1 dòng hợp lệ NV-IMP4 (MKT) + 2 dòng lỗi (mã phòng `XYZ` không tồn tại;
  email trùng email của NV-DEV5). Cột theo `employee-import-template.policy.ts` (đọc đủ cột bắt buộc trước khi viết).
  Review 1:
  - Cột bắt buộc: `employee_code, full_name, employment_type, hire_date`.
  - Mã lỗi dự kiến: `DEPARTMENT_CODE_INVALID`, `WORK_EMAIL_TAKEN`.
  - Một import chưa xác nhận **không** chặn import khác (`employee-import-preview.service.ts`); bản xem trước hết hạn sau 24 giờ.
  - Tệp lấy header từ `GET /import-templates/employees?format=csv` (S23, Owner 17/11).
- **Route · vai:** `POST /employee-imports` (multipart, `ctx.api.upload`), `POST /employee-imports/{id}/confirmations`
  (`previewVersion`, `idempotencyKey` = `SV-EMPLOYEE-IMPORT-1`) · Super Admin.
- **Idempotent:**
  - (a) `present` khi `ctx.accounts.findEmployees(['NV-IMP1','NV-IMP2','NV-IMP3'])` đủ.
  - (b) `present` khi có sự kiện Audit Trail `EMPLOYEE_IMPORT.UPLOADED` (`employee-import-audit.mapper.ts:37`) mang tên tệp
    `SV-employees-preview.csv`. Không có route liệt kê import.
- **Phụ thuộc:** `org.employees`.
- **Màn:** màn import nhân sự (bản đã xác nhận, bản xem trước có dòng lỗi).
- **Kiểm:** 3 nhân viên `NV-IMP*` tồn tại; `GET /employee-imports/{id}/rows` của (b) có 2 dòng lỗi.

#### S03 [mới] `org.account-states`

- **Dữ liệu:** khóa tài khoản NV-BOD3 với lý do (`QĐ-81`); tạo tài khoản cho NV-NEW3 để có lời mời `INVITED` chưa kích hoạt.
- **Route · vai:** `POST /app-users/{id}/lock` `{ reason }`; `POST /app-users` `{ employeeId }` · Super Admin.
- **Idempotent:** Review 1. `GET /app-users` không lọc được theo nhân viên (`account-management.dto.ts:33-47`). Đọc
  `listAll('/app-users?status=LOCKED')` và `listAll('/app-users?activationState=INVITED')`, rồi khớp `employee.employeeCode`. Đã khóa hoặc
  đã có tài khoản ⟹ `present`.
- **Review 1 — Critical C-1:** tài khoản `LOCKED` làm `DemoAccountsApi.describe` trả `conflict ACCOUNT_DIFFERS`
  (`local-demo-account.api.ts:47-56`). Không sửa thì mọi lượt chạy lại ra exit 4 và chặn mọi bước sau `org.accounts`. Cách sửa:
  - `DemoPerson` thêm cờ `lockedInDemo?: true` (NV-BOD3).
  - Bước `org.accounts` (`organization.steps.ts`, `accounts()`) đọc `GET /app-users?status=LOCKED` bằng Super Admin trước.
  - Người có cờ mà tài khoản đã khóa: bỏ khỏi `specs` gửi `describe/create`, ghi `present`.
  - Test unit cho hàm lọc này.
- **Phụ thuộc:** `org.accounts`. Phải chạy **sau** mọi bước cần NV-BOD3 đăng nhập (S08 ghế nền không cần đăng nhập; NV-BOD3 không gửi
  Request) — đặt bước này ngay sau `org.accounts` là được.
- **Màn:** quản lý tài khoản, lọc trạng thái khóa/đã mời.
- **Kiểm:** 1 tài khoản khóa, 1 tài khoản `INVITED`.

#### S04 [sửa] `catalog.applications`, `catalog.plans`

- **Dữ liệu:** 12 ứng dụng, 18 gói của §4.4, trong tệp mới `fixture/shared-demo-v4/catalog-extra.ts`; `FUNCTIONAL_GROUPS` thêm 12 dòng.
  `DemoPlan.controlLevel` thêm `'UNCONTROLLABLE'`, `sharingPolicy` thêm `'ALLOWED'`. Ứng dụng nhiều gói: gói đầu đi theo
  `POST /applications`, gói sau qua `POST /plans` (logic có sẵn).
- **Route · vai:** `POST /applications`, `POST /plans` · NV-ITA1 (`catalogAdmin`).
- **Phụ thuộc:** `org.accounts`.
- **Màn:** danh mục có phân trang, lọc kiểu K, nhóm, nhà cung cấp; màn xin phần mềm.
- **Kiểm:** `GET /applications` total = 25; `GET /plans` total = 32; mỗi nhóm trong 7 nhóm ≥ 1 ứng dụng.

#### S05 [sửa] `catalog.workspace-profiles`

- **Dữ liệu:** hồ sơ workspace hai IT Admin cho mọi K2 mới (trừ `skype-online`, không thuê bao) và `visio-pro`; `vendorAdmin` = NV-ITA3 cho
  M365 và Visio, mặc định cho gói khác. `notion-business` cố ý `withoutOwnerAccountEmail` (cờ `ownerAccountEmailMissing` thứ hai).
- **Lưu ý code:** `workspaceProfileBody` trả `null` khi gói không có thuê bao (`catalog.steps.ts:154-158`) ⟹ Skype tự bị bỏ qua.
- **Route · vai:** `PUT /plans/{id}/workspace-profile` · NV-ITA1.
- **Phụ thuộc:** `catalog.plans`.
- **Màn:** cờ admin nhà cung cấp (DEMO-9), dashboard IT.
- **Kiểm:** 13 hồ sơ mới (12 K2 có thuê bao + Visio); `GET /subscriptions` có 2 thuê bao `ownerAccountEmailMissing`.

#### S06 [sửa] `catalog.subscriptions` + [mới] `catalog.plan-terms`

- **Dữ liệu thuê bao:** 16 thuê bao mới theo §4.4 (K5 và Skype không có), luật ngày §4.5, neo lại 7 gói tháng cũ.
  `freeAfterBaseline`: m365-basic 5, m365-standard 2, zoom-pro 3, zoom-business 2, notion-business 4, notion-plus 2, confluence-standard 4,
  confluence-premium 2, adobe-cc-teams 3, adobe-photoshop 2, claude-team 3, hubspot-starter 2. K1 `quantity: 0`, `ownerDepartment: 'ENG'`;
  K4 `PERPETUAL`, `quantity` 3 (Visio), 2 (Sublime).
- **Dữ liệu điều khoản** (`DemoFixture.planTerms`, mới): `notion-plus` `lastReviewedOn = D0−400`; `m365-standard` `lastReviewedOn =
  D0−10`, `aiTraining`, `dataLocation`; `visio-pro` `installLimit: { maxDevicesPerKey: 2 }`; `claude-team` `aiTraining` "Không dùng dữ liệu
  khách hàng để huấn luyện" (văn bản mô phỏng). `confluence-premium` cố ý không có điều khoản.
- **Route · vai:** `POST /subscriptions`, `POST /subscriptions/{id}/completions` (bản nháp sót) · NV-ITA1; `PUT /plans/{id}/terms` ·
  NV-ITA1. `GET /plans/{id}/terms` có điều khoản ⟹ `present`. Review 2: "có" là `data.terms` khác `null`. **Không** so từng trường,
  vì `lastReviewedOn = D0−400` đổi theo ngày chạy; so từng trường thì lượt `D0+1` sẽ ghi đè.
- **Phụ thuộc:** `catalog.plans`, `catalog.workspace-profiles`; `catalog.plan-terms` cần `catalog.subscriptions`.
- **Màn:** danh sách thuê bao (lọc `expiry`, `warning`), SBF-20, `plan-warnings`.
- **Kiểm:** `GET /subscriptions` total = 29; `GET /plan-warnings` (NV-ITA1/ITA2) có `notion-plus` và `confluence-premium`;
  `GET /subscription-renewals/adjustment?subscriptionId=<zoom-pro>` có `adjustmentPointOn ≤ D0`, của `m365-basic` thì `> D0`;
  của `claude-team` ⟹ 409 `CONTRACT_DATA_INCOMPLETE`.

#### S07 [sửa] `assets.keys`

- **Dữ liệu:** `keys` thêm `{ subscription: 'visio-pro', count: 3 }`, `{ subscription: 'sublime-license', count: 2 }` (Review 1:
  khóa thuê bao = khóa gói).
- **Route · vai:** `POST /license-keys/imports` · NV-ITA1 (bước có sẵn).
- **Phụ thuộc:** `catalog.subscriptions`. **Kiểm:** Visio 3 khóa `IN_STORE`, Sublime 2.

#### S08 [sửa] `catalog.baseline-seats` (chỉ có hiệu lực trên DB trống)

- **Dữ liệu** (mặc định cấp 130 ngày trước; Review 2: ngày cấp rải theo S24 mục 2):

  | Thuê bao | Người giữ |
  | --- | --- |
  | m365-basic | DEV5, DEV6, DEV7, ITO1, ITO2, FIN2, BOD1, BOD2, BOD3, OPS2, FINH, DEP, ITOH (13) |
  | m365-standard | FINH, DEP |
  | zoom-pro | SAL3, BOD4, BOD1; SAL4 `endInDays: −5` (hết hạn, vẫn giữ) |
  | zoom-business | DEP |
  | notion-business | DEV5, DEV6, BOD1, BOD3 |
  | notion-plus | ITOH, ITO1 |
  | confluence-standard | DEV5, ITO1; ITO2 `endInDays: −10` |
  | confluence-premium | ITOH |
  | adobe-cc-teams | DEP, BOD4, BOD5, BOD6 (Review 2, Q-B: thay MKTH, MKT3, MKT4, MKT5) |
  | adobe-photoshop | BOD2 |
  | claude-team | DEV5, DEV6, ITO1 |
  | hubspot-starter | SALH, SAL3, SAL4 |

  Review 2: số mua không đổi (Adobe 4 + 3 = 7, Zoom Pro 4 + 3 = 7). MKT không giữ ghế K2 mới nào.

  Luật nạp cho phép ngày kết thúc trước hôm nay miễn không trước ngày cấp (`seat-baseline-rows.policy.ts:181-195`).
- **Route · vai:** CSV `POST /seat-baseline-imports` + `…/confirm` · NV-ITA1 (bước có sẵn), rồi `catalog.baseline-close`.
- **Phụ thuộc:** `catalog.subscriptions`, `org.accounts`.
- **Màn:** thuê bao có Trống/Đã gán; `assignment-expiry-queue`; usage nhiều ứng dụng.
- **Kiểm:** `GET /assignment-expiry-queue` (NV-ITA1) có 2 dòng (SAL4 Zoom, ITO2 Confluence); bất biến §4.2 về Figma/1Password/DataGrip/GitHub giữ.
  Review 1: sau lượt giờ đầu, job hết hạn mở tác vụ thu hồi cho hai ghế này (ghi cho FE).
- **Review 1 — chạy lại:** trên DB đã đóng baseline, ghế của thuê bao **chưa có ghế nào** ra `conflict` 409 `SEAT_BASELINE.CLOSED`. Ghế
  thêm vào thuê bao đã có ghế thì bị bỏ qua im lặng. Vì vậy chỉ reset DB (Q2).
- Review 2 (Q-B đã chốt): C-11 đóng bằng bảng trên. Test fixture: không người MKT nào giữ ghế K2 mới (bảo vệ R10).
- **Review 2 — ngày cấp (Q-C ii):** ghế nền của **người mới** rải `grantedDaysAgo` theo bảng trong fixture (ví dụ 300, 240, 180, 120,
  60). Ngày cấp kẹp về `max(D0 − n, startDate của thuê bao, hireDate)`. Thuê bao năm mới có `startDate` muộn: m365-standard `D0−245`,
  confluence-premium `D0−295`, claude-team `D0−200` (`withoutDates`). Ghế người cũ giữ mặc định 130 ngày (§4.2).

#### S09 [sửa] `finance.tax-profile` → hồ sơ thuế nhiều nhà cung cấp

- **Dữ liệu:** `DemoFixture.taxProfile` thành `taxProfiles: […]` (giữ Figma). Thêm Microsoft (m365), Adobe, Notion Labs, Atlassian (jira):
  nhóm `T2` (bên mua nộp thay, `tax-profile.policy.ts:18-22`); Zoom: nhóm `T3` (bán qua nhà phân phối trong nước, mô phỏng). Dòng thuế
  mô phỏng theo mẫu Figma. Ghi rõ "mô phỏng" trong README.
- **Route · vai:** `PUT /vendors/{id}/tax-profile` · NV-FIN1. Giữ luật cũ: đã khai cùng nhóm ⟹ `present`, khác nhóm ⟹ `conflict`.
- **Phụ thuộc:** `catalog.applications`, `org.accounts`. **Màn:** nhà cung cấp, ước tính thuế (`tax-estimate`).
- **Kiểm:** 6 nhà cung cấp `DECLARED`, có cả T2 và T3.

### Đợt 2 — Request và nhân sự

#### S10 [sửa] `requests.*` + mở rộng `scenario-path.ts`

**S10a — đường đi mới.** Đối chiếu code (`access-request.types.ts:18-34`, `SpendStage` dòng 288-297; `need-decision.policy.ts:106`;
`assessment-rejection.service.ts:66`; `assessment-return.service.ts:45`; `spend-decision.service.ts:94-112`; spend-effects
`returnByApprover`: một bước ⟹ `AWAITING_REQUESTER_REVISION`, qua trưởng phòng ⟹ `AWAITING_SPEND_SUBMISSION`;
`access-request-grant.listener.ts`: mở tác vụ cấp ⟹ `EXECUTING`; rút khi đang cấp ⟹ `AWAITING_IT_CLOSE`).

| Target mới (`DemoRequestTarget`) / trường mới | Đạt khi (`reachedTarget`) | Hành động (`ScenarioAction`) |
| --- | --- | --- |
| `REJECTED` + `rejectAt: 'SPEND'` | `state = REJECTED` và `stage = REFUSED` | `…AWAITING_SPEND_DECISION → REJECT_SPEND` (NV-CEO, `decision: REJECT`, `reason`, checklist 1.7) |
| `AWAITING_REQUESTER_REVISION` + `returnAt: 'NEED'` | `state = AWAITING_REQUESTER_REVISION` | `PENDING → NEED_RETURN` (`need-decision` `decision: RETURN`, `reason`, checklist 1.2) |
| `AWAITING_REQUESTER_REVISION` + `returnAt: 'ASSESSMENT'` | như trên | `PENDING → NEED_APPROVE`, `AWAITING_IT_ASSESSMENT → ASSESSMENT_RETURN` (IT Admin của phòng, `assessment/rejection` `decision: RETURN`, checklist 1.3) |
| `AWAITING_REQUESTER_REVISION` + `returnAt: 'SPEND'` (chỉ Request một bước) | như trên, `stage = RETURNED_TO_REQUESTER` | `AWAITING_SPEND_DECISION → RETURN_SPEND` (NV-CEO `decision: RETURN`) |
| `IT_REJECTED` | `state = IT_REJECTED` | `PENDING → NEED_APPROVE`, `AWAITING_IT_ASSESSMENT → ASSESSMENT_REJECT` (`decision: REJECT`, `kind: NOT_ELIGIBLE`, `alternativePlanId` = Jira Standard, checklist 1.3) |
| `EXECUTING` | `state = EXECUTING` | `AWAITING_EXECUTION → GRANT` (mở tác vụ `QUEUED`, không nhận, không hoàn tất) |
| `FAILED` | `state = FAILED` | `… → GRANT`, `EXECUTING → FAIL_TASK_OPEN` (claim, `report-failure` `{ reason }`: task `FAILED`, Request vẫn `EXECUTING`), rồi `FAIL_TASK_CLOSE` (`close-failed` `{ reason }`: Request `FAILED`) |
| `AWAITING_IT_CLOSE` | `state = AWAITING_IT_CLOSE` | Review 1 (C-3): `… → GRANT → FAIL_TASK_OPEN`, rồi `EXECUTING` + task `FAILED` → `WITHDRAW` (người yêu cầu rút, `reason`). Rút khi task `QUEUED` ra `WITHDRAWN`, khi `IN_PROGRESS` ra 409 (`grant-cancellation.policy.ts:52-60`) |
| `rejectedLines?: string[]` (Request nhóm) | target như cũ | `APPROVE_SPEND` dùng `line-spend-decisions`: người trong `rejectedLines` `REJECT` + `reason`, còn lại `APPROVE`. Review 1 (C-12): `GRANT`/`COMPLETE_TASK` **bỏ qua** người trong `rejectedLines` (`request.steps.ts:240-246` đang lặp mọi người) |

Review 1:

- Thân `ASSESSMENT_REJECT`, `ASSESSMENT_RETURN`, `RETURN_SPEND`, `REJECT_SPEND`, `NEED_RETURN` đều có `reason` mang thẻ. Checklist toàn
  Yes mà thiếu `reason` thì ra 422.
- Với `AWAITING_REQUESTER_REVISION`, `stage` luôn là `RETURNED_TO_REQUESTER` ở cả ba nguồn trả về. Chỉ cần so `state`; không sửa luật
  `BLOCKED` hiện có (`scenario-path.ts:38`).
- `FAIL_TASK_OPEN` ở trạng thái `EXECUTING`: đọc task của Request. Task `FAILED` (lượt trước làm dở) thì bỏ qua claim/report.

`PAST_NEED`, `PAST_SPEND`, `FROM_STATE` mở rộng tương ứng; `EXECUTING → COMPLETE_TASK` chỉ khi target `COMPLETED`. Mã checklist theo
`test/support/flows/flow-calls.ts:12-27` (1.2 nhu cầu, 1.3 thẩm định, 1.7 duyệt chi). Trạng thái tác vụ sau `report-failure` và điều kiện
của `close-failed` đọc trong module provisioning trước khi viết `FAIL_TASK`.

`perform()` đang ở `request.steps.ts` (332 dòng): tách hành động sang tệp mới `steps/request-actions.ts` để mỗi tệp < 500 dòng và mỗi hàm
< 60 dòng, độ phức tạp ≤ 12 (switch theo action dùng bảng hàm).

**S10b — dữ liệu** (tệp mới `fixture/shared-demo-v4/requests-extra.ts`, nối sau `REQUESTS.requests`):

| Mã | Người gửi | Gói / đề xuất | Target | Người làm các bước | Hàng chờ có thêm |
| --- | --- | --- | --- | --- | --- |
| R40 | NV-DEV5 | confluence-premium | `AWAITING_SPEND_DECISION` | ENGH nhu cầu, ENGH trình lô | NV-CEO |
| R41 | NV-DEV5 | claude-pro (3 tháng) | `REJECTED`, `rejectAt: SPEND` | ENGH, NV-CEO từ chối | — |
| R42 | NV-FINH (một bước, thẳng `AWAITING_SPEND_DECISION`) | notion-plus | `AWAITING_REQUESTER_REVISION`, `returnAt: SPEND` | NV-CEO trả về (`reason`) | — |
| R43 | NV-DEV6 | đề xuất **Linear** (`https://linear.app`) | `IT_REJECTED` (gợi ý Jira Standard) | ENGH, NV-ITA1 | — |
| R44 | NV-BOD1 | đề xuất **Loom** (`https://www.loom.com`) | `AWAITING_REQUESTER_REVISION`, `returnAt: ASSESSMENT` | NV-DEP, NV-ITA2 | — |
| R45 | NV-ITO1 | zoom-pro | `AWAITING_REQUESTER_REVISION`, `returnAt: NEED` | NV-ITOH trả lại | — |
| R46 | NV-DEV6 | notion-plus | `EXECUTING` | ENGH, NV-CEO, NV-ITA1 mở tác vụ | hàng cấp IT (tác vụ đã mở, chờ nhận — Review 1) |
| R47 | NV-BOD1 | adobe-photoshop | `FAILED` | NV-DEP, NV-CEO, NV-ITA2 (claim, `report-failure`, `close-failed`) | — |
| R48 | NV-ITO2 | zoom-pro | `AWAITING_IT_CLOSE` | NV-ITOH, NV-CEO, NV-ITA1 (claim, `report-failure`), ITO2 rút | hàng IT chờ đóng |
| R49 | NV-DEP → NV-BOD1, NV-BOD2 (nhóm) | m365-standard | `AWAITING_EXECUTION`, `rejectedLines: ['NV-BOD2']` | NV-DEP gửi (một bước, không trình lô — Review 1), NV-CEO quyết từng dòng | hàng cấp IT |
| R50 | NV-ITO1 | attendance-access (K5) | `COMPLETED` | NV-ITOH, NV-ITA1 | — |
| R51 | NV-OPS2 | attendance-access (K5) | `PENDING` | — | NV-OPSH |
| R52 | NV-FIN2 | confluence-standard | `PENDING` | — | NV-FINH |
| R53 | NV-BOD2 | notion-business | `PENDING` | — | NV-DEP |
| R54 | NV-ITO2 | adobe-photoshop | `AWAITING_SPEND_DECISION` | NV-ITOH, NV-ITOH trình lô | NV-CEO |
| R55 | NV-FIN2 | zoom-pro | `AWAITING_SPEND_DECISION` | NV-FINH | NV-CEO |
| R56 | NV-DEV6 | copilot-pro (2 tháng) | `COMPLETED`, `grant: PURCHASE` | ENGH, NV-CEO, NV-ITA1 | — |
| R57 | NV-DEV7 | notion-business | `PENDING_OR_CANCELLED`, `readAs: 'NV-ENGH'` (Review 1, C-2) | — | NV-ENGH (bị hủy sau S13d) |

Thứ tự gửi: Request `COMPLETED` trước (R50, R56), như quy ước `requests.ts:5-10`. Mỗi người ≤ 3 Request mở tại mọi thời điểm (test
fixture có sẵn kiểm). Không người nào ở MKT/DES/SAL. Review 2: ngân sách ENG/BOD/FIN/ITO tính theo S24 và phải có **trước** các
Request này (PLAN T9b). FIN cố ý vượt cơ sở (đèn `YELLOW`), nên R42 và R55 mang `confirmReserve: true`. Không có cờ này thì khi kiểm
ngân sách ra `RESERVE_CONFIRMATION`, `nextScenarioAction` trả `null` và bước thành `conflict` (`scenario-path.ts:69-72`). Thực chi
ghế-tháng có hay chưa lúc duyệt tùy job `seat-month` đã chạy chưa (wrapper bật worker, `docs/guides/seed.md:74`), nên cờ phải có ở cả
hai trường hợp.

- **Route · vai:** như cột "Người làm"; các route có sẵn trong `request.steps.ts` cộng `assessment/rejection`, `spend-approval`
  (`REJECT`/`RETURN`), `line-spend-decisions`, `provisioning-tasks/{id}/report-failure`, `close-failed`, `access-requests/{id}/withdraw`.
- **Phụ thuộc:** như `BASE_NEEDS` + `budget.year` (`request.steps.ts:323-332`); thêm `catalog.plan-terms` không cần.
- **Màn/DEMO:** MF-1 đủ trạng thái; hàng chờ nhu cầu ENGH/ITOH/FINH/DEP/OPSH; hàng duyệt chi; hàng thẩm định; hàng cấp IT; thông báo
  `REQUEST_IT_REJECTED`, `REQUEST_FAILED`, `REQUEST_RETURNED*`.
- **Kiểm:**
  - `GET /spend-approvals` (NV-CEO) ≥ 7 dòng (R02, R10, R12, R31, R40, R54, R55).
  - `GET /need-decisions`: NV-ITOH ≥ 1 (R24), NV-FINH ≥ 1, NV-DEP ≥ 1, NV-OPSH ≥ 1, NV-ENGH ≥ 1 (Review 1: R57 có thể đã bị hủy).
  - Trạng thái từng R đúng bảng.
  - `GET /access-requests/{R49}/lines` có 1 dòng bị từ chối, và chỉ có 1 tác vụ cấp (NV-BOD1).

#### S11 [mới] `requests.returns` — hoàn trả (SBF-03a)

- **Dữ liệu:** (a) NV-DEV6 trả ghế `notion-business` ⟹ NV-ITA1 claim + `revocation-completion` `ACCOUNT_REMOVED` ⟹ `COMPLETED`;
  (b) NV-BOD2 trả ghế `adobe-photoshop` ⟹ để `AWAITING_REVOCATION`. Lý do mang thẻ `[SV-RET1]`, `[SV-RET2]`.
- **Route · vai:** `POST /return-requests` `{ assignmentId, reason }` · người giữ; `GET /provisioning-tasks?scope=ALL`,
  `POST /provisioning-tasks/{id}/claim`, `…/revocation-completion` · IT Admin phụ trách phòng người giữ (ENG ⟹ ITA1).
- **Idempotent:** Review 1 (C-13). Dòng danh sách không có `reason`, và IT Admin thấy mọi hoàn trả. Vì vậy đọc
  `GET /return-requests?assignmentId=<ghế>`: đã có ⟹ đọc trạng thái, chỉ đi tiếp; đã tới đích ⟹ `present`. Thẻ `[SV-RET…]` vẫn ghi vào
  `reason` để hiển thị.
- **Phụ thuộc:** `catalog.baseline-close`, `org.it-admins`. Đặt **sau** `requests.R46` (R46 xin `notion-plus`, khác gói, không xung đột).
- **Màn:** SBF-03a, `RETURN_*`. **Kiểm:** `GET /return-requests?state=COMPLETED` có 1; `?state=AWAITING_REVOCATION` có 1 (Review 1).
- **Review 1 (R-17):** RET1 thu hồi ghế Notion của DEV6 **trước** `usage.imports`. Nguồn `[SV] Notion` ở S14 vì vậy **không** có dòng
  DEV6.

#### S12 [sửa] `saas.issue` → `saas.issues` — báo lỗi SaaS (SBF-09)

- **Dữ liệu** (giữ báo lỗi R01 cũ "vừa gửi"; thêm 4, mỗi mô tả có thẻ riêng `[SV-ISSUE2…5]`):

  | Thẻ | Người báo · ghế | Trạng thái cuối | Chuỗi thao tác |
  | --- | --- | --- | --- |
  | ISSUE2 | NV-DEV5 · confluence-standard | `IN_PROGRESS` | IT `transitions {to: IN_PROGRESS, message}`; người báo `messages` trả lời |
  | ISSUE3 | NV-ITO1 · m365-basic | `RESOLVED` | IT `IN_PROGRESS` → `RESOLVED` `{ resolution }` |
  | ISSUE4 | NV-BOD1 · zoom-pro | `IN_PROGRESS`, `reopenCount = 1` | IT `IN_PROGRESS` → `RESOLVED {resolution}` → người báo `reopening {reason}` |
  | ISSUE5 | NV-BOD4 · adobe-cc-teams | `WAITING_PROVIDER` + bản trùng | IT `IN_PROGRESS` → `WAITING_PROVIDER {vendorTicketRef}` (Review 1, C-4: `NEW` chỉ sang `IN_PROGRESS`/`DUPLICATE`, `saas-issue.policy.ts:81-85`); BOD4 báo lần hai với thẻ riêng `[SV-ISSUE5B]`, IT `POST /saas-issues/{idBảnTrùng}/duplicate {ofIssueId: <id ISSUE5>, reason}` |

  Review 1: người xử lý là IT Admin phụ trách **phòng người báo** (ENG/ITO ⟹ ITA1, BOD ⟹ ITA2). Báo lỗi tự giao cho người này; dùng
  người khác thì sự kiện mang nhãn `onBehalfOf`. Review 2 (Q-B): ISSUE5 do NV-BOD4 báo.

  Review 2: sweep đóng báo lỗi `RESOLVED` khi hết cửa sổ (`RESOLVED → CLOSED`, `saas-issue.policy.ts:80-88`). Vì vậy ISSUE3 ở `CLOSED`
  cũng là đã tới đích (`present`), không phải `conflict`.

- **Route · vai:** `GET /saas-issues/options`, `POST /saas-issues` · người giữ ghế; `POST /saas-issues/{id}/transitions`,
  `…/duplicate` · IT Admin phụ trách thuê bao; `…/messages`, `…/reopening` · người báo. Thứ tự chuyển trạng thái đọc ở policy của module
  `licensing/saas-issue` trước khi viết.
- **Code:** tách `saasIssue()` khỏi `extras.steps.ts` sang `steps/saas-issues.steps.ts`; fixture `saasIssue` thành `saasIssues: […]`.
- **Phụ thuộc:** `requests.R01` (ISSUE1 cũ), `catalog.baseline-close` (ISSUE2–5).
- **Màn:** SBF-09; `SAAS_ISSUE_STATE_CHANGED`.
- **Kiểm:** `GET /saas-issues?scope=all` (IT; Review 1: mặc định `scope=assigned`) có đủ `NEW`, `IN_PROGRESS` (2, một có mở lại),
  `RESOLVED`, `WAITING_PROVIDER`, `DUPLICATE`.

#### S13 [sửa] `personnel.notice` → `personnel.notices` + [mới] `personnel.abrupt-departure`

- **S13a–c BM-09** (giữ ENGH → DEV3 đang chờ):

  | Thẻ | Người gửi → về ai | Loại | Super Admin xử lý |
  | --- | --- | --- | --- |
  | NOTICE2 | NV-DESH → NV-DES7 | `LONG_LEAVE` | `POST /personnel-notices/{id}/linking` `{ eventId: <nghỉ dài DES7>, verification: { method: DIRECT_CONTACT, reference } }` |
  | NOTICE3 | NV-DEP → NV-BOD5 (Review 2, Q-B: thay NV-MKTH → NV-MKT4) | `DEPARTURE`, `proposedOn D0+30` | `POST …/rejection` `{ reason }` |
  | NOTICE4 | NV-ITOH → NV-ITO2 | `LONG_LEAVE` | `POST …/recording` `{ verification, grounds: { type: HR_DECISION, reference, issuer, issuedOn: D0 }, event: { startedOn: D0, approvedReturnOn: D0+5 } }` ⟹ nghỉ dài quay lại sau 5 ngày |

  `eventId` của DES7 đọc từ `GET /long-leaves?employeeId=`. NOTICE2 cần `personnel.events` xong. Review 1: API nhận BM-09 `LONG_LEAVE`
  về người đang nghỉ dài, và `linking` nhận nghỉ dài `ACTIVE` đúng người (`leave-notice.listener.ts:59-64`), nên bỏ phương án dự phòng.
  NOTICE4 `needs` thêm `requests.R48`, `requests.R54` để ITO2 gửi xong trước khi nghỉ.
- **Thứ tự:** S13d `needs: ['personnel.events', 'requests.R57']` và đứng trước `rules.first-run` (Review 1, O-1), nên ghế M365 của NV-DEV7
  ra G2 ở hàng IT.
- **Review 1 — Critical C-2:** sau `BLOCK_NOW`, NV-DEV7 không đăng nhập được (`account.policy.ts:15-21`). `findScenarioRequest`
  (`request.steps.ts:51`) lại đăng nhập người gửi để đọc Request. Vì vậy ở mọi lượt chạy lại, `requests.R57` ra `conflict` (exit 4). Cách
  sửa:
  - Kịch bản thêm `readAs?: string` (R57: `'NV-ENGH'`).
  - Khi có `readAs`, đọc `GET /access-requests/{id}` bằng người đó. Kiểm khi viết rằng trưởng phòng đọc được Request đã hủy của phòng
    mình; không được thì dùng Super Admin nếu route cho phép, ghi `D-n`.
  - Người gửi chỉ đăng nhập khi còn phải gửi.
- **S13d nghỉ đột ngột:** bước riêng, chạy **sau** `requests.R57`: Super Admin ghi `POST /offboarding-cases` cho NV-DEV7
  `{ accessBlockMode: BLOCK_NOW, groundsNote, successor: { kind: NONE } }` (cùng thân bài như `personnel.steps.ts:44-56`). `present` khi DEV7
  đã có hồ sơ (`exists()` có sẵn). Request R57 thành `CANCELLED` khi lượt chặn (`BlockAnnouncementService`, job `block-moment`) chạy: có
  thể trong vòng một giờ, **không** trong ngày seed của flows (§8). Bước R57 nhận cả `PENDING` và `CANCELLED` là đã tới đích:
  target mới `PENDING_OR_CANCELLED` chỉ dùng cho R57.
- **Route · vai:** `POST /personnel-notices` · trưởng phòng; `linking`, `rejection`, `recording`, `POST /offboarding-cases` · Super Admin.
- **Idempotent:** như `notice()` cũ (đọc theo người + loại + thẻ ở `note`), trạng thái đã đi tiếp ⟹ `present`.
- **Code:** fixture `notice` thành `notices: […]` với `handling?: 'LINK' | 'REJECT' | 'RECORD'`; tách sang `steps/notices.steps.ts`.
- **Màn:** SBF-13 (BM-09 đã gắn, bị từ chối, đã ghi), MF-2 nghỉ đột ngột, SBF-02 nghỉ dài quay lại gần.
- **Kiểm:** `GET /personnel-notices` (Super Admin) có 1 `PENDING_VERIFICATION`, 2 `RECORDED` (NOTICE2 gắn, NOTICE4 ghi — Review 1: không
  có trạng thái `LINKED`; phân biệt bằng Audit `PERSONNEL_NOTICE.LINKED` / `PERSONNEL_NOTICE.RECORDED`), 1 `REJECTED`;
  `GET /long-leaves` có ITO2 về `D0+5`; `GET /offboarding-cases` có DEV7 `BLOCK_NOW`.

### Đợt 3 — usage và SBF-20

#### S14 [sửa] `usage.sources`, `usage.imports` — usage nhiều ứng dụng, ghost seat ngoài DES

- **Dữ liệu** (tệp mới `fixture/shared-demo-v4/usage-extra.ts`, cửa sổ 120 ngày kết thúc hôm qua, `notice: CONFIRMED_DELIVERED`):

  | Nguồn | IT nhập | Dòng (`lastActivityDaysAgo`) | Kết quả luật |
  | --- | --- | --- | --- |
  | `[SV] Adobe — Admin Console` | NV-ITA2 | DEP 5, BOD4 2, BOD5 76, BOD2 8; BOD6 **không dòng** (Review 2, Q-B) | G4 `REVIEW` BOD5 (75 ngày), G3 BOD6 ⟹ hàng chờ NV-DEP |
  | `[SV] HubSpot — Users export` | NV-ITA1 | SALH 1, SAL3 3; SAL4 **không dòng** | G3 SAL4 ⟹ hàng chờ NV-SALH |
  | `[SV] Notion — Members CSV` | NV-ITA2 | DEV5 1, BOD1 4, ITOH 3, ITO1 6, BOD3 96 (Review 1: bỏ DEV6, ghế đã trả ở S11) | G4 `ACTION` BOD3 ⟹ hàng chờ NV-DEP |

  Không nguồn cho Zoom/Skype (nhóm _Liên lạc_, `COMMUNICATION_APP`), không thêm dòng cho người DES/ENG cũ.
- **Route · vai:** `POST /usage-sources`, `POST /usage-imports` + `…/confirm` · IT Admin nhập (bước có sẵn, chỉ thêm phần tử).
- **Phụ thuộc:** `catalog.baseline-close`; `rules.first-run` vẫn sau `usage.imports` nên luật chạy một lần trên đủ dữ liệu.
- **Không** thêm `ghostDecisions` mới (tránh chờ job hàng chờ ở bước quyết định; ba trưởng phòng mới quyết khi demo).
- **Màn:** MF-5 cho NV-SALH, NV-DEP (Review 2: không còn NV-MKTH); tổng quan usage.
- **Kiểm:** `GET /usage-sources` = 6; sau lượt đầu của job hàng chờ (~6 phút sau khi API chạy) `GET /ghost-seat-queue` của
  NV-DEP ≥ 3 (BOD5, BOD6, BOD3), NV-SALH ≥ 1; ngay sau seed `GET /ghost-seat-recommendations?group=G3` có BOD6 (đọc bằng NV-ITA2) và
  SAL4 (đọc bằng NV-ITA1). Review 1: IT Admin chỉ thấy phòng mình phụ trách.

#### S15 [mới] `renewals.adjustments` — SBF-20 đã ghi

- **Dữ liệu** (tệp `fixture/shared-demo-v4/renewals.ts`):
  1. `adobe-cc-teams` (năm, đỏ) · NV-ITA2 (IT phụ trách): đọc `GET /subscription-renewals/adjustment?subscriptionId=` ⟹ `target`,
     `purchasedQuantity`; `choice` = **`suggestedChoice` của server** (Review 1, C-7: `proposedQuantity ≠ target` ⟹
     `QUANTITY_NOT_SEATS_NEEDED`; dự kiến REDUCE 7 → 4); `proposedQuantity = target`; `outcome: AS_DECIDED`; `nextPeriod` = 12 tháng tiếp
     theo (`startDate = renewalOn`, `renewalDate = renewalOn + 365`, cùng giá dạng `{ amount: string, currency }`, `billingCycle: ANNUAL`,
     `autoRenew: true`, `allowsMidTermReduction: false`). `target = 0` (`CANCEL`) hoặc `target` vượt số cần (cần `note`) ⟹ ghi `D-n`, không
     đoán.
  2. `zoom-pro` (tháng, trong cửa sổ) · **NV-ITA2**, không phụ trách (phụ trách là NV-ITA1; luật cho mọi IT Admin ghi, `renewal-record.policy.ts`
     `preflightOf`, `QĐ-58b`): `suggestedChoice` với `proposedQuantity = target`, `outcome: VENDOR_REFUSED` + **`outcomeNote`** mang thẻ
     `[SV-SBF20-ZOOM]` (Review 1, C-7: thiếu ⟹ 422, `subscription-renewal.dto.ts:77-85`), không `nextPeriod` (gói tháng được bỏ khi
     `commitmentTermMonths = 1`, `nextPeriodProblem`) ⟹ `vendorFollowUpOpen`, thông báo `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED` cho NV-ITA1
     và Finance.
  3. **Để nguyên** Figma, notion-plus, confluence-premium, confluence-standard, hubspot-starter cho demo ghi tay.
- **Không dùng** `POST /subscription-renewals/{id}/outcome`: route chỉ nhận ca `DECIDED` cũ (`renewal-outcome.service.ts:207`), một lần ghi
  mới luôn ra `OUTCOME_RECORDED`.
- **Idempotent:** `GET /subscription-renewals?subscriptionId=…` (filter có thật) có lượt ⟹ `present`. Sau lượt 1, Adobe có **kỳ nối tiếp**
  (thuê bao mới cùng gói, kỳ gốc vẫn `ACTIVE`). Review 1 (C-8): **không** sửa `oneSubscription()`. Danh sách trong một gói xếp
  `createdAt asc` (`subscription.repo.ts:601-606`), nên `rows[0]` luôn là kỳ gốc. Hàm đã không tạo mới khi `rows.length > 0`. Nếu chọn
  "startDate lớn nhất", seed sẽ lấy kỳ nối tiếp: `baseline.steps.ts` thấy 0 ghế, nạp vào baseline đã đóng, ra 409. Chỉ thêm test unit
  "plan có 2 dòng ⟹ lấy dòng đầu, không POST/PATCH/completions".
- **Route · vai:** `GET /subscription-renewals/adjustment`, `POST /subscription-renewals` · IT Admin.
- **Phụ thuộc:** `catalog.baseline-close`, `requests.*` xong (số ghế cần đọc cả Request mở), `rules.first-run`. Đặt sau `ghost.decisions`.
- **Màn:** danh sách renewal, `subscription-deadline-events`, thông báo `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED`.
- **Kiểm:** `GET /subscription-renewals` = 2, cả hai `OUTCOME_RECORDED`, 0 `PROPOSED`; thuê bao Adobe có kỳ nối tiếp với số lượng = `target`.

### Đợt 4 — thiết bị, collector, AI

Trình tự bắt buộc theo tool thật (`Tool-wdp/QUICKSTART-TEST.md` §0, `be-integration/plan.md` kịch bản demo): thông báo ⟹ allowlist
⟹ máy ⟹ bản ký `BM-06` ⟹ xác nhận ⟹ mã đăng ký ⟹ enroll ⟹ session ⟹ usage/status ⟹ yêu cầu dừng. **Allowlist phát hành trước khi xác
nhận** (ghi chú của Owner). Review 1 (R-13): thứ tự này theo ý Owner, **không** phải luật code. `acknowledgement.policy.ts:23-31` chỉ
kiểm: đăng ký còn mở, đã có bản ký, thông báo hiện hành, chưa xác nhận. Allowlist chỉ quyết tool nào được nhận usage. Mọi IT Admin tạo
máy, ghi bản ký, đổi người giữ, ngừng, phát mã và hoàn tất yêu cầu dừng được, không cần phụ trách phòng. Seed vẫn dùng IT Admin phụ
trách phòng người giữ cho dễ đọc.

#### S16 [mới] `devices.registry` (SBF-05)

- **Dữ liệu** (tệp `fixture/shared-demo-v4/devices.ts`):
  - Thông báo giám sát v1: `collected`, `notCollected`, `purpose`, `retention`, `stopRight` (văn bản như kịch bản tool),
    `includesToolStatus: true`, `requiresReacknowledgement: true`.
  - 7 máy (`assetCode` duy nhất, `os: 'Windows 11'`):

    | `assetCode` | Người giữ | Bản ký `BM-06` | Xác nhận | Ghi chú |
    | --- | --- | --- | --- | --- |
    | `SV-LT-001` | NV-DEV5 | có | có | collector (S17) |
    | `SV-LT-002` | NV-ITO1 | có | có | collector |
    | `SV-LT-003` | NV-BOD1 | có | có | collector, rồi dừng xong (S18) |
    | `SV-LT-004` | NV-BOD4 (Review 2, Q-B) | có | có | yêu cầu dừng chờ (S18) |
    | `SV-LT-005` | NV-FIN2 | có | **không** | "chờ xác nhận" |
    | `SV-LT-006` | NV-ITO2 → NV-ITOH | — | — | đổi người giữ `holder-changes` |
    | `SV-LT-007` | NV-DEV6 | — | — | ngừng dùng `retirements` `{ reason }` |

- **Route · vai:** `POST /monitoring-notice-versions` · Super Admin.
  - `POST /devices` `{ assetCode, hostname, os, holderEmployeeId: <uuid>, handedOverOn? }`. Review 1 (C-9): `hostname` bắt buộc (dùng
    `assetCode`), `holderEmployeeId` là uuid (`registry.dto.ts:9-17`).
  - `POST /documents` + PUT tệp + `/documents/{id}/complete` (`uploadDocument`, thêm purpose `SIGNATURE_RECORD` vào `file-kit.ts:43-59`).
    Mỗi máy một tệp riêng do chính IT Admin đó tải lên; tệp phải là PDF BM-06 thật (S23).
  - `POST /device-registrations/{id}/signature-records` `{ documentId, noticeVersionId }` (Review 1: `noticeVersionId` = `id` của
    `GET /monitoring-notices/current`).
  - `POST /devices/{id}/holder-changes` `{ holderEmployeeId }`, `POST /devices/{id}/retirements` `{ reason }` · IT Admin. Review 2:
    hai route này nhận **id máy**, không phải id đăng ký (`openapi.json`). Route `signature-records`, `enrollment-codes`,
    `acknowledgements`, `stop-requests` nhận **id đăng ký** (`registrationId` trong đáp `POST /devices`/`GET /devices/{id}`, hoặc
    `GET /me/devices`). Người giữ đổi thì có đăng ký mới.
  - `POST /me/device-registrations/{id}/acknowledgements` `{ noticeVersionId }` · người giữ.
- **Idempotent:**
  - `GET /monitoring-notices/current` có bản ⟹ không phát hành. Route trả 404 khi chưa có; `DemoApiClient` coi 404 ở đây là "chưa có".
  - Máy theo `GET /devices?search=<assetCode>`, rồi khớp chính xác `assetCode` (không có filter `assetCode`).
  - Xác nhận theo `GET /me/devices` (trạng thái `ACKNOWLEDGED`).
- **Phụ thuộc:** `org.accounts`, `org.it-admins`; xác nhận cần `devices.allowlist` (S17a) xong trước.
- **Màn:** thiết bị (IT, Employee "Thiết bị của tôi", Super Admin thông báo).
- **Kiểm:** `GET /devices` = 7 (1 `RETIRED`); `GET /me/devices` của FIN2 có `canAcknowledge: true`; 4 máy `ACTIVE` ngay sau S16, còn
  **3** sau S18 (LT-003 thành `COLLECTION_STOPPED` — Review 1).

#### S17 [mới] `devices.allowlist` + `devices.collector` (SBF-05a)

- **S17a allowlist** (chạy **trước** bước xác nhận của S16): `POST /collector-allowlist-versions` `{ reason, aiTools: [{ tool:
  'CLAUDE_CODE', applicationId: <Claude> }, { tool: 'CODEX', applicationId: <ChatGPT> }] }` · NV-ITA1. `ANTIGRAVITY_CLI` không đưa vào
  (thử nghiệm, không lưu: `allowlist.policy.ts:4-5`). `present` khi `GET /collector-allowlist-entries` đã có đúng hai cặp.
- **S17b collector** cho 3 máy SV-LT-001…003:
  1. IT Admin `POST /device-registrations/{id}/enrollment-codes` `{ collectorKind: 'AI_COLLECTOR' }` ⟹ `code` (một lần, có hạn).
  2. Công khai `POST /device-enrollments` `{ enrollmentCode }` + header `Idempotency-Key` (43 ký tự base64url, như
     `be_credential.new_install_key`) ⟹ `{ token, expiresAt }`. Token chỉ giữ trong bộ nhớ, không in, không ghi tệp.
  3. `GET /device-session` bằng token ⟹ `state: ACTIVE`, `timezone`, `acceptFromAt`.
  4. `POST /ai-usage-batches` `{ generatedAt: now, days: [{ date: D0, tools: [{ tool: CLAUDE_CODE, coverage: PARTIAL, responses,
     totalTokens }, { tool: CODEX, coverage: PARTIAL, … }] }] }`; số liệu mô phỏng khác nhau mỗi máy (SV-LT-002 chỉ CLAUDE_CODE; một máy có
     `NOT_OBSERVABLE` 0/0). Kết quả phải `ACCEPTED`. Số liệu cố định theo `assetCode` + ngày, để lượt sau gửi lại ngày cũ ra
     `UNCHANGED`.
  5. `POST /ai-tool-status-snapshots` `{ snapshots: [{ tool, observedAt: now, auth: { status: LOGGED_IN }, quota: { status: OK,
     windows: [...] } }] }`.
     - Review 1 (C-5): mã cửa sổ theo tool (`tool-status.policy.ts:11-15`). `CLAUDE_CODE` dùng `SESSION` + `WEEKLY_ALL`; `CODEX` dùng
       `PRIMARY` + `SECONDARY`. `FIVE_HOUR`/`WEEKLY` chỉ thuộc `ANTIGRAVITY_CLI`, gửi cho tool khác thì bị `REJECTED`.
     - Tối đa 3 cửa sổ; `usedPercent` là số nguyên 0–100; `resetsAt` có thể `null`.
- **Vì sao chỉ ngày hôm nay, `PARTIAL`:** server chỉ nhận ngày từ ngày xác nhận tới ngày của `generatedAt`
  (`credential-session.policy.ts:25-35`, `ai-usage-day.policy.ts:63-86`); ngày xác nhận không trọn ngày nên không được `COVERED`. Lượt
  `--continue` ở ngày sau gửi lại các ngày trước (ra `UNCHANGED`) và thêm ngày hôm đó (`PARTIAL`) ⟹ "nhiều ngày" có được khi chạy lại
  mỗi ngày tới ngày demo. Xem §10 Q-A.
- **Idempotent:** IT đọc `GET /devices/{id}/usage`; đã có ngày hôm nay ⟹ `present`, không phát mã mới. Thiếu ngày ⟹ phát mã mới, enroll
  lại (credential mới; credential cũ bị thu hồi `REPLACED`), gửi. Review 1 (C-6): **chỉ** máy có `state = ACTIVE` trong `GET /devices`.
  Máy `COLLECTION_STOPPED` (SV-LT-003 sau S18) ra `present` với ghi chú "chỉ có usage ngày D0". Nếu enroll lại máy đã dừng, server trả
  403 `DEVICE.COLLECTION_STOPPED` (`intake-gate.policy.ts`); lượt `--continue` ở `D0+1` sẽ ra exit 4 và để lại dòng `intake-rejections`. `DemoApiClient` thêm `callAsDevice(token, …)` và `callPublic(…)` (không session email; giữ envelope, lỗi chỉ
  in method/path/status/code).
- **Phụ thuộc:** `devices.registry`, `devices.allowlist`.
- **Màn:** usage AI theo máy (`GET /devices/{id}/usage`, `tool-status`), "Thiết bị của tôi" (`GET /me/devices/{id}/usage`), danh sách
  máy có `collection.lastAcceptedAt`.
- **Kiểm:** 3 máy có `lastAcceptedAt`; `GET /devices/{id}/usage` có dòng ngày `D0` cho từng tool đã gửi; `GET /devices/{id}/tool-status`
  có 1–2 dòng; `GET /devices/{id}/intake-rejections` rỗng.

#### S18 [mới] `devices.stop-requests` (SBF-05a, P5)

- **Dữ liệu:** NV-BOD4 (Review 2, Q-B) gửi yêu cầu dừng cho SV-LT-004 ⟹ `OPEN`, `DEVICE_STOP_REQUESTED` tới NV-ITA2; NV-BOD1 gửi cho SV-LT-003 (**sau**
  S17b) ⟹ NV-ITA2 `completion` ⟹ máy `COLLECTION_STOPPED` (tool sẽ thoát 4).
- **Route · vai:** `POST /me/device-registrations/{id}/stop-requests` `{}` · người giữ; `POST /device-stop-requests/{id}/completion` `{}` ·
  IT Admin phụ trách phòng người giữ.
- **Idempotent:** Review 1 (R-15).
  - `GET /device-stop-requests` mặc định chỉ trả `state=OPEN` và không lọc được theo máy. Đọc cả `?state=OPEN` và `?state=COMPLETED`,
    rồi lọc theo `registrationId` phía client.
  - Người giữ kiểm `GET /me/devices` (`stopRequestPending`) **trước khi** gửi. Gửi lại tạo dòng `INVALID` (`DUPLICATE`/`ALREADY_STOPPED`)
    và làm sai số đếm.
- **Phụ thuộc:** `devices.collector`.
- **Kiểm:** `GET /device-stop-requests` có 1 `OPEN`, 1 đã hoàn tất; SV-LT-003 `COLLECTION_STOPPED`. `DEVICE_STOP_REQUEST_OVERDUE` chỉ có
  sau hạn 2 ngày làm việc (§8).

#### S19 [mới] `ai.simulated` (Q4)

- **Dữ liệu:** `AI_ENABLED = ON`, `AI_ACCESS_REQUEST_SUMMARY_ENABLED = ON`; **không** ghi `AI_PROVIDER_MODE` (mặc định `SIMULATED`, Owner tự
  đổi). Ba lần gọi tóm tắt: NV-ENGH (hàng nhu cầu), NV-CEO (hàng duyệt chi), NV-ITOH (hàng nhu cầu).
- **Route · vai:** `PUT /operating-parameters/{key}` `{ value: 'ON' }` · Super Admin (đã `ON` ⟹ bỏ qua);
  `GET /ai/access-request-summaries/source` ⟹ `queueRevision`, `POST /ai/access-request-summaries` `{ queueRevision }`, rồi
  `GET /ai/access-request-summaries/{invocationId}` hỏi lại tối đa 30 s chỉ để ghi `detail` · trưởng phòng/Người duyệt chi.
- **Idempotent:** `GET /audit-events?actorAppUserId=…&action=AI_INVOCATION.REQUESTED` (Super Admin) có ⟹ `present`
  (`queue-summary-audit-event.mapper.ts:78`). Bước `done` ngay khi POST trả 2xx, không phụ thuộc lượt chạy nền xong.
- **Phụ thuộc:** `requests.*` (hàng chờ có dòng), `org.approval-roles`.
- **Màn:** nút "Tóm tắt bằng AI"; Super Admin xem `AI_INVOCATION.*` trên Audit và nội dung `GET /ai/invocations/{id}/content`.
- **Kiểm:** 3 sự kiện `AI_INVOCATION.REQUESTED`, `providerMode: SIMULATED`.

### Đợt 5 — hợp đồng, hóa đơn, ngừng ứng dụng, tài liệu

#### S20 [sửa] `demo.contracts`, `demo.purchase-invoices`

- **Code:** `demo.steps.ts` (435 dòng) tách `contracts`/`invoices` sang `steps/demo-documents.steps.ts` trước khi thêm dữ liệu.
- **Hợp đồng thêm:** `SV-HD-MS-01` (Microsoft: m365-basic, m365-standard, visio), `SV-HD-ADB-01` (Adobe: adobe-cc-teams), `SV-HD-ZM-01`
  (Zoom: zoom-pro, zoom-business, **không** `effectiveTo` — Review 1: server coi đây là hợp đồng `ACTIVE` không thời hạn, không phải "thiếu
  dữ liệu"; `INCOMPLETE` chỉ khi thiếu vendor/`effectiveFrom`), mỗi hợp đồng có tệp PDF thật in số, tên, ngày khớp thân `POST /contracts`
  (S23). Ca
  `CONTRACT_DATA_INCOMPLETE` của SBF-20 là ở **thuê bao** `claude-team` (S06), không phải hợp đồng.
- **Hóa đơn thêm** (`servicePeriodMonth` = tháng của `D0`):

  | Số | Thuê bao | SL | Đích |
  | --- | --- | --- | --- |
  | SV-INV-005 | m365-basic | 18 | `CONFIRMED` |
  | SV-INV-006 | zoom-pro | 7 | `SUBMITTED` |
  | SV-INV-007 | notion-business | 8 | đích mới `RESUBMITTED`: `RETURNED` rồi `resubmission` với số `SV-INV-007R` ⟹ bản mới `SUBMITTED` |
  | SV-INV-008 | adobe-cc-teams | 7 | `CONFIRMED` (Review 1: không có luật kỳ chặn; `oneSubscription` trả kỳ gốc nên gắn kỳ gốc 7 ghế) |
  | SV-INV-009 | hubspot-starter | 5 | `SUBMITTED` |
  | SV-INV-010 | confluence-standard | 7 (Review 2: số mua = 3 ghế nền + 4 Trống) | `RETURNED` |

- **Review 1 (C-10):** `demo.steps.ts:96-99` đang coi hóa đơn "đã có, khác đích, khác `SUBMITTED`" là `conflict`. `resubmission` tạo hóa
  đơn **mới**, bản gốc giữ `RETURNED`, gọi lần hai ra `ALREADY_RESUBMITTED`.
  - `RESUBMITTED` `present` khi có hóa đơn `SV-INV-007R`.
  - Bản gốc `RETURNED` mà chưa có `SV-INV-007R` ⟹ gọi `POST /purchase-invoices/{id}/resubmission` bằng **chính IT Admin đã nộp bản gốc**
    (người khác ra `NOT_FOUND`).
  - Thân gồm `vendorInvoiceNumber`, `issuedOn`, `servicePeriodMonth`, `quantity`, `unitPriceOriginal`, `netAmount`, `paymentSource`,
    `documentIds` (tệp `PURCHASE_DOCUMENT` mới); không có `link`.
  - Số lượng hóa đơn bằng `purchasedQuantity` của thuê bao, trừ khi cố ý tạo lệch (`PRICE_QUANTITY_EXCEPTION`).
- **Route · vai:** `POST /contracts`, `/contracts/{id}/subscriptions`, `/documents/{id}/attach` · IT Admin phụ trách thuê bao;
  `POST /purchase-invoices` · IT Admin phụ trách; `…/confirmation`, `…/return` · Finance; `…/resubmission` · IT Admin.
- **Phụ thuộc:** `catalog.subscriptions`, `org.accounts`.
- **Màn:** DEMO-9/10; lọc hóa đơn theo trạng thái, phân trang hợp đồng.
- **Kiểm:** `GET /contracts` = 5; `GET /purchase-invoices` = 13 dòng (10 số + `SV-INV-007R` + 2 hóa đơn tháng trước của S24 mục 3 —
  Review 2), có hóa đơn đã nộp lại.

#### S21 [mới] `catalog.retirement`

- **Dữ liệu:** ngừng ứng dụng Skype for Business (không thuê bao, không ghế).
- **Route · vai:** `GET /applications/{id}/retirement` (đã ngừng ⟹ `present`), `POST /applications/{id}/retire` · NV-ITA1.
- **Phụ thuộc:** `catalog.plans`. **Màn:** lọc ứng dụng đã ngừng. **Kiểm:** 1 ứng dụng có `retiredAt`.

#### S22 [sửa] Tài liệu

BE: README fixture (bảng phòng, người, danh mục và kho, Request, usage, thiết bị, SBF-20, AI, giới hạn; sửa "phòng gốc" thành "phòng khởi
đầu do lệnh cài đặt tạo (`QĐ-87f`)"; ghi "giá mô phỏng"); `installation.ts:1` chú thích giữ nguyên; `docs/guides/seed.md` (thời gian
lượt đầu, chạy lại ở `D0+1` ghi thêm ngày usage AI; seed ngày 31/12 rồi `--continue` ngày 1/1 bị `calendarRefusal`, exit 3 —
`seed-calendar.ts:22-30`, Review 1). FE: §9.

## 5b. Yêu cầu bổ sung của Owner (Owner 17/11, đưa vào ở Review 1)

### S23 [mới, xuyên suốt] Tệp upload thật, đúng mẫu

**Hiện trạng** (Review 1, R-21):

- Mọi PDF seed tải lên là một hằng `SAMPLE_PDF`: không có trang, không đọc được (`steps/file-kit.ts:4-6`). Dùng cho:
  - BM-10 (`budget.steps.ts:54-58`, khai `application/pdf` cứng ở `file-kit.ts:26`);
  - tệp phiên bản Finance (`budget.steps.ts:70-73`);
  - hợp đồng (`demo.steps.ts:62`);
  - hóa đơn (`demo.steps.ts:109`);
  - chứng từ ca ngoài quy trình (`demo.steps.ts:298`).
- CSV ghế nền và usage là thật nhưng header dựng tay (`baseline.steps.ts:12`, `usage.steps.ts:54-61`).
- Seed chưa dùng route tải mẫu nào.

**Luật server:**

- Mẫu: `GET /import-templates/:kind?format=xlsx|csv`, vai `SUPER_ADMIN, IT_ADMIN, MANAGER, FINANCE`
  (`policies/import-template/import-template.controller.ts:28-72`). Các loại:

  | Loại | Vai | Định dạng |
  | --- | --- | --- |
  | `employees` | SUPER_ADMIN | xlsx, csv |
  | `seat-baseline` | IT_ADMIN | csv |
  | `license-keys` | IT_ADMIN | csv |
  | `usage-csv` | IT_ADMIN | csv |
  | `budget-proposal` (BM-10) | MANAGER, FINANCE | chỉ xlsx |

- BM-10 có sheet `BM-10` và sheet `Hướng dẫn`.
  - Ô đầu: Phòng ban/Cost Center, Năm ngân sách, Người lập, Ngày lập.
  - Cột: `software, plan, seats, monthly_price_vnd, months, amount_vnd` (= C×D×E), `reason`, dòng tổng `SUM`
    (`import-template.service.ts:74-137`).
  - Server **không đọc** nội dung BM-10 (`budget-proposal-template.policy.ts:6-8`), nên seed phải tự bảo đảm số khớp.
- Tệp ngân sách nhận pdf, xlsx, docx, csv, png, jpg. Đuôi phải khớp mime và magic (XLSX là ZIP `PK\x03\x04`).
- `/documents` chỉ nhận pdf, png, jpeg. PDF phải mở đầu `%PDF-`, sai thì bị `QUARANTINED` (`document.service.ts:171-181`).
- `exceljs` 4.4.0 đã nằm trong `dependencies` (`package.json:85`). Review 2: thư viện PDF theo Q-D, xem mục 4a.

**Yêu cầu:**

1. Tệp mới `src/cli/seed/steps/file-builders.ts`, toàn hàm thuần trả `{ fileName, contentType, bytes }`.
   - `DemoApiClient` thêm `download(email, path)`, trả bytes, không bóc envelope.
   - `uploadBudgetFile` và `uploadDocument` nhận tệp đã dựng thay cho `SAMPLE_PDF`.
   - Xóa `SAMPLE_PDF` khỏi mọi đường ghi.
2. **BM-10:**
   - Trưởng phòng tải `GET /import-templates/budget-proposal?format=xlsx` rồi mở bằng ExcelJS.
   - Xóa dòng mẫu, điền ô đầu (mã Cost Center, năm, họ tên người lập, `D0`).
   - Điền dòng phần mềm từ fixture mới `budgetLines[department]`, các dòng có `amount_vnd` cộng lại bằng `requestedAmount` của bước
     `budget.*`. Đặt lại công thức `SUM` cùng `result`.
   - Review 2: nếu các dòng fixture chưa đủ `requestedAmount`, thêm **một** dòng cân "Nhu cầu phát sinh dự kiến" (`seats = 1`,
     `months = 1`, `monthly_price_vnd` = phần còn thiếu ≥ 0). Phần còn thiếu âm là lỗi fixture: test đỏ.
   - **Review 2 (Q-E) — cơ sở và dự phòng đề xuất:** ngay dưới dòng tổng, ghi ba dòng nhãn ở cột A, số ở cột `amount_vnd`:
     - "Ngân sách cơ sở đề xuất" = `requestedAmount` (= ô tổng; công thức trỏ ô tổng);
     - "Dự phòng đề xuất (p %)" = `round(requestedAmount × p / 100)`;
     - "Tổng cơ sở + dự phòng đề xuất" = hai dòng trên cộng lại.
     `p` là giá trị `BUDGET_RESERVE_DEFAULT_PERCENT` hiện hành (`budget-facts.service.ts:117-119`), Super Admin đọc qua
     `GET /operating-parameters` một lần mỗi lượt. Không đoán 10.
   - `requestedAmount` của phòng có đèn đích (S24) = `baseFor` làm tròn **lên** bội 1.000.000 (trưởng phòng xin số tròn). Phòng khác giữ
     `requestedAmount = base` như fixture.
   - Tải lên `.xlsx` với mime `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
3. **Tệp phiên bản của Finance (giải thích)** — Review 2 (Q-E): cả hai tệp đều có số.
   - XLSX một sheet, mỗi dòng một chỉ tiêu, ba cột "Đề xuất (BM-10)", "Đã chốt (phiên bản)", "Chênh lệch":
     cơ sở (`requestedAmount` ↔ `base`), dự phòng (`round(requestedAmount × p / 100)` ↔ `reserve`), tổng. Thêm Cost Center, năm, số
     phiên bản, tỷ lệ dự phòng đã chốt và lý do lệch (`reserveReason`, hoặc "Cơ sở tính theo thực chi dự kiến đến tháng M").
   - Số "Đã chốt" đọc từ `GET /budget-versions/{id}` **ngay trước khi dựng tệp** (bản `DRAFT`, trong `sendVersion`), không tự tính.
   - Mọi số phải khớp số đã nhập trong hệ thống: test unit dựng lại hai tệp từ cùng một bộ số và so từng ô; script S24 mục 6 kiểm G.
4. **Hợp đồng, hóa đơn, chứng từ ngoài quy trình, BM-06** (PDF một trang, chữ đọc được):
   - Hợp đồng in `number`, `name`, vendor, `effectiveFrom`, `effectiveTo`.
   - Hóa đơn in `vendorInvoiceNumber`, `issuedOn`, `servicePeriodMonth`, `quantity`, `unitPrice`, `netAmount`.
   - Chứng từ ngoài quy trình in số tiền và vendor của bước đóng ca.
   - BM-06 in mã máy, người giữ, phiên bản thông báo.
   - Mọi giá trị khớp thân API cùng bước. Cách dựng PDF theo Owner Q-D (mục 4a).

   **4a. Review 2 — dựng PDF (Q-D đã chốt):**
   - `dependencies` thêm `pdf-lib` **1.17.1** và `@pdf-lib/fontkit` **1.1.1**, ghim đúng phiên bản như `exceljs`. `pdf-lib` cần
     `fontkit` mới nhúng được TTF (`pdfDoc.registerFontkit(fontkit)`). Cài bằng
     `pnpm add pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1`; commit cả `package.json` và `pnpm-lock.yaml`. Image chạy
     `pnpm install --prod --frozen-lockfile` (`Dockerfile:14`), nên lockfile phải khớp.
   - Font: `src/cli/seed/assets/fonts/NotoSans-Regular.ttf` (Noto Sans bản **tĩnh**, không dùng bản biến thiên `[wdth,wght]`), kèm
     `src/cli/seed/assets/fonts/OFL.txt` (giấy phép SIL Open Font License 1.1, nguyên văn) và `src/cli/seed/assets/fonts/README.md`
     (nguồn tải chính thức `github.com/notofonts` hoặc `github.com/google/fonts`, phiên bản, sha256 của tệp).
   - Font phải tới `dist/`: image runtime chỉ chép `dist` (`Dockerfile:41`); `nest-cli.json` hiện không có `assets`. Thêm vào
     `compilerOptions` của `nest-cli.json`: `"assets": [{ "include": "cli/seed/assets/fonts/*", "outDir": "dist" }]`. Mã đọc font bằng
     `join(__dirname, '../assets/fonts/NotoSans-Regular.ttf')` từ `steps/file-builders.ts`; đường dẫn này đúng cả ở `src/` (jest, flows)
     lẫn `dist/` (sau `pnpm build`). Test unit kiểm tệp font tồn tại và đọc được.
   - Nhúng `embedFont(bytes, { subset: true })`; `save({ useObjectStreams: false })`.
   - Mỗi builder trả thêm `lines: string[]` (chữ đã vẽ) để test nội dung. Chữ của font nhúng nằm trong PDF dưới dạng mã glyph, nên
     **không** tìm số hóa đơn trong bytes. Test: bytes bắt đầu `%PDF-`; `PDFDocument.load(bytes)` mở được, `getPageCount() = 1`,
     `getTitle()` = số chứng từ; `lines` chứa số chứng từ, số tiền và một chuỗi có dấu (ví dụ "Hóa đơn").
5. **CSV nhập liệu** (nhân sự S02, ghế nền, usage): header lấy từ `GET /import-templates/<kind>?format=csv`. Test unit so header seed với
   header tĩnh của policy mẫu (`*-template.policy.ts`), để lệch thì đỏ ngay.
6. **Test unit:**
   - Mở lại buffer XLSX bằng ExcelJS, đọc ô tổng đúng bằng `requestedAmount`; ba dòng cơ sở/dự phòng/tổng đề xuất đúng (Review 2).
   - PDF theo mục 4a (Review 2: thay cho "có `/Page`, chứa số trong bytes").
   - Không tệp nào rỗng.
   - `grep SAMPLE_PDF src/cli/seed` không còn chỗ dùng.
7. **Flows:** `SeedStorage` của flows (`test/support/flows/flow-template.ts:96-98`) giữ bytes thật; kiểm magic phía server vẫn qua.
8. **Phụ thuộc:** bước nào tải tệp thì cần tài khoản của vai tải mẫu. Không thêm bước mới; sửa trong bước có sẵn.

### S24 [mới] Báo cáo trưởng phòng và Finance nhất quán

**Công thức thật** (Review 1, R-22; đối chiếu BRD FR-5.1, FR-5.10, FR-5.17):

| Báo cáo | Route · vai | Công thức | Nguồn |
| --- | --- | --- | --- |
| Ngân sách của tôi | `GET /budgets/mine` · MANAGER | `used = committed + spent + pendingSpend`; `remaining = total + adjustment − used` | `budgets/budget-view/budget-view.mapper.ts:31-55` |
| Budget vs Actual | `GET /budgets`, `GET /budgets/summary` · FINANCE, SPENDING_APPROVER | như trên theo phòng; summary cộng theo tiền tệ, `overBudgetCount` | `budget-view/budget-table-view.service.ts:45-110` |
| Thực chi phòng | (trong route trên) | hóa đơn có Cost Center/cam kết **+ ghế-tháng K2** của người giữ. Hóa đơn gắn thuê bao K2 **không** tính cho phòng | `budget/invoice.repo.ts:180-209`; `budget/invoice.policy.ts:95-102` |
| Chưa phân bổ — kho chung | `summary.sharedPoolUnallocated` | Σ tháng đã hết (ghế mua × giá tháng − ghế-tháng đã tính cho phòng); **không** phụ thuộc hóa đơn | `seat-month/seat-month-pool.policy.ts:33-37` |
| Chốt tháng | `POST /budget-review-periods {year, month}` · FINANCE | tháng đã hết, chưa chốt; tính lại ghế-tháng | `review/budget-review-snapshot.service.ts:40-77` |
| Đèn | dòng kỳ chốt | RED: forecast > base + reserve; YELLOW: forecast > base hoặc pace > 110 %; UNDER: tháng ≥ 6 và forecast < 70 % base; còn lại GREEN | `review/budget-review.policy.ts:95-112` |
| Dự kiến cuối năm | dòng kỳ chốt | `spentThrough + spentAfterMonth + (committed + pending)×(1+k) + tăng giá`. **Không** chiếu ghế-tháng của các tháng còn lại. Review 2: chốt tháng `m` chỉ tính lại ghế-tháng của tháng `m` (`budget-review-snapshot.service.ts:56,80`); job `seat-month` (wrapper bật worker) tính mọi tháng đã hết. Vì vậy dự kiến giữa các kỳ chốt cùng ngày gần như không đổi nếu job đã chạy trước, tăng dần nếu chưa (flows tắt job) | `budget-review.policy.ts:24-77`; `budget-review-figures.service.ts:104-147` |
| Rà soát quý, giải trình | tháng 3/6/9 là `QUARTER`; `PUT …/lines/{costCenterId}/explanation` · MANAGER (chỉ dòng khác GREEN) | | `budget-review-explanation.policy.ts:15-34` |
| Tỷ lệ seat Trống | không có route tỷ lệ; `GET /subscriptions/{id}/seat-usage` (IT) | tự tính `trống / mua` | BRD FR-5.10: **chưa hiện thực**. Review 2 (Q-C): **nợ prompt 4b**; seed không làm, không nghiệm thu |
| Dashboard theo vai | `/dashboards/{employee,manager,it-admin,super-admin}`. Finance/Người duyệt chi dùng `/budgets*` và `/budget-review-periods` | dashboard manager trả thực chi/cam kết `NOT_AVAILABLE` | `src/modules/dashboards/README.md` |

**Hiện trạng seed** (suy từ code, CP6 phải đo thật):

- ENG, BOD, FIN, ITO có ngân sách rộng (600 tr, 50 tr) và chi vài triệu ⟹ từ tháng 6 gần như chắc `UNDER`.
- DES nhiều khả năng `RED`; chưa chắc có phòng `GREEN`.
- Mọi ghế cấp `D0−130` ⟹ tháng 1–6 thực chi bằng 0, không có xu hướng.
- Hóa đơn chỉ ở tháng `D0`.
- Chỉ một phòng giải trình (`demo.steps.ts:149-195`).
- Quý tháng 3 và 6 không ký.

**Yêu cầu** (Review 2: Owner đã chốt Q-C; con số dưới đây thay đề xuất cũ):

1. **Đích ở kỳ chốt mới nhất** (`M = min(10, tháng(D0) − 1)`, `demo.steps.ts:153`):

   | Phòng | Đèn | Cơ sở (`base`) | Dự phòng | Vì sao |
   | --- | --- | --- | --- | --- |
   | ENG | `UNDER` | `max(600.000.000, ⌈F/0,5⌉)` | mặc định | Phải còn rộng. DEMO-14 ở `D0+1` chuyển 5 tr từ ENG; nếu sau chuyển cơ sở < dự kiến thì API trả 422 `BUDGET_ADJUSTMENT.BELOW_FORECAST_FLOOR` (`budget-adjustment.controller.ts:88`, `R-40`), bước ra `conflict`, exit 4. `mf4-budget` cần `BUDGET_OK` |
   | ITO | `UNDER` | `⌈F/0,5⌉` | mặc định | DEMO-14 chỉ bổ sung chờ duyệt cho ITO, không đổi cơ sở |
   | BOD | `GREEN` | `g(M) × F` | mặc định | F chủ yếu là ghế-tháng (Adobe, Zoom sau Q-B), cam kết nhỏ (R49) nên dự báo sát |
   | FIN | `YELLOW` | `F / 1,25` | `reservePercent: 60` + `reserveReason` mang thẻ | `F > base` và `F ≤ 1,6 × base`; dung sai F từ −20 % tới +28 % |
   | DES, SAL | `RED` | giữ 280.000, 290.000 | mặc định | Sẵn có; SAL có thêm ghế HubSpot/Zoom |
   | MKT | (không ép) | giữ 240.000 | mặc định | R10 giữ nguyên (Q-B) |

   - `F` là dự kiến cuối năm của phòng ở tháng `M`, `S` là phần thực chi tới hết tháng `M`.
   - `g(M) = max(1,2; 12/(1,1·M) + 0,1)`: tháng 10 ⟹ 1,2; tháng 9 ⟹ 1,31. Ràng buộc `GREEN`: `F ≤ base`, nhịp
     `S·12/(base·M) ≤ 110 %` (`budget-review.policy.ts:83-89`) và `F ≥ 0,7·base` khi `M ≥ 6` (`:109`).
   - Bằng chứng "đèn không phụ thuộc ngày seed" ở bản trước là sai: nhịp chi chia cho `M`, đèn `UNDER` chỉ có từ tháng 6.
   - **Giới hạn ngày:** đủ bốn đèn chỉ bảo đảm khi `D0` từ 01/10 tới 31/12 (`M` = 9 hoặc 10). Ngoài khoảng đó (`g(M) > 1/0,7`, hoặc
     `M < 6`), bước ghi trong `detail` đèn nào không đạt được; **không** ra `conflict`. Ghi vào README và §8.
2. **Xu hướng:** ghế nền **của người mới** (S08) rải `grantedDaysAgo` theo bảng trong fixture, ví dụ 300, 240, 180, 120, 60, để
   `spent` của phòng tăng dần qua các kỳ chốt. Ngày cấp kẹp theo S08 (Review 2). Không đổi ghế của người cũ (§4.2).
3. **Hóa đơn tháng đã qua (Q-C iii):** Review 2: chỉ ENG có Request K1/K4 nhận được hóa đơn. Phòng BOD/FIN không có Request K1/K4
   (`requests.ts`); hóa đơn K2 không tính cho phòng (`invoice.policy.ts:95-102`). Do đó:
   - `SV-INV-011`: R18 (ChatGPT Plus, K1), `servicePeriodMonth` = tháng `M−1`;
   - `SV-INV-012`: R56 (Copilot Pro, K1), tháng `M`;
   - `quantity` 1, giá gói, `link.requestId`, Finance `CONFIRMED`; khóa là số hóa đơn;
   - Đọc trước `purchase-invoice-plan.service.ts:340-400`. Nếu hóa đơn của Request làm gia hạn hay đổi ghế thì bỏ hóa đơn đó, ghi `D-n`.
   - Xu hướng của BOD/FIN/ITO đến từ ghế-tháng (mục 2).
4. **Ngân sách cơ sở (Q-C i):** tệp mới `steps/budget-targets.ts`, hàm thuần:
   - `expectedOf(fixture, department, today)` trả `{ spentThrough, committed, pending }`. Ghế-tháng tính lại theo
     `seat-month.policy.ts:26-81` (giá tháng × ngày giữ / ngày của tháng, các tháng `1…M`), với ghế nền theo ngày cấp của fixture.
     Cam kết và chờ duyệt chi ước từ các Request của phòng trong fixture: giá tháng × số người × `termMonths`. Đọc trước
     `PendingSpendContributions` và `commitment.repo.ts` để xác nhận công thức. Sai lệch chấp nhận được là ±10 %; dung sai của bảng mục 1
     đủ rộng cho mức này.
   - `baseFor(department, today)` dùng bảng mục 1. Test unit chép `lightOf`/`paceOf` (`budget-review.policy.ts:83-112`), kiểm đèn đích
     với `D0` = 17/11, 01/10, 31/12, và kiểm ENG còn `BUDGET_OK` cho Figma 375.000 × số tháng còn lại
     (`test/flows/mf4-budget.flow-spec.ts:100-120`).
   - Bước `budget.year` dùng `baseFor` cho ENG/ITO/BOD/FIN. Thân `POST /budget-versions` của FIN có
     `reservePercent: 60, reserveReason`. Version phải có **trước** mọi Request (PLAN T9b).
   - Lượt chạy lại đọc trạng thái, không so số: `baseFor` ở `D0+1` khác `D0` là bình thường.
5. **Chốt tháng** (`demo.budget-reviews`) vẫn là bước cuối, sau mọi ghế và hóa đơn.
   - Ký **mọi kỳ `QUARTER` trừ kỳ quý mới nhất** (`POST /budget-review-periods/{id}/signature` · FINANCE). Thường là tháng 3 và 6.
     Review 2: ký khi `state ≠ SIGNED`; ký lần hai ra 409 `BudgetReviewSignedError` (`budget-review-signature.service.ts:41-42`).
   - Quý mới nhất: hai trưởng phòng giải trình (ưu tiên FIN và DES nếu dòng của họ `PENDING`), ít nhất một dòng còn chờ. Chỉ dòng khác
     `GREEN` có trưởng phòng mới `PENDING` (`budget-review-explanation.policy.ts:19-21`). Review 2: `explainOne` hiện coi "có một dòng
     `EXPLAINED`" là xong (`demo.steps.ts:185`). Đổi thành: đủ 2 dòng `EXPLAINED` ⟹ `present`; thiếu thì giải trình tiếp; ít hơn
     3 dòng `PENDING` ban đầu thì ghi `detail`, không `conflict`.
6. **Script kiểm tổng** `D:\FPT\FALL2026\Code\verify-logs\seed-v4-expand\check-finance.mjs`, chỉ đọc. Mật khẩu lấy từ biến môi trường;
   không in. Script kiểm:
   - **A** (FINANCE `GET /budgets?year=Y&pageSize=100`, `/budgets/summary`): mỗi phòng `remainingWithReserve =
     effectiveBudget.total − (committed + spent + pendingSpend)`, `overBudget ⇔ remainingWithReserve < 0`; tổng của summary bằng Σ các
     dòng. Review 2: dùng `effectiveBudget` (cơ sở + điều chỉnh đã duyệt, `budget-view.mapper.ts:27-55`). Dùng `total` của phiên bản thì
     đẳng thức sai từ `D0+1`, khi DEMO-14 chuyển 5 tr từ ENG sang BOD.
   - **B** (`GET /seat-month-charges`): Σ `spent` phòng = Σ hóa đơn có Cost Center/cam kết + Σ ghế-tháng có Cost Center.
     `sharedPoolUnallocated` = Σ (ghế mua × giá tháng − ghế-tháng) theo tháng đã hết.
     `companySpent` = Σ hóa đơn `CONFIRMED` của năm (**không** so với Σ phòng).
   - **C** (`GET /budget-review-periods` + `/{id}`):
     - mỗi tháng đã hết đúng một kỳ; `QUARTER` ⇔ tháng 3/6/9;
     - từng dòng: `light` = `lightOf` tính lại; `remaining` = `base + reserve − spent − spentAfterMonth − committed − pending`;
     - `spent` không giảm theo tháng;
     - có đủ bốn đèn ở kỳ mới nhất, đúng bảng mục 1 (khi `D0` trong khoảng ở mục 1);
     - kỳ `QUARTER` cũ đã `SIGNED`, kỳ quý mới nhất có ≥ 2 dòng `EXPLAINED` và ≥ 1 dòng `PENDING`.
   - **D:** `GET /budgets/mine` của từng trưởng phòng bằng dòng phòng ở A. NV-CEO đọc ra cùng số với Finance.
   - **E** (IT `GET /subscriptions/{id}/seat-usage`): `free = mua − giữ`. Chỉ in, **không** nghiệm thu: chỉ số FR-5.10 là nợ prompt 4b
     (Review 2, Q-C).
   - **F:** bất biến README: `GET /access-requests/{R10,R21,R11}/budget-check` đúng kịch bản. Q-B đã chốt: MKT không đổi.
   - **G (Review 2, Q-E):** với mỗi phiên bản năm `Y`, lấy link tải BM-10 và tệp Finance (`POST /budget-attachments/{id}/links`), mở
     bằng ExcelJS. Ô tổng của BM-10 = `requestedAmount`; ba dòng đề xuất đúng công thức. Cột "Đã chốt" của tệp Finance = `base`,
     `reserve`, `total` của `GET /budget-versions/{id}`. Cột "Chênh lệch" = đã chốt − đề xuất.
7. **Flows:** không flow nào khẳng định đèn. `mf4-budget` cần ENG `BUDGET_OK`.

## 6. Số đếm nghiệm thu cuối (DB trống, ngày `D0`)

| Thứ | Số |
| --- | --- |
| Ứng dụng / gói / thuê bao | 25 / 32 / 29 (cộng 1 kỳ nối tiếp Adobe ⟹ 30 dòng thuê bao) |
| Nhân viên / tài khoản demo | 58 + NV-SA + 3 `NV-IMP*` / 42 (+ Super Admin, + 1 `INVITED`), 1 khóa |
| Request kịch bản | 29 trong `requests.ts` + R33 + 18 mới (R40–R57) |
| Hàng duyệt chi NV-CEO | ≥ 7 |
| Thiết bị / máy `ACTIVE` / đăng ký có usage / yêu cầu dừng | 7 / 3 (Review 1) / 3 / 2 (1 `OPEN`, 1 hoàn tất, 0 `INVALID`) |
| Lượt SBF-20 | 2 `OUTCOME_RECORDED`, 0 `PROPOSED` |
| Lần gọi AI | 3 |
| Hợp đồng / hóa đơn mua | 5 / 13 dòng (10 số + `SV-INV-007R` + `SV-INV-011`, `SV-INV-012`; Review 2) |
| Hàng chờ ghost seat (sau job ~6 phút) | NV-DEP ≥ 3, NV-SALH ≥ 1, NV-MKTH 0 (Review 2, Q-B) |
| Hoàn trả / báo lỗi SaaS / BM-09 | 2 / 7 dòng (6 + bản trùng) / 4 (1 `PENDING_VERIFICATION`, 2 `RECORDED`, 1 `REJECTED`) |
| Tệp upload (S23) | 0 chỗ dùng `SAMPLE_PDF`; mọi BM-10 là XLSX từ mẫu, tổng = `requestedAmount` |
| Báo cáo (S24) | script `check-finance.mjs` A–D, F, G đều đạt (E chỉ in); đủ 4 đèn ở kỳ chốt mới nhất theo bảng S24 mục 1 |
| Exit seed DB trống / chạy lại cùng ngày / `--continue` ngày sau | 0 / 2 / 0 (chỉ DEMO-14, usage AI, chốt tháng nếu `tháng(D0+1) − 1 ≤ 10` và khác `tháng(D0) − 1`). Review 2: `D0+1` cần sửa N-1 (§4.1.3) |

## 7. Chiến lược test

- **Unit (bắt buộc mỗi bước mới, `src/cli/seed/**/*.spec.ts`)**, theo mẫu `catalog.steps.spec.ts`, `request.steps.spec.ts`,
  `scenario-path.spec.ts`: hàm dựng body thuần (điều khoản, thuê bao neo ngày, lô usage AI, ảnh chụp trạng thái công cụ, thân renewal,
  thân thông báo giám sát, CSV import nhân sự), `nextScenarioAction`/`reachedTarget` cho mọi target mới, `oneSubscription` giữ dòng đầu khi có kỳ nối tiếp (Review 1, C-8),
  `callAsDevice`/`callPublic` của `DemoApiClient` (fetch giả, không lộ token trong lỗi, theo `demo-api-client.spec.ts`).
- **Bất biến fixture** (`fixture/shared-demo-v4.spec.ts`): cập nhật số đếm (13 → 25 ứng dụng; "một thuê bao năm" → nhiều; "một thuê bao mỗi gói
  trừ K5" → trừ K5 và Skype), thêm test cho §4.2 (không Request ở MKT/DES/SAL ngoài R10/R21/R11/R33…, không người cũ ngoài 5 trưởng phòng có
  ghế mới, không usage dòng DES mới, ≤ 3 Request mở/người, không xin gói đang giữ, allowlist chỉ ứng dụng SAAS không Liên lạc).
- **Thứ tự bước** (`seed-steps.spec.ts`): S17a trước bước xác nhận của S16; S13d sau `requests.R57`; S15 sau `ghost.decisions`;
  S19 sau `requests.*`.
- **Review 1 — test unit thêm:**
  - `org.accounts` bỏ người `lockedInDemo` đã khóa (C-1);
  - đọc R57 bằng `readAs` (C-2);
  - `GRANT` bỏ `rejectedLines` (C-12);
  - `FAIL_TASK_OPEN`/`FAIL_TASK_CLOSE` (C-3);
  - S17 bỏ máy không `ACTIVE` (C-6);
  - mã cửa sổ theo tool (C-5);
  - hóa đơn `RESUBMITTED` (C-10);
  - `subscriptionTerms()` với `D0` = 31/12, 29/02, 31/01 (O-2);
  - test pool `shared-demo-v4.spec.ts:122` tính cả target `EXECUTING`;
  - tệp S23.
- **Review 2 — test unit thêm:**
  - `placedAsWanted` nhận người có sự kiện fixture ở `D0+1` (N-1): DEV4 ở ITO sau `effectiveOn`; OFF1/DEV7 `TERMINATED` hoặc `LEFT`;
  - `baseFor`/`expectedOf` cho đèn đích với `D0` = 17/11, 01/10, 31/12; ENG còn `BUDGET_OK` (S24 mục 4);
  - không người MKT nào giữ ghế K2 mới (Q-B); ngày cấp ghế nền không trước `startDate` của thuê bao (S08);
  - R42, R55 có `confirmReserve: true`;
  - BM-10 có ba dòng đề xuất; tệp Finance có ba cột đề xuất/đã chốt/chênh lệch (Q-E);
  - PDF mở lại được bằng `PDFDocument.load`, font tồn tại ở `src/cli/seed/assets/fonts/` (Q-D);
  - ký kỳ quý bỏ qua kỳ `SIGNED` và kỳ quý mới nhất; giải trình đủ 2 dòng thì `present`.
- **Tích hợp thật:** seed trên DB trống + chạy lại cùng ngày (checkpoint) và `pnpm test:flows` (seed là template của flows). Không viết
  integration test mới cho seed. Review 1 (R-20): template flows đòi **mọi** bước `done/present` (`flow-template.ts:115-121`). Một bước
  mới ra `conflict` trong app test (route công khai của collector, AI `SIMULATED`, tệp thật trong `SeedStorage`) làm **toàn bộ** flows đỏ.
  Vì vậy chạy flows ở mọi checkpoint có bước mới, không chỉ ở CP cuối.

## 8. Giới hạn (ghi vào README, không giả bằng dữ liệu)

- `AUTO_RENEWAL_INCIDENT`/`EXPIRY_MARKED` (zoom-business), `SUBSCRIPTION_RENEWAL_KEPT` (hubspot-starter, ngày `D0+1`), cảnh báo
  `SUBSCRIPTION_RENEWAL_ALERT/RED_ALERT` do job theo giờ ghi; không có ngay khi seed xong; flows tắt mọi job (`flow-template.ts:53-71`).
- R57 `CANCELLED` có sau lượt job chặn truy cập. Review 1 (O-3): `BlockMomentSweeper` **không** có trong `SWEEPER_OVERRIDES` của flows
  (job chạy lần đầu sau 5 phút, `block-moment.job.ts:7-8`), nên trong flows R57 có thể ở `PENDING` hoặc `CANCELLED`. Không flow nào
  khẳng định trạng thái này.
- Khuyến nghị MF-5 của SAL/BOD vào hàng chờ trưởng phòng sau lượt đầu job hàng chờ (~6 phút). Review 2: MKT không có khuyến nghị
  mới (Q-B).
- Review 2: đủ bốn đèn ngân sách chỉ bảo đảm khi seed từ 01/10 tới 31/12 (S24 mục 1). Kỳ chốt mới nhất là tháng 10 cả khi seed tháng
  12 (`demo.steps.ts:153`).
- Review 2: chỉ số "tỷ lệ chi phí seat Trống" (FR-5.10) là nợ prompt 4b, chưa có màn/route.
- `DEVICE_STOP_REQUEST_OVERDUE` chỉ sau hạn 2 ngày làm việc.
- Usage AI theo máy: mỗi ngày chạy seed thêm đúng một ngày `PARTIAL` (§10 Q-A).
- Trưởng phòng nghỉ có kế nhiệm, điều chuyển trưởng phòng: **ngoài phạm vi** (flows dựa vào trưởng phòng hiện có; một điều chuyển mới làm
  hỏng `mf3-transfer`).

## 9. Tài liệu FE cần cập nhật sau khi seed xong

Thư mục `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\`:

1. `demo/README.md`: revision BE mới (nhánh, commit), "Điều cần biết": giá **mô phỏng**; thuê bao trong/ngoài cửa sổ SBF-20 neo theo `D0`;
   AI bật `SIMULATED` (nhãn "Giả lập — không phải AI"); chạy lại `--continue` ở ngày demo thêm DEMO-14 **và** một ngày usage AI; danh sách
   ca chỉ có sau job (§8).
2. `demo/accounts.md`: bảng người và tài khoản thêm 17 người (§S01) + `NV-IMP*`; cột DEMO cho ca mới; hàng NV-BOD3 "tài khoản bị khóa",
   NV-NEW3 "lời mời chưa kích hoạt", NV-NEW2 "chưa xếp phòng"; IT Admin: thuê bao mới mỗi người phụ trách.
3. **Phòng `ADMIN` của Super Admin** (sửa `demo/accounts.md:19` và thêm vào `roles/super-admin.md`), đoạn đề xuất:
   > Super Admin thuộc phòng `ADMIN — Quản trị hệ thống`, **phòng khởi đầu do lệnh cài đặt tạo** (`QĐ-87f(1)`, `QĐ-67a`), không phải phòng
   > cha (mô hình phòng phẳng, `QĐ-52`). Theo `FR-8.7`, Super Admin **vẫn thuộc một phòng** nhưng không gửi Request (`SoD-1`). Phòng này
   > cố ý **không có trưởng phòng, IT Admin phụ trách hay Cost Center**: đó là trạng thái đúng, không phải lỗi dữ liệu. Vì vậy `ADMIN` hiện
   > trong `departmentWarningList` và cảnh báo thiếu Cost Center; FE hiển thị như mọi cảnh báo, không ẩn phòng và không coi Super Admin là
   > "không thuộc phòng nào".
4. `demo/scenarios.md`: mục mới — SBF-20 (thuê bao nào trong/ngoài cửa sổ, đỏ, đã ghi, chưa ghi, thiếu dữ liệu), thiết bị & collector (máy,
   trạng thái, usage, dừng), AI, MF-1 trạng thái mới (bảng R40–R57), hoàn trả, báo lỗi SaaS, BM-09, nhập nhân sự, tài khoản, ngừng ứng dụng;
   bảng "Danh mục và kho dùng chung" 25/32/29.
5. `flows/ai-collector-device.md`: dòng "dataset demo có sẵn" (máy, allowlist, mã đăng ký phát lúc demo cho máy thật của người test).
6. `roles/it-admin.md`, `roles/manager.md`, `roles/spending-approver.md`, `roles/employee.md`: chỉ thêm liên kết tới mục mới của
   `scenarios.md` khi vai có màn mới có dữ liệu (không chép lại dữ liệu).

## 10. Câu hỏi (Review 2: Q-A…Q-E đều **đã chốt**, xem §2 và cuối file; phần dưới giữ để truy vết)

- **Q-A — "nhiều ngày usage AI" (Q6).** Code chỉ nhận ngày từ lúc người giữ máy xác nhận (`acceptFromAt` = thời điểm xác nhận,
  `credential-session.policy.ts:25-35`); ngày trước đó bị `OUTSIDE_WINDOW`, ngày xác nhận chỉ được `PARTIAL`
  (`ai-usage-day.policy.ts:72-84`). Seed không ghi SQL nên **ngày seed chỉ có 1 ngày usage**; mỗi lượt `--continue` ngày sau thêm một ngày.
  Seed sớm hơn để có nhiều ngày lại phá các ca neo "seed ≤ 1 ngày trước demo" (DEV4 điều chuyển ngày mai, ITA4 nghỉ ngày làm việc thứ 3,
  DEMO-5…). **Khuyến nghị:** chấp nhận `D0` + `D0+1` (seed hôm trước, `--continue` sáng ngày demo) và demo thêm bằng tool thật trên một máy
  (`Tool-wdp` gửi bù 14 ngày, cũng chỉ từ ngày xác nhận). Nếu Owner cần ≥ 7 ngày thì phải có quyết định riêng (một route hoặc lệnh vận hành
  nạp lịch sử usage), ngoài phạm vi seed.

- **Q-B — ghế K2 ở MKT (Review 1, C-11).** Ghế Adobe (MKTH/MKT3/MKT4/MKT5) và Zoom (MKT3) bị tính ghế-tháng cho CC-MKT, kể cả
  trong lần chốt tháng của seed. Thực chi MKT vượt 240.000 + 24.000, nên R10 "dùng dự phòng" bị chặn khi Người duyệt chi duyệt (kiểm lại
  ngân sách lúc quyết định). Hai phương án:
  - (a) Chuyển ghế Adobe/Zoom và ISSUE5, SV-LT-004 của MKT sang người BOD mới (ngân sách 50 tr). MF-5 mới ở NV-DEP; MKT vẫn không giữ
    ghế. **Khuyến nghị.**
  - (b) Giữ ở MKT, sửa README/DEMO R10 thành "bị chặn khi duyệt".
- **Q-C — báo cáo (Owner 17/11 (2)).** Seed có được làm ba việc sau không?
  - (i) Tính ngân sách cơ sở ENG/FIN/BOD/ITO theo thực chi dự kiến ở `D0`, để có đủ bốn đèn (ENG vẫn đủ cho `mf4-budget`).
  - (ii) Rải ngày cấp ghế nền của người mới từ 300 tới 30 ngày trước.
  - (iii) Thêm hóa đơn K1/K4 của 2–3 tháng đã qua, gắn Request.
  - Ngoài ra: BRD FR-5.10 "tỷ lệ chi phí seat Trống" chưa có route. Ghi là nợ sản phẩm hay bỏ khỏi yêu cầu báo cáo?
- **Q-D — PDF thật (Owner 17/11 (1)).** PDF có tiếng Việt có dấu cần nhúng font, tức là thêm dependency (ví dụ `pdf-lib` +
  `@pdf-lib/fontkit` và một tệp font). Seed chạy trong image production (`node dist/cli seed`), nên đây phải là `dependencies`. Phương án
  khác: tự viết PDF tối giản với font chuẩn, chữ **không dấu**. Khuyến nghị: tự viết, không dấu, không thêm dependency.
- **Q-E — số "cơ sở, dự phòng" (Owner 17/11 (1)).** Mẫu BM-10 chỉ có dòng phần mềm và tổng (= `requestedAmount`). Base và dự phòng là
  của phiên bản Finance. Đề xuất: in base, reserve và tổng vào tệp XLSX giải thích gắn vào phiên bản (S23 mục 3). Đồng ý không?

## 11. Ranh giới

- **Luôn:** ghi qua API đúng vai; idempotent; test unit cho mỗi bước; kiểm `typecheck`, `lint`, `jest src/cli/seed` mỗi task; một commit
  một task.
- **Hỏi trước (ghi `D-n`, chọn phương án an toàn không trái QĐ, làm tiếp):** API từ chối một tổ hợp spec giả định (ví dụ K1 +
  `UNCONTROLLABLE`, tài khoản cho người chưa xếp phòng); một bất biến §4.2 bị chạm; flows đỏ vì dữ liệu mới.
- Review 2 — **ngoại lệ đã được Owner cho (Q-D):** `package.json` + `pnpm-lock.yaml` (chỉ thêm `pdf-lib@1.17.1`,
  `@pdf-lib/fontkit@1.1.1` vào `dependencies`), `nest-cli.json` (chỉ thêm `assets` cho font), `src/cli/seed/assets/fonts/**`. Ngoài các
  tệp này, không đổi cấu hình build.
- **Không bao giờ:** SQL trong seed; sửa code sản phẩm ngoài `src/cli/seed/**`, `docs/**` (trừ khi spec ghi); đổi migration; sửa tay
  `openapi.json`; đụng dữ liệu Figma, NV-DEV1/2/3, NV-MKT2, NV-NEW1, NV-INT1; thêm điều chuyển; in token/mật khẩu; commit thư mục
  `docs/reviews/seed-expansion-2026-11-17/`.

---

## Owner chốt Q-A (17/11 ~19:00)

Chấp nhận usage AI 1–2 ngày: seed lúc D0, `--continue` lúc D0+1. Muốn thấy nhiều ngày hơn thì demo bằng Tool-service thật. Không đổi luật
server, không lùi ngày nhận usage.

## Owner chốt Q-B…Q-E (17/11 ~19:30)

| Câu | Chốt |
| --- | ---- |
| Q-B | Chuyển ghế K2 mới của Adobe/Zoom sang phòng **BOD**; kịch bản R10 của MKT giữ nguyên. |
| Q-C | **Đồng ý.** Ngân sách ENG/FIN/BOD/ITO tính theo ngày seed, rải ngày cấp ghế, thêm hóa đơn các tháng trước, để đủ 4 đèn và có xu hướng qua các tháng. Chỉ số "tỷ lệ chi phí seat Trống" (FR-5.10) chưa có route ⟹ ghi **nợ prompt 4b**, seed không làm. |
| Q-D | **PDF tiếng Việt có dấu:** thêm `pdf-lib` (dependency thường, vì seed chạy cả trên VPS) và một font Unicode (Noto Sans, giấy phép OFL) vào repo. |
| Q-E | **Cả hai tệp.** BM-10 của trưởng phòng ghi số tiền đề nghị, các dòng nhu cầu và số cơ sở + dự phòng *đề xuất*. Tệp XLSX giải thích của Finance ghi số cơ sở + dự phòng *đã chốt*, cùng chênh lệch so với đề xuất. Mọi số khớp với số đã nhập trong hệ thống. |
