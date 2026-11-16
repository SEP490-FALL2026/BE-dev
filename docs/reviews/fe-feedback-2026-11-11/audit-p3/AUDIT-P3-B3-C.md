# AUDIT P3 · B3-C — RC-1 (SBF-11a) + RC-2 (SBF-08 / SBF-07a)

- Ngày: 15/11/2026 · Reviewer: Opus, **chỉ đọc** (không chạy pnpm/jest/docker, không checkout).
- Phạm vi: `eaea260b`, `e45f4feb`, `ab87e908`, `2c410c08` (RC-1) · `948b009a`, `7b22d87c`, `5640040c`, `7061087a`, `dd9d18b5`, `93ee8081`, `78a938c2` (RC-2). File:dòng tính ở **`78a938c2`** (`git show 78a938c2:<path>`); đối chiếu chéo migration với `be-verify` @ `134a713d` (đã gộp lane B).
- Skill đã đọc và dùng: `agent-skills:code-review-and-quality` (process + năm trục review, phân mức Critical/Required/Optional/Nit); `superpowers:verification-before-completion` (mọi kết luận có bằng chứng đọc code; không tuyên bố test xanh/đỏ vì không chạy). Domain skill: không có skill riêng cho NestJS/Prisma, dùng chính rule repo (`AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/*`) làm chuẩn.
- Nguồn nghiệp vụ đã đọc: `project-decisions.md` (QĐ-111y, QĐ-103m, QĐ-103y(3), QĐ-104j, QĐ-98h, QĐ-33c, QĐ-96e, QĐ-96j, QĐ-100ae, QĐ-90f, QĐ-106j, QĐ-34a/b, QĐ-99j, QĐ-111ax); `SBF-07a` v4.1, `SBF-08` v2.1, `SBF-11a` (md sinh từ spec); `EP-13` (`US-13-03` AC-8/10/11/13, `US-13-05` AC-7/18–26); `EP-14` (`US-14-04` AC-2/3); `OVERNIGHT-DECISIONS.md` D-79, D-80, D-81, RC-1-Q1/Q2, RC-2-Q1, RC-1-O*, RC-2-O*.

## Tóm tắt

| Mức | Số | Mã |
| --- | --- | --- |
| Critical | 0 | — |
| Required | 7 | B3C-01 … B3C-07 |
| Optional | 7 | B3C-08 … B3C-14 |
| Nit | 4 | B3C-N1 … N4 |

RC-1 (SBF-11a) đúng nghiệp vụ và chắc về khóa/transaction; vấn đề nằm ở RC-2: mô hình "một quyết định của IT trên mỗi mục SBF-08" làm mất nửa sau của SBF-07a (thu hồi kèm bằng chứng, chờ Request ≤ 10 ngày làm việc, một hồ sơ mở mỗi (nhà cung cấp, định danh), mở lại) và cho hóa đơn lệch đi thẳng vào ghi tiền ⟹ có đường ghi thực chi hai lần.

---

## Required

### B3C-01 · Required (High) — `LEGALIZE_VIA_REQUEST` / `REVOKE` là quyết định cuối do IT bấm tay: trái QĐ-104j, QĐ-103m, QĐ-103y(3), US-13-03 AC-10, US-13-05 AC-20/22/23/25 (D-81(3) / RC-2-Q1 trái QĐ)

