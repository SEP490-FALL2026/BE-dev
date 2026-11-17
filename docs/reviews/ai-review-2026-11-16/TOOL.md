# Review chỉ đọc — AI collector ↔ BE (16/11/2026)

**Skill đã đọc/dùng:**
- `agent-skills:code-review-and-quality`: process review 5 trục, gắn nhãn mức độ cho phát hiện.
- `agent-skills:planning-and-task-breakdown`: dùng cho mục 3, gồm danh sách việc, thứ tự phụ thuộc và ước lượng. Không ghi `tasks/`.
- `superpowers:verification-before-completion`: mọi kết luận đều có file:dòng; ghi rõ cái gì chưa chạy.

**Phạm vi đã đọc:**
- Tool: `Code/Tools/workstreams/ai-collector`. Thư mục này **không có git**, nên không có revision để ghim.
- BE: `BE-dev-software-license-management` nhánh `dev` @ `94a8ee84`, working tree sạch.
- Tài liệu FE: `devices-and-ai-usage.md`, `flows/ai-collector-device.md`.
- Luật và quyết định: BRD §5.4.4b, ADR-13, sổ QĐ (QĐ-74, QĐ-59a, QĐ-101a/g).

**Cách review:** chỉ đọc tĩnh. **Không chạy test** (theo feedback "no test runs without asking"). Lệnh duy nhất đã chạy là kiểm Python/tzdata của máy Owner (`python -c ...`).

---

## Trả lời ngắn câu hỏi của Owner

> "Phần API cho tool đã xong hết chưa, giờ chỉ cần chỉnh tool để build thành app console chạy trên các máy khác để test gửi data về server phải không?"

**Đúng một phần.**

1. **API cho luồng chính (mức A) đã đủ và khớp contract với tool.** Đã có route cho:
   - đăng ký máy;
   - lưu bản ký BM-06;
   - nhân viên xác nhận;
   - tạo mã đăng ký;
   - enroll, session, rotation;
   - nhận lô usage và ảnh chụp trạng thái;
   - IT/nhân viên đọc dữ liệu;
   - thu hồi credential.

   Đối chiếu từng field ở §2 không thấy lệch nào làm hỏng request.
2. **API chưa xong hết:**
   - **Dừng thu thập (FR-4.18 / US-09-04) chưa có route.** Bảng `DeviceStopRequest` có, nhưng không có service hay controller nào ghi `collection_stopped_at`.
   - Có **một lệch logic BE ↔ tool về allowlist theo ngày** (F-2): thêm công cụ vào allowlist giữa cửa sổ 14 ngày làm BE từ chối nguyên ngày cũ và sinh mục rà soát giả.
3. **Tool đã có sẵn lớp gửi BE**: `be-enroll`, `be-session`, `be-upload`, `be-forget`. Lớp này đã demo với BE local ngày 05/11. Còn lại **không chỉ là "build"** mà là việc đóng gói thành sản phẩm. Các việc chặn trước khi chạy được trên máy khác:
   - **tzdata**: trên Python Windows sạch, `ZoneInfo` sẽ lỗi;
   - **HTTPS trên VPS**: tool từ chối `http://` không phải localhost;
   - **thư mục dữ liệu theo user**;
   - **lịch chạy**;
   - **lưu credential an toàn**;
   - **gate version CLI quá chặt**: máy khác dễ ra `NOT_OBSERVABLE`;
   - lỗi `be-enroll` xóa token đang dùng.

   Ước lượng khoảng **5–8 ngày công cho bản Windows demo**, cộng **2–3 ngày BE** cho dừng thu thập và sửa allowlist. macOS thêm 3–4 ngày.

---

## 1. Tool hiện làm được gì

### 1.1 Nguồn và cách đọc (local)