- File: `src/modules/usage/vendor-account-review-queue/vendor-account-review.dto.ts:11` (enum 4 giá trị); `src/modules/usage/vendor-account-review/vendor-account-decision.service.ts:38-55` (mọi quyết định ⟹ `DECIDED` vĩnh viễn, chỉ `OUT_OF_PROCESS` mở ca); `prisma/migrations/20261113004540_rc2_vendor_account_values/migration.sql:19` (`OutOfProcessOutcome` = `FALSE_ALARM|RECORD_SPENT|REPORT_ONLY`, **không** có kết cục thu hồi); trigger `vendor_account_discrepancies_guard` (004550:53-69) khóa cứng mục đã quyết.
- Kịch bản 1 (REVOKE): IT Admin `POST /vendor-account-discrepancies/{id}/decision {decision: REVOKE, note: "đã thu hồi"}` ⟹ mục `DECIDED`, không tác vụ `SBF-18`, không ghi *đã hủy gia hạn/thanh toán*, không bằng chứng, không hồ sơ `SBF-07a`. Tài khoản vẫn ở nhà cung cấp thì kỳ import sau bị nuốt (B3C-04) ⟹ thu hồi "trên giấy".
- Kịch bản 2 (LEGALIZE_VIA_REQUEST): IT chọn ⟹ `DECIDED` ngay; người dùng không gửi Request hoặc Request không tới bước duyệt chi trong 10 ngày làm việc ⟹ không gì nhắc, không thu hồi. Bản thân tên "legalize via request" là khái niệm **Request hợp thức hóa** mà QĐ-103m đã bỏ; US-13-05 AC-22 cấm IT/Finance "tạo một Request gắn với hồ sơ thay người dùng hoặc đặt hạn chờ trên hồ sơ".
- Căn cứ: QĐ-104j ("kết cục *thu hồi* bắt buộc kèm *đã hủy gia hạn/thanh toán* và bằng chứng; trần 10 ngày làm việc chờ Request tính tới khi Request tới bước duyệt chi"); QĐ-103y(3); US-13-03 AC-10 ("*đã vào danh mục qua Request được duyệt* và *dừng và thu hồi* chỉ do hệ thống ghi theo kết quả Request hoặc thu hồi … không có thao tác đóng tay"); US-13-05 AC-20 (kết luận *trên tài sản công ty* ⟹ tác vụ thu hồi qua `SBF-18`), AC-23 (chờ, trần 10 ngày làm việc, ngày kết luận là ngày 1 nếu là ngày làm việc), AC-25 (không đóng được *thu hồi* khi thiếu cờ hủy gia hạn hoặc bằng chứng). SBF-08 bước 5–8: quyết định của SBF-08 chỉ là *ngoài quy trình ⟹ SBF-07a* hoặc *thực hiện lại quyết định đã có* (cấp lại `SBF-17` / thu hồi lại `SBF-18`), không có "legalize". Lý do của RC-2-Q1 "BE chưa có luật nguồn cho hệ quả tự động" **không đúng**: AC-20/23/25 là luật nguồn.
- Cách sửa (gọn nhất, đúng QĐ):
  1. Bỏ `LEGALIZE_VIA_REQUEST` khỏi `VendorAccountDecision`; đổi `REVOKE` thành `REDO_RECLAIM` (và thêm `REDO_GRANT`) đúng nghĩa SBF-08 bước 6 — chỉ ghi lựa chọn là chấp nhận được ở đây vì quyết định gốc đã có. Enum mới ở migration riêng đứng trước (D10).
  2. Đưa thu hồi ngoài quy trình vào ca `SBF-07a`: thêm kết cục `REVOKED` vào `OutOfProcessOutcome`; CHECK `out_of_process_cases_state_check` thêm vế `outcome = 'REVOKED' ⟹ renewal_cancelled = true AND cardinality(document_ids) ≥ 1`; `closureRefusal` thêm `REVOKE_EVIDENCE_MISSING`.
  3. Chờ Request: cột `company_asset boolean`, `concluded_on date`, `waiting_request_id uuid` trên ca; trần = ngày làm việc thứ 10 tính từ `concluded_on` bằng lịch ngày làm việc đang dùng (QĐ-104k(2)); điều kiện dừng chờ = Request tới bước duyệt chi (đọc qua `RequestsApi`, không đọc bảng `requests`). Nếu chưa kịp làm timer: ít nhất chặn đóng `REVOKED` và hiển thị `waitUntil` để FE nhắc — ghi OQ cho Owner.
- Test/mutation: integration "IT đóng REVOKED không cờ hủy gia hạn ⟹ 422, có cờ + 1 tệp ⟹ 201"; "kết luận thứ Ba 04/08 ⟹ `waitUntil` 17/08" (đúng ví dụ AC-23); "POST decision LEGALIZE_VIA_REQUEST ⟹ 422 VALIDATION_ERROR". Mutation #4 ở bảng cuối hiện **sống** (không có ca REVOKE/LEGALIZE trên mục còn mở).

### B3C-02 · Required (High) — Không có "một hồ sơ ngoài quy trình đang mở mỗi (nhà cung cấp, định danh)"; phát hiện lặp không gắn bằng chứng vào hồ sơ đang mở (QĐ-98h, QĐ-33c, US-13-03 AC-11, SBF-07a bước 1)

- File: `prisma/migrations/20261113004560_rc2_out_of_process_cases/migration.sql:8-23,36` (bảng không có cột định danh; unique duy nhất là `discrepancy_id`); `vendor-account-decision.service.ts:39-48` (`OUT_OF_PROCESS` luôn `insertCase`, không tra ca đang mở); khóa chống trùng của SBF-08 là `(organization_id, source, source_ref)` (004550:47), `source_ref` = id finding / id identity / id hồ sơ hóa đơn / khóa công cụ — không phải (nhà cung cấp, tài khoản).
- Kịch bản: `x@congty.vn` ở Figma trước tiên là `UNMATCHED_IDENTITY` (mục A) ⟹ IT quyết `OUT_OF_PROCESS` ⟹ ca 1 mở. IT sau đó khớp danh tính ở SBF-04a; kỳ import kế tiếp sinh `usage_no_assignment_findings` cho người đó ⟹ mục B nguồn `NO_ASSIGNMENT` (source_ref khác) ⟹ IT quyết `OUT_OF_PROCESS` ⟹ **ca 2 mở** cùng (Figma, x@congty.vn). Finance đóng cả hai `RECORD_SPENT` ⟹ hai khoản thực chi cho cùng một tài khoản. Tương tự với hai `source_id` khác nhau của cùng ứng dụng.
- Căn cứ: QĐ-98h; US-13-03 AC-11 ("không tạo hồ sơ mới … bằng chứng mới được gắn vào hồ sơ đang mở"); SBF-07a §4 bước 1 *Open Record for This Account?* và §5.1 *Attach Evidence and Source to Open Record*.
- Cách sửa: thêm `identity_key text NOT NULL` vào `out_of_process_cases` (định danh đã chuẩn hóa — `normalized_identifier` của identity, hoặc `employee:<id>` khi chỉ biết người, hoặc khóa công cụ) và partial unique index `(organization_id, vendor_id, identity_key) WHERE state = 'OPEN'` (vendor null ⟹ dùng `application_id` hoặc `COALESCE`). Ở `decide`: đã có ca mở cùng khóa ⟹ không tạo ca mới, ghi `out_of_process_case_id` của ca đó vào mục (CHECK hiện cho phép), thêm một dòng `out_of_process_case_sources` (case_id, discrepancy_id, seen_at) làm "gắn bằng chứng và nguồn"; unique `discrepancy_id` chuyển sang bảng nguồn. Không gửi thông báo mới.
- Test: integration "hai mục khác nguồn cùng (vendor, identity) ⟹ quyết `OUT_OF_PROCESS` lần hai trả cùng `outOfProcessCaseId`, `out_of_process_cases` đếm 1"; SQL constraints-spec "insert ca OPEN thứ hai cùng khóa ⟹ 23505".

### B3C-03 · Required (High) — Hồ sơ hóa đơn lệch (`INVOICE_DIFFERENCE`) đi được `OUT_OF_PROCESS` ⟹ ca SBF-07a ⟹ `RECORD_SPENT` ghi **thêm** một dòng `invoices`: thực chi bị đếm hai lần

- File: `vendor-account-decision.service.ts:39-48` (không xét `locked.source`); `out-of-process-case.policy.ts:19-27` (không biết nguồn); `out-of-process-case-closure.service.ts:62, 152-160` (ghi `BudgetsApi.recordOutOfProcessSpend`); `vendor-account-intake.service.ts:76-97` (mục `INVOICE_DIFFERENCE` có `vendorId` ⟹ qua được `NO_VENDOR`).
- Kịch bản: hóa đơn Slack 12 × 220.000 đ thay vì 10 (2.640.000 đ đã là thực chi khi Finance ký — PI-1.6, `invoice.repo.ts:186-191` cộng `COALESCE(i.cost_center_id, c.cost_center_id)`). Finance đóng hồ sơ SBF-11a `OUT_OF_PROCESS_SUSPECTED`, chênh 440.000 đ ⟹ mục SBF-08 `INVOICE_DIFFERENCE` ⟹ IT quyết `OUT_OF_PROCESS` ⟹ Finance đóng ca `RECORD_SPENT` 440.000 đ + 1 chứng từ ⟹ dòng `invoices` `OOP-<caseId>` mới ⟹ thực chi Cost Center tăng 440.000 đ lần thứ hai.
- Căn cứ: D-79(4) chính Sonnet ghi "chênh ghi trên hồ sơ, KHÔNG ghi thêm thực chi (số VND thực bị trừ đã nằm trong thực chi của hóa đơn)"; QĐ-34b; US-13-03 AC-8 và AC-11 (hóa đơn lệch "**không** mở hay gắn vào hồ sơ ngoài quy trình"); SBF-07a §"Không vẽ" (`SBF-11a` không gọi luồng này); SBF-08 §3 + SBF-11a §5.2 (ca chuyển sang là **lời nhắc đối soát danh sách tài khoản của nhà cung cấp đó**, ca ngoài quy trình chỉ sinh từ tài khoản tìm thấy, "dòng hóa đơn vẫn ghi riêng").
- Cách sửa: trong `decide`, `locked.source === 'INVOICE_DIFFERENCE'` và `decision === 'OUT_OF_PROCESS'` ⟹ `VendorAccountReviewRefusedError('DECISION_NOT_ALLOWED')` → 422 `VENDOR_ACCOUNT_DISCREPANCY.DECISION_NOT_ALLOWED` (thêm vào mô tả 422 + manifest mã lỗi). Mục `INVOICE_DIFFERENCE` chỉ đóng bằng `FALSE_ALARM` hoặc `RECONCILED` (đã đối soát danh sách, ghi chú); ca ngoài quy trình sinh từ mục `NO_ASSIGNMENT`/`UNMATCHED_IDENTITY` tìm được khi đối soát. Phòng thủ thêm: copy `source` sang ca và CHECK `source <> 'INVOICE_DIFFERENCE' OR outcome <> 'RECORD_SPENT'`.
- Test: mở rộng ca "makes exactly one for an invoice Finance closes as a suspicion" — sau đó `POST decision OUT_OF_PROCESS` ⟹ 422 và `out_of_process_cases` không đổi; `spentOf` của Cost Center không đổi.