| Nguồn | Đọc gì | Gate | Lên wire BE? |
|---|---|---|---|
| Codex CLI/IDE | `~/.codex/sessions` (token usage theo response) | version exact-pin 0.159…0.164.0 (`ai_collector/contract.py:26-27`) | Có, `CODEX` |
| Claude Code | `~/.claude/projects` + subagents | dòng `2.1.x` + gate shape (`contract.py:11-18`) | Có, `CLAUDE_CODE`; Workflow agent chỉ local (`README.md:40`) |
| Antigravity CLI | `~/.gemini/antigravity-cli/brain` | 1.4.10/1.4.12 (`contract.py:41`) | Có, `ANTIGRAVITY_CLI`, chỉ store `agy-cli` (`be_batch.py:16-20`); hub IDE không gửi |
| Gemini CLI, Command Code, OpenCode | profile tương ứng | pin riêng | **Không** (`be_batch.py:10`) |
| Trạng thái/quota | `provider-status`: chạy lệnh chính thức không tạo model turn (`claude /usage` pin 2.1.295 `provider_status.py:213`, agy `/usage` `provider_status.py:331`, Codex app-server) | — | Ảnh chụp riêng (`be_status.py`) |

- **Lọc tại nguồn (ADR-13, BR-45.10):** adapter chỉ giữ metric whitelist và hash id. `collect_report_data` dựng model đã allowlist: không path, id hay content ngoài `conversations`, và `be-upload` luôn gọi với `include_conversations=False` (`be_uploader.py:192`). `build_days` chỉ xuất `{date, tools[{tool, coverage, responses, totalTokens}]}` (`be_batch.py:82-85`). `build_snapshots` chỉ xuất tool, `observedAt`, auth, quota, cửa sổ %; không gửi gói, email, version (`be_status.py:81-82`). → **Đạt ADR-13 §2** ở phía tool.
- **Định dạng gửi:** JSON qua HTTPS, envelope BE `{success, data}`. Lỗi chỉ đọc `error.code` (`be_client.py:76-89`).

### 1.2 Lớp gửi BE (đã có — `be-integration/spec.md`, plan Task 1–5)

| Hạng mục | Có chưa | Bằng chứng |
|---|---|---|
| Endpoint | `POST /device-enrollments`, `GET /device-session`, `POST /device-session/rotations`, `POST /ai-usage-batches`, `POST /ai-tool-status-snapshots` | `be_uploader.py:68,88,114,127,205` |
| Xác thực thiết bị | `Authorization: Bearer sstd_…` lấy từ `<state>/be-credential.json` | `be_client.py:61-62`, `be_credential.py:10-68` |
| Idempotency | `Idempotency-Key` = `install_key` 43 ký tự, **lưu trước khi gọi**, dùng lại khi mất response | `be_uploader.py:62-69`, `be_credential.py:31-33` |
| Chống trùng dữ liệu | Không có outbox. Mỗi lần chạy dựng lại toàn bộ cửa sổ ≤ 14 ngày từ log local. BE giữ bản `generatedAt` sau cùng, trùng nội dung thì `UNCHANGED` (QĐ-101a) | `be_batch.py:23-30`, `be_uploader.py:186-201` |
| Retry | Không vòng lặp. Mạng/429/5xx ⟹ exit 6, lần chạy sau thử lại. 413 ⟹ chia đôi một lần | `be_uploader.py:38-39,124-136` |
| Xoay vòng | Khi còn < 7 ngày; ghi nguyên tử rồi mới dùng | `be_uploader.py:14,107-121` |
| Thu hồi/dừng | 401 REVOKED/EXPIRED ⟹ xóa credential + state (exit 3). 403 COLLECTION_STOPPED ⟹ xóa state, giữ credential (exit 4). NOT_ACKNOWLEDGED ⟹ exit 5 | `be_uploader.py:27-40,166-173` |
| An toàn kết nối | Chỉ `https://…/api/v1` (`http://localhost` cần cờ demo); không theo redirect; **không proxy**; đọc ≤ 256 KiB | `be_client.py:32-49,66-73` |
| Mã thoát CLI | 0/2/3/4/5/6 | `__main__.py:119-134,228-230` |

### 1.3 Test