### B3C-04 · Required (Medium) — Thấy lại sau khi đã quyết bị nuốt im lặng: không mở lại (QĐ-106j, US-13-05 AC-26, US-13-03 luồng phụ *báo nhầm xuất hiện lại → mở lại*, *thu hồi mà xuất hiện lại → mở lại kèm cờ*)

- File: `src/modules/usage/vendor-account-review/vendor-account-review.repo.ts:47-53` (`ON CONFLICT (organization_id, source, source_ref) DO UPDATE … WHERE state = 'OPEN'`); unique toàn phần `vendor_account_discrepancies_source_key` (004550:47).
- Kịch bản: IT quyết `FALSE_ALARM` cho `COLLECTOR_UNLISTED` `CODEX` (source_ref = `CODEX`, một dòng mỗi tổ chức). Collector báo CODEX mỗi ngày trong 24 tháng tới ⟹ không có gì trên màn; mục chỉ bị sweeper xóa 24 tháng sau `evidence_on` cũ rồi mới có thể sinh lại. Tương tự quyết `OUT_OF_PROCESS` → ca đóng `RECORD_SPENT` → khoản chi mới của cùng tài khoản không mở lại hồ sơ.
- Căn cứ: QĐ-106j ("khoản chi mới của cùng (nhà cung cấp, tài khoản) mở lại hồ sơ"); US-13-05 AC-26; US-13-03 Alternative flows; SBF-07a bước 3 (*Create, Update or Reopen*).
- Cách sửa: unique chỉ cho mục mở — `CREATE UNIQUE INDEX … (organization_id, source, source_ref) WHERE state = 'OPEN'` (migration mới, drop index cũ); `ON CONFLICT (organization_id, source, source_ref) WHERE state = 'OPEN' DO UPDATE`; trước khi insert, bỏ qua dòng mà mục `DECIDED` mới nhất cùng khóa có `evidence_on >= EXCLUDED.evidence_on` (không có bằng chứng mới thì không mở lại — tránh mở lại mỗi lần import vì finding vẫn `OPEN`). Thêm cột `reopened_from_id uuid` (cờ *tái xuất hiện*). Phụ thuộc B3C-05 (evidence_on phải đúng mới so được).
- Test: integration "quyết FALSE_ALARM, rồi `fromUnlistedTools` ngày muộn hơn ⟹ một mục OPEN mới, `reopenedFromId` = mục cũ; cùng ngày ⟹ không mục mới".

### B3C-05 · Required (Medium) — Ngày bằng chứng của `UNMATCHED_IDENTITY` bị dời cho cả định danh **không có** trong báo cáo vừa xác nhận

- File: `vendor-account-intake.service.ts:35, 54-62` (`openUnmatchedOf(tx, event.applicationId)` lấy mọi định danh `OPEN` của ứng dụng — mọi nguồn, mọi lần import — rồi gán `evidenceOn: event.coverageTo`); `vendor-account-review.repo.ts:203-205`; cột `last_import_id` có sẵn trong `usage_unmatched_identities` (`prisma/models/usage.prisma` `UsageUnmatchedIdentity.lastImportId`).
- Kịch bản: `old@gmail.com` thấy ở báo cáo tháng 1/2025 (nguồn A) rồi biến mất. Mỗi báo cáo sau của ứng dụng (kể cả nguồn B) dời `evidence_on` của nó lên `coverageTo` mới ⟹ bằng chứng giả "thấy ngày 31/10/2026", và sweeper 24 tháng (US-14-04 AC-2) **không bao giờ** xóa khi ứng dụng còn được import. Test hiện tại qua vì lý do sai: `confirmed()` dùng `importId: randomUUID()` khác `last_import_id` của mọi định danh, tức là đang chạy đúng đường lỗi mà không kiểm ngày (`test/integration/usage/vendor-account-review.integration-spec.ts:98-107,179-214`, hai lần `confirmed()` cùng `coverageTo`).
- Căn cứ: D-81(1) "thấy lại chỉ dời `evidence_on`" (không thấy thì không dời); US-14-04 AC-2; US-13-03 AC-2/AC-11 (*lần thấy gần nhất* là lần thấy thật).
- Cách sửa: `openUnmatchedOf(tx, applicationId, importId)` thêm `lastImportId: importId` (và `sourceId: event.sourceId`); findings cũng lọc `lastImportId: event.importId` (đã có cột) để `last_seen_at` không dời giả.
- Test: integration "định danh có `last_import_id` ≠ `importId` của sự kiện, `coverageTo` muộn hơn ⟹ `evidenceOn` và `lastSeenAt` không đổi; định danh của đúng import ⟹ dời".

### B3C-06 · Required (Medium) — IT Admin tự ghi phần đã chi (`RECORD_SPENT`) và chọn Cost Center; tài liệu mới nhất giao bước này cho Finance

- File: `src/modules/usage/vendor-account-review-queue/out-of-process-cases.controller.ts:64` (`@RequireRoles('FINANCE', 'IT_ADMIN')` cho mọi kết cục); `out-of-process-case-closure.service.ts:62-64` (không xét vai theo kết cục). Test còn khẳng định hành vi này ("by the IT Admin as well", spec dòng 458).
- Kịch bản: cùng một IT Admin quyết `OUT_OF_PROCESS` rồi tự đóng `RECORD_SPENT` 5.000.000 đ vào Cost Center bất kỳ (kể cả phòng khác) — Finance không chạm vào.
- Căn cứ: SBF-07a v4.1 (13/11) §2 làn Finance "Ghi phần đã chi vào Cost Center…; quyết phòng chịu khi không thống nhất với IT", làn IT Admin chỉ "đóng báo nhầm hoặc đóng hồ sơ ở mức báo cáo; thu hồi", ô `a_attr` thuộc Finance; US-13-05 AC-19 ("When Finance `F1` ghi phần đã chi"), AC-18 + QĐ-96j(4) + QĐ-100ae (Finance quyết phòng). (QĐ-96e viết "Finance/IT ghi …" — câu này mơ hồ; SBF-07a/US-13-05 là bản chi tiết mới hơn.)
- Cách sửa: trong `close`, `input.outcome === 'RECORD_SPENT' && !actor.roles.includes('FINANCE')` ⟹ `VendorAccountReviewRefusedError('FINANCE_ONLY')` → 403 `OUT_OF_PROCESS_CASE.FINANCE_ONLY` (mô tả 403 của route nêu rõ). `FALSE_ALARM`, `REPORT_ONLY` giữ cả hai vai. Nếu Owner muốn giữ IT ghi tiền ⟹ ghi OQ và sửa SBF-07a.
- Test: integration "IT Admin `RECORD_SPENT` ⟹ 403, không dòng `invoices`; Finance ⟹ 201".

### B3C-07 · Required (Low-Medium) — Cost Center của `RECORD_SPENT` không kiểm còn hiệu lực, không khóa `FOR SHARE`

- File: `out-of-process-case-closure.service.ts:143-145` (`costCentersByIds` chỉ kiểm tồn tại; `CostCenterBrief.status` có sẵn nhưng không đọc); `OrganizationReadApi.lockCostCentersShared` có sẵn mà không dùng.
- Kịch bản: Finance đã ngừng `CC-OLD` (QĐ-87d(2)) sau gộp phòng; ca ngoài quy trình vẫn ghi được thực chi vào `CC-OLD`; hoặc Cost Center chuyển `INACTIVE` giữa lúc kiểm và commit.
- Căn cứ: QĐ-90f / US-13-05 AC-19 ("Cost Center **hiện hành** của phòng dùng"; phòng chưa có CC hiện hành ⟹ *Chưa phân bổ*).
- Cách sửa: dùng `lockCostCentersShared(tx, [id])`; `status !== 'ACTIVE'` ⟹ `COST_CENTER_NOT_FOUND` (hoặc mã mới `COST_CENTER_INACTIVE`).
- Test: integration "Cost Center INACTIVE ⟹ 422, không dòng `invoices`".

---

## Optional

### B3C-08 · Optional (Medium) — Thứ tự khóa của `upsertMany` không cố định ⟹ deadlock giữa hai lô AI; một dòng nóng cho mọi thiết bị
- `vendor-account-review.repo.ts:37-53` chèn theo thứ tự đầu vào; `vendor-account-intake.service.ts:105-123` giữ thứ tự xuất hiện trong lô. Lô 1 ngày có `[CODEX, CLAUDE_CODE]`, lô 2 `[CLAUDE_CODE, CODEX]` chạy song song ⟹ hai `ON CONFLICT DO UPDATE` khóa hai dòng theo thứ tự ngược ⟹ `40P01`, một lô thiết bị bị hủy. Ngoài ra mọi lô của mọi máy cùng cập nhật một dòng/tổ chức/công cụ trong transaction của lô ⟹ tuần tự hóa intake collector.
- A: sắp `rows` theo `(source, source_ref)` trong `upsertMany`, và thêm `AND EXCLUDED.evidence_on > vendor_account_discrepancies.evidence_on` vào `WHERE` của `DO UPDATE` (không đổi gì thì không khóa lâu, không dời `last_seen_at` mỗi lô). B: tách ghi COLLECTOR_UNLISTED sang outbox/job.