- Có `test_be_client` (10), `test_be_batch` (11), `test_be_status` (8), `test_be_uploader` (29) = 58 ca, chạy với BE giả `http.server`.
- Toàn bộ thư mục `tests/` có 921 hàm `test_` (đếm tĩnh).
- Kết quả ghi lại ngày 05/11 là "58 xanh, full 929 xanh" (`be-integration/plan.md:163-164`). **Lượt này không chạy lại.**
- Demo với BE thật (local `dist/main`, 05/11) đạt: enroll → `ACTIVE` → `ACCEPTED:1` → gửi lại `UNCHANGED:1` (`plan.md:165`).
- **Chưa test:** dừng thu thập (BE chưa có route), BE trên VPS/HTTPS, máy sạch không có Python/tzdata, Task Scheduler, macOS.

---

## 2. Đối chiếu contract tool ↔ BE (`94a8ee84`)

### 2.1 Từng route

| Route BE (operationId) | Field BE | Tool tạo/đọc | Kết luận |
|---|---|---|---|
| `deviceEnrollmentCreate` | header `Idempotency-Key` regex `^[A-Za-z0-9_-]{16,128}$` (`credential-enrollment.dto.ts:6`); body strict `{enrollmentCode: trim 1–32}` (`:5`); BE chuẩn hóa hoa/bỏ gạch (`credential.policy.ts` `normalizeEnrollmentCode`); 201 `{token, expiresAt}` (`:10`) | key = `token_urlsafe(32)` 43 ký tự; body `{enrollmentCode}` trim ≤ 32; đọc `token`, `expiresAt` (`be_uploader.py:59-78`) | **Khớp** |
| `deviceSessionGet` | strict `{state ∈ ACTIVE·AWAITING_ACKNOWLEDGEMENT·COLLECTION_STOPPED, expiresAt, timezone, acceptFromAt?, acceptUntilAt?, allowlist{version?, entries[{kind:AI_TOOL,key}] ≤ 3}}` (`credential-session.dto.ts:9-24`) | dùng `state`, `timezone`, `acceptFromAt/UntilAt`, `allowlist.entries[kind=AI_TOOL].key` (`be_uploader.py:99-104,166-179`); bỏ qua `expiresAt` của session (dùng bản lưu trong credential) | **Khớp**. Allowlist rỗng ⟹ tool gửi 0 ngày nhưng vẫn in `uploaded:true` (Nit N-1) |
| `deviceSessionRotationCreate` | body strict `{}` (`credential-session.dto.ts:5`); 201 `{token, expiresAt}`; ân hạn 24 h (`credential.policy.ts` `ROTATION_GRACE_MS`) | gửi `{}`, đọc hai field (`be_uploader.py:114-121`) | **Khớp** |
| `aiUsageBatchCreate` | `generatedAt` ISO **có offset** (`ai-usage.dto.ts:7,31`); `days` 1–14, `date` không trùng; `tools` 1–10 không trùng; `tool` ∈ 3 khóa; `coverage` ∈ COVERED·PARTIAL·NOT_OBSERVABLE; `responses` int 0–1 000 000; `totalTokens` int ≥ 0 (`:9-39`) | `generatedAt` = `isoformat(+00:00)`; ≤ 14 ngày, sắp tăng, bỏ ngày rỗng; không POST khi `days` rỗng; tool không trùng; `NOT_OBSERVABLE` ⟹ 0/0 (`be_batch.py:42-86`, `be_uploader.py:193-201`) | **Khớp**. Ngữ nghĩa cũng khớp: BE chỉ nhận `COVERED` khi cả ngày nằm trong cửa sổ (`ai-usage-day.policy.ts:74`), tool chỉ gán `full` khi cả ngày nằm trong `since/until` (`report.py:266-278`). `responses` không bị kẹp ≤ 10⁶ (Nit N-2) |
| `aiToolStatusSnapshotCreate` | `snapshots` 1–20; `observedAt` có offset; `auth.status` 4 giá trị; `quota.status` OK·NOT_SUPPORTED·FAILED; `windows` ≤ 3, mã theo từng tool (`tool-status.dto.ts:6-37`, `tool-status.policy.ts:10-14`); OK ⟺ có cửa sổ | ≤ 20; `observedAt` = ISO Z; mã cửa sổ Codex `PRIMARY/SECONDARY`, Claude `SESSION/WEEKLY_ALL/WEEKLY_MODEL`, agy `FIVE_HOUR/DAILY/WEEKLY`; OK chỉ khi có cửa sổ; trùng mã ⟹ lấy % lớn nhất (`be_status.py:9-83`) | **Khớp** |
| Mã lỗi | 401 `DEVICE.CREDENTIAL_INVALID/REVOKED/EXPIRED`; 403 `DEVICE.NOT_ACKNOWLEDGED`, `DEVICE.COLLECTION_STOPPED`, `DEVICE.TOOL_STATUS_NOT_ACKNOWLEDGED`, `DEVICE.WRONG_COLLECTOR_KIND`; 404 `DEVICE_ENROLLMENT.CODE_INVALID`; 429; 503 | `failure_of` + nhánh 404 của enroll (`be_uploader.py:27-40,70-73,207-209`); regex mã `[A-Z0-9_.]` (`be_client.py:16`) | **Khớp** |
| Giới hạn tần suất | 60 request/giờ/credential (`device-authenticated.decorator.ts:14`); enroll 10/phút (`device-enrollment.controller.ts:27`) | mỗi lần chạy 3–5 request | Đủ, kể cả khi chạy hằng ngày |