### B3C-09 · Optional (Medium) — Sweeper xóa cả mục **đang mở chưa quyết**; mục `NO_ASSIGNMENT` bị tạo lại rồi xóa lặp
- `vendor-account-review.repo.ts:211-216`. SBF-08 §2/US-07-07 AC-12/SoD-6: "không tự đóng theo thời gian"; US-14-04 AC-2 chỉ đòi xóa **bằng chứng**. Finding vẫn `OPEN` ⟹ import sau tạo lại mục với `evidence_on = lastActivityDate` cũ (< cutoff) và `first_seen_at` mới ⟹ giờ sau xóa ⟹ vòng lặp; IT thấy mục "mới" nhảy ra rồi biến mất.
- A: mục OPEN quá hạn chỉ xóa nội dung bằng chứng (`identity`, hai value → chuỗi cố định "Evidence expired"), giữ dòng tới khi quyết; intake bỏ qua dòng có `evidence_on < evidenceCutoff(today)`. B: giữ nguyên và ghi rõ trong OWNER-REVIEW.

### B3C-10 · Optional — `UNMATCHED_IDENTITY` nhân đôi hàng đợi SBF-04a, không đồng bộ khi định danh được khớp/bỏ qua
- SBF-08 §4 bước 3 + §5.1: định danh chưa khớp ⟹ hàng đợi `SBF-04a` → kết thúc (bước 4 lại nói "tài khoản không gắn đúng một nhân viên" là khoảng trống — tài liệu tự mâu thuẫn). Hiện `usage_unmatched_identities` được giải ở SBF-04a nhưng mục SBF-08 vẫn `OPEN`.
- A: khi định danh `RESOLVED`/`DISMISSED`, đóng mục SBF-08 cùng `source_ref` (listener trong usage, cùng transaction). B: bỏ nguồn `UNMATCHED_IDENTITY`, chỉ mở mục từ finding sau khi khớp. Hỏi Owner.

### B3C-11 · Optional — IT Admin đọc mọi mục SBF-08, kể cả `employeeId` của phòng mình không phụ trách
- `vendor-account-review.repo.ts:95-99` (không phạm vi), `vendor-account-review-query.service.ts:28-48`. QĐ-111ax: IT Admin đọc usage "chặn cứng theo phòng phụ trách". Lỗ hổng tương tự đã có ở `GET /usage-no-assignment-findings`.
- A: lọc mục có `employee_id` theo `getItAdminScope` (mục không người — unmatched, invoice, collector — vẫn hiện cho mọi IT Admin). B: giữ toàn tổ chức vì đối soát nhà cung cấp là cấp tổ chức; ghi OQ.

### B3C-12 · Optional — Tiền của ca ghi vào tháng ghi nhận, không phải tháng chi (D-81(5), RC-2-O6)
- `out-of-process-case-closure.service.ts:158`. Chi tháng 12/2026, Finance ghi 05/01/2027 ⟹ thực chi rơi vào năm ngân sách 2027. US-13-05 AC-19 ví dụ "750.000 đ theo hóa đơn nhà cung cấp tháng 09"; QĐ-90f "Cost Center hiện hành … tại ngày giao dịch".
- A: thêm `spentOn` (≤ hôm nay) vào body + cột `spent_on`, `serviceMonth` theo `spentOn`. B: giữ, ghi rõ trên route.

### B3C-13 · Optional — Ca từ collector/hóa đơn không bao giờ ghi được tiền (`NO_VENDOR`)
- `vendor-account-intake.service.ts:113-122` để `applicationId`/`vendorId` null dù allowlist ánh xạ công cụ → ứng dụng (`allowlist.dto.ts` `aiToolMapping {tool, applicationId}`). A: khi có ánh xạ, điền `applicationId` + `vendorId` từ `CatalogApi`. B: giữ (`REPORT_ONLY`).

### B3C-14 · Optional — SBF-11a thiếu kết cục *lỗi tính tiền của nhà cung cấp* (QĐ-34a, SBF-11a §5.1 "Close as Vendor Billing Error with Note")
- `InvoiceDiscrepancyOutcome` (004510:9) chỉ `EXPLAINED | OUT_OF_PROCESS_SUSPECTED`. A: thêm `VENDOR_BILLING_ERROR` (enum ở migration riêng trước, chênh ≥ 0, không chuyển SBF-08). B: giữ, Finance ghi trong `reason`.

## Nit

- **B3C-N1** — `document.service.ts` (`attachOutOfProcessCaseDocuments`) dùng `const now = new Date()` riêng ⟹ `attached_at` lệch `closed_at` của ca; truyền `now` của lần đóng.
- **B3C-N2** — Hai nguồn sự thật cho chứng từ: `out_of_process_cases.document_ids uuid[]` và `document_attachments.out_of_process_case_id`; giữ một (cột catalog) và đọc qua `CatalogApi`.
- **B3C-N3** — Quyết `OUT_OF_PROCESS` làm mục `DECIDED` ngay lúc ca mới mở; SBF-08 bước 8 đóng mục "kèm liên kết hồ sơ ngoài quy trình **đã đóng**". FE cần ghép trạng thái ca; có thể trả `caseState` trong wire.
- **B3C-N4** — Khoản `UNALLOCATED` (`cost_center_id` null, `out_of_process_case_id` có) chưa có nơi nào đọc thành dòng *Chưa phân bổ Cost Center* (US-13-05 AC-19 tách khỏi *Chưa phân bổ — kho dùng chung*); ghi O-item cho báo cáo.

---

## Phần đúng đã kiểm

1. **Migration 004510–004560**: enum ở migration riêng đứng trước (004510, 004540, `DO … EXCEPTION WHEN duplicate_object`); bảng `CREATE TABLE IF NOT EXISTS`, index `IF NOT EXISTS`, `DROP CONSTRAINT/TRIGGER IF EXISTS` trước khi tạo lại ⟹ chạy lại an toàn. Trigger cho `TRUNCATE` xét `TG_OP` trước khi đọc `OLD` (đúng). `vendor_account_discrepancies_guard` chỉ `BEFORE UPDATE` nên sweeper `DELETE` được, còn upsert có `WHERE state='OPEN'` nên không bắn trigger trên dòng đã quyết.
2. **Hai CHECK `document_attachments` viết lại (004560:65-77)** là siêu tập đúng của bản PI-1 (004500:165-173): dòng cũ có `out_of_process_case_id` NULL nên giá trị CHECK không đổi; đường hợp đồng, `SIGNATURE_RECORD` (devices), `PURCHASE_DOCUMENT` của hóa đơn mua giữ nguyên; `IMPORT_SOURCE`/`TAX_PAYMENT_PROOF`/`COST_STATEMENT` không đổi điều kiện. Tệp BM-10 của lane B nằm ở bảng `budget_attachments` riêng, avatar ở cột hồ sơ (`20261113100100_pf1_profile_columns`) — không chạm CHECK này; không migration lane B nào sau 004560 viết lại hai CHECK (đã soát `be-verify` @ `134a713d`).
3. **RC-1**: hồ sơ mở trong transaction ký chỉ khi `PRICE_QUANTITY_EXCEPTION` (lệch VND không mở); unique `purchase_invoice_id`; đóng = `FOR UPDATE` + `updateMany … WHERE state='OPEN'`; `OUT_OF_PROCESS_SUSPECTED` cần chênh > 0 (CHECK + policy, RC-1-Q1); emit `InvoiceDiscrepancyReferralListeners` trong cùng transaction, listener ném lỗi hoàn tác (có test); chỉ `FINANCE` đóng, IT Admin đọc theo phạm vi D-75(3); trigger `purchase_invoices_guard` canh thêm ba cột `expected_*`.
4. **Đúng một mục SBF-08 cho một hồ sơ nghi ngờ**: `source_ref = caseId` + `ON CONFLICT` ⟹ idempotent kể cả emit lặp; test integration dùng listener thật.
5. **Khóa / idempotent**: `decide`, `close` khóa `FOR UPDATE` rồi 409 lần hai; ca unique theo `discrepancy_id`; sweeper `DELETE … FOR UPDATE SKIP LOCKED LIMIT 500` từng transaction, chạy lại/đa instance an toàn, audit chỉ ghi số và mốc; ca và khoản chi giữ lại (US-14-04 AC-3).
6. **Tiền**: VND, `parseMoney` + `MONEY_OUT_OF_RANGE` cho ≤ 0 (D-80); `OOP-<caseId>` chống trùng; khóa năm ngân sách khi có Cost Center; không chặn vì vượt ngân sách (US-13-05 AC-19 "không qua kiểm tra ngân sách"); `spentOf` cộng dòng không cam kết qua `COALESCE` (`invoice.repo.ts:186-191`).
7. **Chứng từ**: chỉ `PURCHASE_DOCUMENT` do chính người đóng tải, đang `PENDING_ATTACH`, khóa theo thứ tự id, gắn trong transaction đóng; mở tệp sau gắn theo `mayOpen` (IT/Finance).
8. **Collector (RC-2.3)**: chỉ ngày đã qua cửa sổ nhận/xác nhận thiết bị (thứ tự verdict `FUTURE_GENERATED_AT` → `OUTSIDE_WINDOW` → `NOT_IN_ALLOWLIST`), khóa công cụ là `z.enum(AI_TOOL_KEYS)` nên không thể bơm chuỗi tùy ý, không lưu người (OQ-03).
9. **Kiến trúc**: `usage` → `requests/public` (extension point), `budgets/public`, `catalog/public`, `finance/public`, `organization/public`; không query bảng module khác; không có cạnh `requests → usage` (module-graph 100 cạnh); tách capability L0/L3 theo gate `capability-graph`; `openapi.json` @ `78a938c2` có **0** chuỗi "QĐ-".