### 2.2 Luồng đăng ký máy end-to-end

| Bước | Route BE | Có? |
|---|---|---|
| SA phát hành thông báo (có `includesToolStatus`) | `POST /monitoring-notice-versions` (`notice.controller.ts:27`) | ✔ |
| IT phát hành allowlist | `POST /collector-allowlist-versions` (`allowlist.controller.ts:37`) | ✔ |
| IT đăng ký máy ↔ nhân viên | `POST /devices` (`registry.controller.ts:56`) | ✔ |
| IT lưu bản ký BM-06 | documents + `POST /device-registrations/:id/signature-records` (`signature-record.controller.ts:25`) | ✔ |
| Nhân viên xác nhận | `POST /me/device-registrations/:id/acknowledgements` (`acknowledgement.controller.ts:26`) | ✔ |
| IT tạo mã (24 h, 1 lần) | `POST /device-registrations/:id/enrollment-codes` (`credential.controller.ts:53`) | ✔ |
| Tool enroll / session / gửi lô / xoay | 5 route ở §2.1 | ✔ |
| IT/NV xem | `GET /devices/:id/usage`, `/tool-status`, `/intake-rejections`, `GET /me/devices/:id/usage`, `/tool-status` | ✔ |
| IT thu hồi | `POST /device-credentials/:id/revocations` (`credential.controller.ts:130`); đổi người giữ/thôi dùng tự thu hồi | ✔ |
| **NV yêu cầu dừng, IT xử lý (FR-4.18, FR-10.5, QĐ-101g)** | **không có**. Có model `DeviceStopRequest` (`prisma/models/devices.prisma:141-160`), nhưng không service nào ghi `collection_stopped_at`; chỗ duy nhất ghi nó là đặt `NULL` (`registry.repo.ts:194`). Tài liệu FE ghi rõ "chưa có route" (`flows/ai-collector-device.md:81-84`, `reference/devices-and-ai-usage.md:22`) | ✘ |

**Kết luận:** end-to-end **chạy được** cho đăng ký → xác nhận → enroll → gửi → xem → thu hồi. Code của cả hai phía khớp; demo 05/11 trên BE local đã chứng minh, nhưng **chưa có lần chạy với BE `94a8ee84` trên VPS**. **Chưa chạy được** nhánh dừng thu thập: bước 7 của kịch bản demo (`be-integration/plan.md:146-150`) gọi hai route không tồn tại, sẽ trả 404.

### 2.3 Phát hiện

- **F-1 — Required (BE):** thiếu dừng thu thập (FR-4.18, US-09-04, ADR-13 §3–4, QĐ-101g). Cần thêm:
  - NV gửi yêu cầu;
  - IT hoàn tất hoặc đóng không hợp lệ (2 ngày làm việc, cờ tự xử lý);
  - đặt `collection_stopped_at`;
  - bật lại bằng xác nhận mới (QĐ-66ae).

  Phía tool đã xử lý sẵn `COLLECTION_STOPPED` (exit 4).
- **F-2 — Required (BE↔tool, lệch logic):**
  - Tool gửi mọi ngày trong cửa sổ theo **allowlist hiện hành** (`be_uploader.py:99-104`, `be_batch.py:70`).
  - BE xét allowlist **theo từng ngày** (`allowlist.policy.ts:69-85`) và **từ chối nguyên ngày** nếu có một tool không thuộc allowlist ngày đó (`ai-usage-day.policy.ts:71`). BE còn ghi mục rà soát `COLLECTOR_UNLISTED` cho tool đó (`ai-usage-batch.service.ts:89-99`, `vendor-account-intake.service.ts:100-124`).

  Hệ quả: khi IT **thêm** công cụ vào allowlist, hoặc phát hành allowlist **sau** ngày nhân viên xác nhận, trong tối đa 13 ngày sau đó các ngày cũ bị `REJECTED NOT_IN_ALLOWLIST`. Mất cả số của công cụ hợp lệ trong những ngày đó, và sinh mục rà soát "phần mềm ngoài danh sách" giả.

  Sửa đề xuất (chọn một):
  - (a) BE bỏ riêng tool không thuộc allowlist ngày đó thay vì từ chối cả ngày, và không tạo rà soát cho tool đã có trong bản hiện hành;
  - (b) session trả `allowlist.publishedAt` hoặc lịch sử theo khóa để tool cắt ngày.

  **Demo tạm:** phát hành allowlist **trước** khi nhân viên xác nhận.
- **F-3 — Required (tool):** `be-enroll` ghi đè credential bằng token rỗng **trước** khi gọi BE (`be_uploader.py:62-66`). Máy đang có token hợp lệ mà chạy `be-enroll` với mã sai hoặc hết hạn (404) sẽ mất token local và phải xin mã mới. Nên từ chối khi đã enroll, trừ khi có `--force` hoặc đã `be-forget`.
- **F-4 — Required (đóng gói):** README ghi "không dependency bên thứ ba" (`README.md:145`), nhưng mọi đường cắt ngày dùng `ZoneInfo` (`report.py:575-579`, `be_batch.py:26`). Trên máy Owner, `zoneinfo.TZPATH = ()` và gói `tzdata 2025.3` được cài từ pip. Python Windows sạch thiếu `tzdata`, nên `setup`/`be-upload` lỗi `invalid_timezone`. Phải đóng gói kèm `tzdata`.
- **F-5 — Required (vận hành):** tool chỉ chấp nhận `https://` (`be_client.py:32-41`). Caddy trên VPS chạy HTTP `:80` nếu chưa đặt `DOMAIN` (`Caddyfile` `{$DOMAIN::80}`, `docker-compose.prod.yml:136`). VPS demo cần domain + Let's Encrypt; không nên thêm cờ cho phép HTTP từ xa.
- **F-6 — Rủi ro cao (độ phủ dữ liệu):**
  - Codex pin **chính xác** tới 0.164.0 (`contract.py:26-27`), Claude `/usage` pin 2.1.295 (`provider_status.py:213`), agy 1.4.10/1.4.12 (`contract.py:41`).
  - Máy test có CLI mới hơn ⟹ nguồn `refused` ⟹ BE nhận `NOT_OBSERVABLE 0/0`; quota ⟹ `FAILED`.
  - Hôm nay là 16/11, các CLI tự cập nhật thường xuyên.
- **F-7 — Rủi ro:** tool chỉ chạy được thực tế trên Windows.
  - Có đường dẫn cứng `agy.exe` (`provider_status.py:384`), `codex-win32-x64` (`:507`), Job Object (`probes.py:78-126`).
  - macOS có nhánh `pwd` (`context.py:27-29`) nhưng chưa từng chạy; chứng chỉ TLS của Python macOS (python.org) cũng cần xử lý.