## Mutation đề xuất

Lệnh chạy từ repo BE. "Dự kiến" là đọc code, chưa chạy.

| # | File | Chuỗi cũ (duy nhất) | Chuỗi mới | Lệnh jest | Dự kiến |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/modules/usage/vendor-account-review/vendor-account-review.repo.ts` | `evidence_on = GREATEST(vendor_account_discrepancies.evidence_on, EXCLUDED.evidence_on),` | `evidence_on = EXCLUDED.evidence_on,` | `pnpm test:integration -- test/integration/usage/vendor-account-review.integration-spec.ts` | **Sống** (ca collector chỉ thấy ngày tăng dần) ⟹ thêm ca thấy 10-09 rồi 10-02 ⟹ giữ 10-09 |
| 2 | `src/modules/usage/vendor-account-review/vendor-account-intake.service.ts` | `if (seen === undefined \|\| sighting.date > seen) lastDay.set(sighting.tool, sighting.date);` | `if (seen === undefined) lastDay.set(sighting.tool, sighting.date);` | như #1 + `pnpm test -- src/modules/usage/ai-usage/ai-usage-batch.service.spec.ts` | **Sống** (spec batch mock intake; integration chỉ 1 sighting/lần) |
| 3 | `src/modules/usage/vendor-account-review/vendor-account-review.repo.ts` | `SELECT id FROM vendor_account_discrepancies WHERE evidence_on < ${cutoff}::date` | `SELECT id FROM vendor_account_discrepancies WHERE evidence_on <= ${cutoff}::date` | như #1 | **Sống** (test dùng ±3 ngày) ⟹ thêm ca đúng mốc |
| 4 | `src/modules/usage/vendor-account-review/vendor-account-decision.service.ts` | `input.decision === 'OUT_OF_PROCESS'` | `input.decision !== 'FALSE_ALARM'` | như #1 | **Sống** (không ca REVOKE/LEGALIZE trên mục mở; CHECK DB sẽ ra 500) |
| 5 | `src/modules/usage/vendor-account-review/vendor-account-review.repo.ts` | `        WHERE vendor_account_discrepancies.state = 'OPEN'` | *(xóa dòng)* | như #1 | Chết **nhờ phụ thuộc thứ tự test** (mục đã quyết ở ca trước bị `confirmed()` sau upsert lại ⟹ trigger) ⟹ cần ca tường minh |
| 6 | `src/modules/usage/vendor-account-review/vendor-account-intake.service.ts` | `        evidenceOn: event.coverageTo,` | `        evidenceOn: '1970-01-01',` | như #1 | **Sống** (không assert `evidenceOn` của `UNMATCHED_IDENTITY`) — cùng gốc B3C-05 |
| 7 | `src/modules/requests/invoice-discrepancy/invoice-discrepancy-closure.service.ts` | `if (isReferred(input.outcome)) await this.referrals.emit(tx, referralOf(row, closing));` | `await this.referrals.emit(tx, referralOf(row, closing));` | `pnpm test:integration -- test/integration/requests/invoice-discrepancy.integration-spec.ts test/integration/usage/vendor-account-review.integration-spec.ts` | Chết (ca "tells it nothing for an explanation") — mutation đối chứng |
| 8 | `src/modules/usage/vendor-account-review/out-of-process-case.policy.ts` | `  if (!input.hasVendor) return 'NO_VENDOR';` | *(xóa dòng)* | `pnpm test -- src/modules/usage/vendor-account-review/out-of-process-case.policy.spec.ts` rồi như #1 | Chết (ca NO_VENDOR) — mutation đối chứng |

Ca test còn thiếu (ngoài các ca đã nêu trong từng finding): hai quyết định đồng thời cùng mục (một 201, một 409); hai lần đóng ca đồng thời; constraints-spec SQL cho `vendor_account_discrepancies_state_check`, `out_of_process_cases_state_check` và hai CHECK `document_attachments` mới (tệp có cả `purchase_invoice_id` và `out_of_process_case_id` ⟹ 23514; `out_of_process_case_id` với `CONTRACT_ATTACHMENT` ⟹ 23514) — RC-2-O7 đã tự nhận; chạy lại migration 004540–004560 lần hai không lỗi.