- **F-8 — Optional:**
  - Tài liệu tool đã cũ: README và handoff vẫn ghi "chưa tích hợp BE" (`README.md:3`, `handoff.md:3`, `USER_GUIDE_VI.md:250`), trong khi spec, plan và code BE đã có từ 05/11.
  - `Code/Tools` không nằm trong git: không ghim được bản build, không có lịch sử.
- **N-1 — Nit:** allowlist rỗng ⟹ tool in `uploaded:true, days:0`, không cảnh báo.
- **N-2 — Nit:** `responses` không kẹp ≤ 1 000 000. Vượt ngưỡng thì 422 cho cả lô, khó xảy ra.
- **FYI:**
  - `lastAcceptedAt` chỉ cập nhật khi có `ACCEPTED` (`ai-usage-batch.service.ts:112-113`). Thực tế mỗi ngày mới đều sinh dòng mới nên vẫn tăng.
  - Route nhận dữ liệu của extension trình duyệt chưa có (`WRONG_COLLECTOR_KIND`). Ngoài câu hỏi này.

---

## 3. Để "build thành app console chạy trên máy khác gửi data về server"

Mục tiêu đề xuất cho demo: **Windows 10/11 trước**, một gói `.zip`. macOS để sau.

### 3.1 Danh sách việc

| # | Việc | Nội dung cụ thể | Công | Phụ thuộc |
|---|---|---|---|---|
| T0 | Đưa `Code/Tools` vào git (repo hoặc thư mục trong repo có sẵn) | Ghim revision cho mỗi bản build | 0,25 | — |
| T1 | **Gói chạy được trên máy sạch** | Chọn (A) **Python embeddable 3.13 + `tzdata` + `ai_collector`** + `.cmd` launcher, đơn giản và không cần build; hoặc (B) PyInstaller onedir `ai-collector.exe` có `--collect-data tzdata`. Mở rộng `scripts/build_package.py` (hiện chỉ gói `run_local_report.*`) | 1–1,5 | F-4 |
| T2 | **Thư mục dữ liệu theo user** | `RUNTIME_ROOT` hiện là `<gói>/.runtime` (`report.py:25`), không ghi được nếu cài ở Program Files. Chuyển sang `%LOCALAPPDATA%\SaaS-Sentry\ai-collector\` (config, state, credential, log); thêm `--data-dir` | 0,5 | T1 |
| T3 | **Lệnh `install`/`agent` một bước** | `setup` (dò nguồn) → hỏi URL server (mặc định nhúng URL VPS) → đọc mã đăng ký từ stdin (`be-enroll`) → `be-session` (in trạng thái, cảnh báo allowlist rỗng) → `be-upload` lần đầu → đăng ký lịch. Thêm `uninstall` (`be-forget` + xóa task). Sửa F-3 tại đây | 1 | T2 |
| T4 | **Lịch chạy nền** | Task Scheduler **theo user đang đăng nhập** (không SYSTEM, vì cần profile `.codex/.claude` và CLI của user): hằng ngày + khi đăng nhập + "chạy bù khi lỡ lịch". Lệnh `be-upload` một lần, gửi lại an toàn. QĐ-101a "thu hằng ngày, gửi lô tuần" vẫn thỏa: gửi hằng ngày là gửi lại idempotent (giới hạn 60/giờ). Tạo bằng `schtasks /Create` hoặc XML | 0,5–1 | T3 |
| T5 | **Log** | File JSON-lines xoay vòng (vd. 5 × 1 MB) trong data dir: thời điểm, mã thoát, `reason`, đếm `ACCEPTED/UNCHANGED/REJECTED`. Không token, path, body (giữ nguyên chuẩn của `be_uploader`). Thêm lệnh `status` in lần chạy cuối | 0,5 | T2 |
| T6 | **Lưu credential an toàn** (Level B Task 7) | DPAPI `CryptProtectData` qua `ctypes` cho `token` (và `install_key`); file không chứa token rõ. Gợi ý theo hướng chuẩn của Windows, chưa kiểm | 0,5–1 | T2 |
| T7 | **Gate version CLI** (F-6) | Trước demo, chạy `provider-status` và `validate` (`README.md:79-85`) trên từng máy test. Thêm pin Codex/Claude/agy đúng version máy test sau khi diff source, hoặc nới Codex sang gate theo shape như Claude. Thiếu bước này thì số liệu lên server toàn `NOT_OBSERVABLE` | 0,5–2 | — |
| T8 | **Dò lại nguồn khi cài tool mới** | `setup` không ghi đè (`setup.py:93`); agent nên dò lại mỗi lần chạy hoặc mỗi tuần | 0,25 | T3 |
| T9 | **Offline** | Hiện đã ổn về logic: không outbox, mỗi lần dựng lại 14 ngày từ log gốc; mất mạng ⟹ exit 6, lần chạy sau gửi bù; offline > 14 ngày ⟹ mất ngày cũ (khớp cổng 14 ngày QĐ-101b). Thêm trigger "khi có mạng" và ghi log. Credential hết hạn sau 90 ngày offline ⟹ cần mã mới | 0,25 | T4 |
| T10 | **Allowlist** | Tool đã lấy allowlist từ session mỗi lần chạy, không cần cơ chế cập nhật riêng. Cần BE sửa F-2, hoặc quy trình demo "phát hành allowlist trước khi xác nhận" | (BE) | F-2 |
| T11 | Proxy công ty (`--use-system-proxy`) | Chỉ khi mạng thử nghiệm có proxy; hiện `ProxyHandler({})` (`be_client.py:49`) | 0,25 | — |
| T12 | Tài liệu | `USER_GUIDE` cho IT (tạo máy → BM-06 → mã → cài) và nhân viên; sửa README/handoff cũ (F-8) | 0,5 | T3 |
| T13 | macOS (tùy chọn) | Bỏ đường dẫn cứng Windows, `launchd` plist, Keychain, chứng chỉ TLS, test trên máy thật | 3–4 | T1–T6 |
| B1 | **BE: dừng thu thập** (F-1) | Route NV tạo yêu cầu, IT hoàn tất/không hợp lệ, hạn 2 ngày làm việc, audit, bật lại bằng xác nhận mới; test tích hợp | 1,5–2,5 | — |
| B2 | **BE: allowlist theo ngày** (F-2) | Phương án (a) hoặc (b) ở F-2 + test | 0,5–1 | — |
| V0 | **VPS HTTPS** (F-5) | Đặt `DOMAIN`, kiểm Let's Encrypt, `curl https://<domain>/api/v1/...` | 0,25–0,5 | — |

**Tổng:**
- Windows demo (T0–T9, T12, V0): khoảng **5–8 ngày công**.
- BE B1 + B2: **2–3,5 ngày**.
- macOS: thêm **3–4 ngày**.

**Thứ tự:** V0, T7, B2 trước vì là rủi ro cao, cần biết sớm. Sau đó T0 → T1 → T2 → T3 → T4/T5 → T6, rồi B1.

### 3.2 Rủi ro

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| CLI máy test khác version đã pin (F-6) | Số liệu toàn `NOT_OBSERVABLE`/`FAILED`, demo "không có dữ liệu" | T7; ghi version từng máy trước khi demo |
| Lệch allowlist theo ngày (F-2) | Ngày cũ bị từ chối, sinh rà soát giả | B2; tạm thời phát hành allowlist trước khi xác nhận |
| Gói chưa ký số | SmartScreen/AV cảnh báo hoặc chặn `.exe` (PyInstaller hay bị gắn cờ) | Phương án embeddable Python + `.cmd`; hướng dẫn "More info → Run anyway" |
| Task chạy sai tài khoản | Đọc nhầm profile, probe CLI lỗi | Task theo user, "only when logged on" |
| Đồng hồ máy lệch > 5 phút | `FUTURE_GENERATED_AT`, cả lô bị từ chối (`ai-usage-day.policy.ts:68`) | Kiểm đồng bộ giờ Windows trong `install` |
| Probe trạng thái gọi CLI vendor | Có thể refresh credential vendor, tốn thời gian (timeout 60 s mỗi tool) | Giữ `--no-status` làm tùy chọn; chỉ chạy probe một lần/ngày |
| Dữ liệu nhạy cảm (ADR-13, NĐ 356) | Máy test là máy cá nhân của thành viên, không phải "máy công ty cấp" | Ghi rõ là demo (GĐ-9 BRD); chỉ cài trên máy đã đăng ký + BM-06 + xác nhận; dùng `--dry-run` cho người giữ xem body |
| Nhánh dừng thu thập chưa có | Không demo được FR-4.18 | B1 |

### 3.3 Cách test trên máy thật với VPS demo

1. **Server (một lần):**
   - V0 xong (HTTPS).
   - Seed không có máy nào (`flows/ai-collector-device.md:89`). Theo kịch bản `be-integration/plan.md:91-129`, đổi `API=https://<domain>/api/v1` và bỏ `--allow-insecure-localhost`.
   - SA phát hành thông báo có `includesToolStatus:true`.
   - IT tạo 3 ứng dụng và **phát hành allowlist trước**.
   - Mỗi máy test: IT `POST /devices` cho đúng nhân viên → tải BM-06 → `signature-records` → nhân viên xác nhận trên web → IT tạo mã `AI_COLLECTOR`. Mã sống 24 giờ.
2. **Máy test** (ma trận: ≥ 1 VM Windows sạch **không có Python**, ≥ 1 máy có Claude Code/Codex/agy thật, ghi version từng CLI):
   - giải nén → `install`, hoặc chạy tay `setup` → `be-enroll` (dán mã);
   - `be-session`: kỳ vọng `ACTIVE`, đúng `timezone`, `allowlistKeys = 3`;
   - `be-upload --dry-run`: người giữ máy tự xem body, chỉ có ngày/công cụ/bao phủ/số;
   - `be-upload`: kỳ vọng `ACCEPTED`.
3. **Kiểm phía server:** IT `GET /devices/:id/usage`, `/tool-status`, `/intake-rejections`; nhân viên `GET /me/devices/:id/usage`. Số khớp dashboard `local-report` của máy đó (cùng ngày, cùng tool, đã trừ Workflow).
4. **Kịch bản:**
   - (a) chạy lại không dùng AI ⟹ `UNCHANGED`;
   - (b) dùng Claude/Codex một lượt rồi chạy ⟹ ngày hôm nay `ACCEPTED`, số tăng;
   - (c) rút mạng ⟹ exit 6; cắm lại, task chạy bù ⟹ `ACCEPTED`;
   - (d) khởi động lại máy ⟹ task chạy khi đăng nhập (xem log);
   - (e) IT thu hồi credential ⟹ exit 3, file credential bị xóa;
   - (f) SA phát hành thông báo `requiresReacknowledgement` ⟹ exit 5; nhân viên xác nhận lại ⟹ chạy tiếp;
   - (g) đổi người giữ ⟹ exit 3;
   - (h) chỉnh giờ máy nhanh 10 phút ⟹ `REJECTED FUTURE_GENERATED_AT` (xem `/intake-rejections`), trả giờ lại;
   - (i) thêm công cụ mới vào allowlist ⟹ xem F-2 (kỳ vọng sau B2: không còn ngày cũ bị từ chối);
   - (j) sau B1: nhân viên yêu cầu dừng, IT hoàn tất ⟹ exit 4, state bị xóa, credential còn.
5. **Ghi kết quả:** revision BE, version từng CLI, mã thoát, đếm results vào bảng _Kết quả_ của `be-integration/plan.md`. Không ghi token hay mã đăng ký.

---

## Những gì lượt review này KHÔNG xác minh

- Không chạy unit test của tool hay BE. Con số 58/929 test xanh lấy từ ghi chép ngày 05/11.
- Không gọi VPS và không kiểm cấu hình `DOMAIN` thật của VPS.
- Không chạy lại `be-upload` với BE `94a8ee84`.
- Không đối chiếu version CLI trên máy test, vì không biết đó là những máy nào.
