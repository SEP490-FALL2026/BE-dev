# OVERNIGHT-DECISIONS-LANE-B — chạy đêm lane B (15/11/2026)

> Nhánh `feat/fe-feedback-lane-b`. Owner không trả lời lúc chạy; mọi điểm dưới đây là **tạm chốt**, audit hỏi lại từng `D-Bn`. Mỗi mục: câu
> hỏi · phương án · đã chọn + căn cứ · file/commit · cách đổi lại. Thứ tự căn cứ: QĐ → BRD → OWNER-REVIEW → SPEC/PLAN → code → thông lệ.

## Chờ Owner quyết

| Mã        | Câu hỏi | A   | B   | Khuyến nghị |
| --------- | ------- | --- | --- | ----------- |
| (chưa có) |         |     |     |             |

## Quyết định tự chốt (D-Bn)

### D-B1 — thêm `GET /policies/{code}/draft` cho Super Admin

- **Câu hỏi:** SPEC PL-1 có `PUT`/`DELETE` nháp nhưng không có route đọc nháp; Super Admin cần đọc nháp đang soạn.
- **Phương án:** (A) thêm `GET /policies/{code}/draft` (SUPER_ADMIN); (B) chỉ trả nháp trong `PUT`; (C) thêm trường `draft` vào `GET /policies/{code}`.
- **Chọn A:** thêm một route chỉ đọc, không đổi route nào của SPEC; `GET /policies/{code}` không lộ nháp cho người đọc thường.
- **File/commit:** `policies/library/` (task PL-1.3). **Đổi lại:** xóa route, FE dùng kết quả `PUT`.

### D-B2 — "người có vai áp dụng" tính theo vai được cấp (`directRoles`), không theo vai đang hiệu lực

- **Câu hỏi:** MANAGER chưa là trưởng phòng của phòng nào có vai (cấp) nhưng không hiệu lực; có phải xác nhận chính sách không?
- **Phương án:** (A) vai được cấp và còn hiệu lực (`directRoles`, giống `roles` của `GET /me`); (B) vai hiệu lực (`roles` của principal).
- **Chọn A:** khớp `GET /me` (FE chặn theo danh sách này) và khớp người nhận thông báo xuất bản (tài khoản giữ grant). **Đổi lại:** đổi nguồn vai ở `acknowledgement.service.ts`.

### D-B3 — chủ sở hữu mục sổ collection của PL-1 là work item `us-01-bootstrap-login-session`

- **Câu hỏi:** gate `api-collection-contract` đòi mỗi mảng lồng mới có `owner`/`item` là một thư mục có sẵn dưới `docs/workspace/items`; không có thư mục cho thư viện chính sách.
- **Phương án:** (A) dùng work item EP-01 gần nhất có sẵn; (B) tạo thư mục work item mới (kèm README, dòng trong chỉ mục, rules:check).
- **Chọn A** (US-01-13/14 thuộc EP-01; không tạo tài liệu chỉ để qua gate). **File:** `test/support/api-collection-registry-nested-pl1.ts`, `…-events-pl1.ts`. **Đổi lại:** đổi `OWNER`/`item` khi có work item riêng.

### D-B4 — báo cáo xác nhận đã đọc không lọc theo trạng thái

- **Câu hỏi:** `GET /policies/{code}/acknowledgements` ("báo cáo đã/chưa, phân trang") có cần lọc `state=PENDING|DONE`?
- **Phương án:** (A) không lọc, trả trang theo mã nhân viên với `state` từng dòng; (B) lọc bằng SQL join `app_users`/`role_grants` (bảng của module khác) hoặc đọc cả tập rồi cắt trang trong bộ nhớ (cả hai vi phạm luật).
- **Chọn A** (đúng chữ SPEC, không lách luật module/phân trang); FE lọc trang đang xem. **Đổi lại:** thêm điều kiện `state` vào `IdentityAccessApi.pageUsableRoleHolders` cùng một câu join `policy_acknowledgements` qua facade.

### D-B5 — căn cứ ban hành bản 1 và nơi nạp 8 chính sách (SỬA theo FIX-LB1 LB1-01, LB1-02)

- **Câu hỏi:** nạp 8 chính sách ở đâu và căn cứ bản 1 ghi gì khi tổ chức mới cài và khi tổ chức đã cài từ trước.
- **Phương án:** (A) lệnh cài đặt nạp cho tổ chức mới; (B) thêm migration bù cho mọi tổ chức đã có (tiền lệ CT-1.1); (C) chỉ seed demo nạp.
- **Chọn A + B** (bản đầu chọn A và loại B vì "không có tổ chức lúc migrate" — sai với môi trường đã cài; reviewer chỉ ra, đã sửa). Cài đặt mới: `PoliciesBootstrapApi.seedInitialPolicies` qua `InstallationInitialDataService`. Môi trường có sẵn: migration `20261113100300_fixlb1_policies_backfill` (SQL sinh từ `INITIAL_POLICIES`, mỗi câu bỏ qua cái đã có nên chạy lại không nhân đôi và không đụng bản Super Admin đã xuất bản; test DB thật đọc lại và so với code). Căn cứ bản 1 = đúng văn bản chính thức: _"Bộ mẫu SaaS-Sentry 1.0 — công ty xuất bản phiên bản 2 kèm quyết định của mình"_ (không còn "v1.9").
- **File:** `policies/initial/*`, `installation/installation-initial-data.service.ts`, `prisma/migrations/20261113100300_*`. **Đổi lại:** sửa `INITIAL_CHANGE_NOTE` trước khi cài; migration đã chạy thì bản 1 bất biến — sửa bằng bản 2.

### D-B6 — chưa bỏ mục đích tệp `COST_STATEMENT` ("sao kê") khỏi enum nhận mới

- **Câu hỏi:** PLAN PL-3.1 bảo bỏ mục đích tệp sao kê khỏi enum nhận mới (US-01-12 AC-10, US-04-04 AC-11). Mục đích đó là `COST_STATEMENT` trong `catalog/contract/contract.dto.ts` + `contract.policy.ts`.
- **Phương án:** (A) bỏ ngay ở lane B; (B) để lại tới lượt hợp nhất vì cùng file lane A (CO-1 sửa hợp đồng/tệp, PI-1 thêm mục đích tệp cho hóa đơn); (C) giữ vĩnh viễn.
- **Chọn B** (tránh xung đột file chung, không mất gì: không có route nào của PL-3 nhận file sao kê, và **không có mẫu sao kê**). **Việc cho chat điều phối:** sau khi lane A xong PI-1, bỏ `COST_STATEMENT` khỏi danh sách nhận mới (`contract.dto.ts:95`, `contract.policy.ts:20,35`, `contract.policy.spec.ts`), giữ giá trị trong DB để đọc tệp cũ.

### D-B7 — các điểm Optional/Nit của review để lại (LB1-07…LB1-20, LB3-07…LB3-16)

Không làm ở FIX-LB1 (rẻ nhưng đổi hợp đồng hoặc chạm file lane A); chờ lượt hợp nhất: LB1-07 khóa ngoại `organization_id` của ba bảng; LB1-09 thông báo xuất bản theo lô (hiện tuần tự trong transaction, quy mô cỡ 100–500 tài khoản); LB1-10 `POLICY_ROLES` suy từ `AppRole`; LB1-12 báo cáo xác nhận chưa có tổng đã/chưa (FE ghi chú); LB1-13 `GET /policy-steps/{stepCode}` để FE khỏi cứng hóa bước ⟹ chính sách; LB1-14 `applicableRoles` của xuất bản tùy chọn; LB1-16 `totalItems` đếm cả chính sách chưa có bản; LB1-17 `versionNumber` trả về khi DONE là bản hiện hành chứ không phải bản đã xác nhận; LB1-18 tên file `initial/pol-*.types.ts`; LB1-19 owner sổ collection (D-B3); LB1-20 migration không `IF NOT EXISTS`; LB3-07 `COST_STATEMENT` (D-B6); LB3-08 quyền tải mẫu do module sở hữu import khai; LB3-09 hai nguồn cùng một `kind`; LB3-10 dòng ví dụ có thể bị nhập thật; LB3-11 cách mở CSV trên máy Việt Nam; LB3-12 spec nhân sự ghim cột bằng literal; LB3-13 BOM viết bằng ký tự vô hình; LB3-14 nhánh `??` chết ở mẫu usage; LB3-15 tên `*-template.policy.ts` chứa hằng dữ liệu; LB3-16 tên file `mau-usage-csv.xlsx`. Chi tiết ở AUDIT-LB-PL1.md và AUDIT-LB-PL3.md.

### D-B8 — kỳ ngân sách: "hết hạn nộp" = ngày sau hạn nộp; luật sửa theo trạng thái; cửa sổ tạo phòng (BG-1)

- **Câu hỏi:** (1) `QĐ-111z` nói "hết hạn nộp là khóa": ngày đúng bằng hạn còn trong hạn không; (2) lý do bắt buộc ở kỳ đang mở áp cho thay đổi nào; (3) cửa sổ tạo phòng khi kỳ năm sau còn nháp.
- **Chọn:** (1) khóa từ **ngày sau** hạn nộp (cùng quy ước đã có của nhắc hạn: "ngày bằng hạn còn trong hạn"); (2) kỳ đang mở: dời hạn nộp (về hôm nay hoặc sau, không về quá khứ), đổi Trần năm, đổi Dự phòng kho đều **bắt buộc lý do** và lưu trước/sau; hạn quyết và ưu tiên đổi tự do; nháp sửa tự do, không lý do, hạn nộp có thể ở quá khứ nhưng **không mở được** (422 `BUDGET_CYCLE.DEADLINE_PASSED`, sửa trước); (3) nháp ⟹ cửa sổ **đóng** (đúng chữ SPEC "kỳ năm sau đã mở"); mở và chưa có phiên bản nào có `sent_at` ⟹ mở; không có kỳ nào ⟹ như cài đặt.
- **Mã mới:** `BUDGET_CYCLE.LOCKED`, `.NOT_DRAFT`, `.ALREADY_OPEN` (409), `.DEADLINE_PASSED` (422), `.NOT_OPEN` (409, thay `BUDGET.CYCLE_NOT_PUBLISHED`); các mã cũ `BUDGET.CYCLE_*` còn lại giữ nguyên. Danh sách kỳ trả bản tóm tắt không có `priorities` (cổng collection-contract không cho phần tử danh sách trùng hình dạng chi tiết).
- **Đổi lại:** nếu Owner muốn "đúng ngày hạn là khóa" hoặc nháp cũng cho tạo phòng thì đổi `cycleStateOf` / `windowOf` (một dòng mỗi nơi, có test).

### D-B9 — phiên bản ngân sách: một số cho cả năm, tên trường giữ nguyên, mã 409 đổi theo SPEC (BG-2)

- **Chọn:** giữ tên trường đang có trên dây (`base`, `reserve`, `reserveReason`) cho `baseAmount`/`reserveAmount` của SPEC, để FE hiện tại không phải đổi tên; chỉ bỏ `quarters`. Mã vượt Trần: `BUDGET_VERSION.OVER_CEILING`, `details.overBy` và `details.availableMinor` là số nhỏ nhất dạng chữ (cùng kiểu mọi `details` tiền khác). Cột `q1..q4_minor` và dòng `BM-10` cũ **không ghi nữa nhưng không xóa** (expand–contract).
- **Việc BG-2 còn lại, chưa làm ở lượt này:** BG-2.1 `CarriedOverContributions` (budgets mở điểm mở rộng, `requests` gắn bằng hàm 01/01 của XY-1 — lane A đang sửa chính hàm đó nên chờ), BG-2.2 `BM-10` = tệp + `requestedAmount` + `note` + khóa sau hạn, BG-2.3 xóa route dòng/import, BG-2.5 phần còn lại (`reservePercent`, ≥ 1 tệp khi gửi, mặc định cơ sở = số chạy sang), BG-2.6 số liệu nền (`carriedOverNextYear`, `noProposalSubmitted`, `BASELINE_NO_PROPOSAL`, bỏ chặn `HAS_HEAD`), BG-2.7 quyết định chỉ `APPROVE`|`RETURN`.

### D-B10 — phiên bản từ số liệu nền `BASELINE_NO_PROPOSAL` cần nới CHECK nguồn (nguyên nhân 500 của BG-2.1/2.6)

- **Câu hỏi:** `POST /budget-versions` nguồn `BASELINE` trả 500 sau khi đổi `origin` sang `BASELINE_NO_PROPOSAL`.
- **Nguyên nhân:** CHECK `budget_versions_source_check` (migration `20261108550000`) đòi `proposal_id IS NULL` ⟺ `origin = 'BASELINE_NO_HEAD'`; dòng mới có `proposal_id NULL` và origin mới ⟹ 23514 ⟹ 500.
- **Chọn:** migration `20261113100600_bg2_baseline_no_proposal_source` thay CHECK bằng bản chỉ **nới** (`origin IN ('BASELINE_NO_HEAD','BASELINE_NO_PROPOSAL')`), mọi dòng cũ vẫn thỏa; không drop cột/bảng. `ADJUSTMENT` **chưa** thêm vào nhánh "không có proposal" — AD-1 (lane A) tự nới khi dùng. **Đổi lại:** migration mới thay CHECK.

### D-B11 — xóa route dòng (BG-2.3): dashboard trưởng phòng, lịch sử, phiên bản từ đề nghị

- **Chọn:** (1) mục `approvedBudgetLines` của `GET /dashboards/manager` trỏ sang `budgetMine` (giữ tên khóa để FE không vỡ; mô tả đổi) — đổi tên khóa để Z2/FE quyết; (2) lịch sử phiên bản vẫn **đọc** được mục `LINE_UPDATED`/`LINES_ADDED`/`LINES_IMPORTED` cũ, chỉ bỏ phần ghi (`lineEdited`, `linesAdded`, `lineChange`, `chunkSnapshots` + spec); (3) phiên bản tạo từ đề nghị **không chép dòng** nữa (route đọc dòng đã xóa nên dòng chép sang là dữ liệu chết); bảng `budget_version_lines`, `budget_proposal_lines` giữ, thôi ghi.
- **Đổi lại:** khôi phục từ commit BG-2.3 nếu Owner muốn giữ route đọc dòng cũ.

### D-B12 — `BM-10` (BG-2.2): `requestedAmount` ở `total_minor`, `costCenterId` vẫn tùy chọn, rút đề nghị cũng khóa sau hạn

- **Chọn:** (1) `requestedAmount` lưu vào cột có sẵn `total_minor` (không thêm cột); response có cả `total` (giữ cho FE hiện tại) và `requestedAmount` + `note`; (2) `costCenterId` giữ **tùy chọn** như trước (chỉ bắt buộc khi người gửi phụ trách hơn một Cost Center trong năm — 422 `BUDGET.COST_CENTER_REQUIRED`), vì bắt buộc luôn là đổi hợp đồng không cần thiết; (3) `note` 1–1000 ký tự không toàn khoảng trắng (CHECK `budget_proposals_note_check`, migration `20261113100700`); (4) gửi, gửi lại **và rút** (đúng dòng SPEC) sau hạn nộp ⟹ 409 `BUDGET_CYCLE.LOCKED`; Finance trả về chỉ trước hạn (sau hạn 409 `BUDGET_CYCLE.LOCKED`, kỳ chưa mở 409 `BUDGET_CYCLE.NOT_OPEN`); luật thuần `proposalWorkRefusal` ở `cycle.policy.ts`; (5) số tiền 0 được nhận (không có luật nào cấm), âm ⟹ 422 như mọi số tiền.
- **Xóa code chết:** `ProposalLineJudge`, `proposal-line-rules.policy` (ZBB, xếp hạng, cờ vượt Trần phòng) + spec, `BudgetProposalLinesInvalidError`, `BudgetPlanNotFoundError`, `requirePlans`/`planNames`, `patchChangesLine`, `versionLineOverCeiling`, đọc dòng của repo đề nghị.
- **Đổi lại:** nếu Owner muốn `costCenterId` bắt buộc ⟹ bỏ `.optional()` ở `budget.dto.ts`.

### D-B13 — test: tệp của ngân sách ghi bằng SQL khi suite không nói về tệp

- **Chọn:** `test/support/budget-files.ts` ghi dòng `budget_attachments` hợp lệ (đề nghị: `UPLOADED`; phiên bản: `ATTACHED`) đúng như route để lại; `submitProposal`/`resubmit`/`sendVersion` của harness và `approvedBudget` tự thêm một tệp khi body không nêu; test luật "≥ 1 tệp" gọi route thô. Không đụng object storage.

### D-B14 — số liệu phiên bản (BG-2.5/2.6): dự phòng theo tỷ lệ hay số tiền, cờ đỏ so cơ sở, gửi cần tệp

- **Chọn:** (1) `reservePercent` (0–100, số nguyên) **hoặc** `reserve` (loại trừ nhau ⟹ 422); tỷ lệ Finance chọn được lưu vào `reserve_percent` (trả lại đúng như đã gửi) và dùng để tính `reserve`; dự phòng khác mặc định của tổ chức, dù chọn bằng tỷ lệ hay số tiền, cần `reserveReason` khi gửi (SỬA theo FIX-LB3 LBG-02 ⟹ D-B17; bản đầu cho tỷ lệ đã chọn khỏi lý do vì so với chính tỷ lệ đã lưu, trái QĐ-100h/100k, FR-5.15(2)); (2) `base` bỏ trống ⟹ điền `carriedOverNextYear` (cả nguồn `PROPOSAL` lẫn `BASELINE`; nguồn chạy sang chưa bind ⟹ 0); `PUT` không tự đổi cơ sở theo số chạy sang; (3) `belowCarriedOver` = (**cơ sở + dự phòng**) < số chạy sang, kèm `carriedOverShortfall` (SỬA theo FIX-LB3 LBG-01 ⟹ D-B16; bản đầu so riêng cơ sở, trái QĐ-111ac, `C-09` và QT §4.6); ở số liệu nền cờ lấy theo phiên bản mới nhất (không tách rời) của Cost Center trong năm, không có phiên bản ⟹ `false`; (4) đếm tệp đính kèm khi gửi đọc `budget_attachments` qua `VersionRepo.countAttachedFiles` (capability `attachment` đã phụ thuộc `version`, import ngược tạo vòng — gate capability graph); (5) BG-2.5 và BG-2.6 vào một commit vì cùng DTO và cùng `VersionFigures`.
- **Đổi lại:** (3) đã sửa sang so tổng (cơ sở + dự phòng) ở D-B16; so riêng cơ sở lại ⟹ đổi `belowCarriedOver` ở `budget.policy.ts`.

### D-B15 — quyết định phiên bản chỉ `APPROVE` | `RETURN` (BG-2.7)

- **Chọn:** `RETURN` (lý do bắt buộc) ghi quyết định `CHANGES_REQUESTED` và trạng thái `CHANGES_REQUESTED` có sẵn (Finance sửa và gửi lại); `REJECT`, `REQUEST_CHANGES` ⟹ 422 `VALIDATION_ERROR`. Giá trị enum `REJECTED` (trạng thái và quyết định) **giữ** để đọc bản cũ; luồng "bản bị từ chối ⟹ đề nghị kế tiếp / làm lại từ đề nghị" giữ nguyên cho dữ liệu cũ (không còn đường tạo mới). Mã thông báo `BUDGET_VERSION_DECIDED` mang `decision: CHANGES_REQUESTED` khi trả về.
- **Đổi lại:** thêm lại giá trị vào `decisionBodySchema` và `decisionOutcomeOf`.

### D-B16 — cờ đỏ `belowCarriedOver` so ngân sách phòng (cơ sở + dự phòng) và nói phần thiếu (FIX-LB3 LBG-01, sửa D-B14(3))

- **Câu hỏi:** cờ đỏ so với số nào, và có nói phần thiếu không.
- **Phương án:** (A) giữ so riêng cơ sở (D-B14(3) cũ); (B) so ngân sách phòng = cơ sở + dự phòng, thêm `carriedOverShortfall`; (C) so ngân sách phòng nhưng FE tự tính phần thiếu.
- **Chọn B** theo chữ tài liệu: QĐ-111ac ("ngân sách phòng thấp hơn số chạy sang ⟹ cờ đỏ"), `C-09` ("ngân sách phòng = số cơ sở + dự phòng"), QT §4.6 dòng 780 ("kèm phần thiếu", ví dụ 800 + 80 = 880 so với 900 ⟹ thiếu 20 tr). `carriedOverShortfall` = `max(0, số chạy sang − (cơ sở + dự phòng))` là số tiền (`{ amount, currency }`) trên `GET /budget-versions/{id}` và trên từng phòng của `GET /budget-cycles/{year}/baseline` (0 khi đủ hoặc khi phòng chưa có phiên bản). Cờ vẫn không chặn gì.
- **File/commit:** `budget/budget.policy.ts` (`belowCarriedOver`, `carriedOverShortfall` nhận `{ baseMinor, reserveMinor }` để hai nơi gọi không lệch), `budget/version-view.service.ts`, `cycle/baseline-flags.service.ts`, `cycle/baseline.service.ts`, DTO `budget.dto.ts` + `cycle.dto.ts`. **Đổi lại:** đổi hai hàm ở `budget.policy.ts` về so `baseMinor`.

### D-B17 — dự phòng khác mặc định của tổ chức luôn cần lý do khi gửi (FIX-LB3 LBG-02, sửa D-B14(1))

- **Câu hỏi:** "khác mặc định" so với đâu: tỷ lệ đã lưu trên phiên bản, một ảnh chụp mặc định lúc lập, hay tham số mặc định của tổ chức.
- **Phương án:** (A) so với tỷ lệ đã lưu (cũ, sai: tỷ lệ Finance chọn trở thành "mặc định" của chính phiên bản); (B) so với ảnh chụp mặc định lúc lập (tách cột); (C) so với tham số `BUDGET_RESERVE_DEFAULT_PERCENT` đọc lúc gửi.
- **Chọn C:** đúng chữ QĐ-100h/100k và FR-5.15(2) (lý do khi khác mặc định của tổ chức), không cần cột mới, không bị lệch khi hai nơi đọc cùng một nguồn. `reserveReasonMissing(version, defaultPercent)` nhận mặc định từ `VersionFigures.defaultPercent()` đọc trước transaction của `POST …/submission`; `reservePercent` trên dây vẫn là tỷ lệ phiên bản được lập (mặc định lúc lập hoặc tỷ lệ Finance chọn) và `defaultReserve` là dự phòng theo mặc định hiện hành của tổ chức, để FE thấy đúng số mà luật lý do dùng. Phiên bản cũ có `reservePercent` NULL vẫn không bị hỏi lý do. Hệ quả chấp nhận: đổi tham số mặc định giữa lúc lập nháp và lúc gửi thì nháp cũ khác mặc định mới ⟹ cần lý do.
- **File/commit:** `budget/budget.policy.ts`, `version/version.service.ts`, `version/version-figures.service.ts`, `budget/version-view.service.ts`; test `requests/budget-versions.integration-spec.ts` (sửa ca khẳng định `reserveReason: null` cho tỷ lệ 20 %; thêm ca gửi 20 % không lý do ⟹ 422), `budgets/budget-baseline-version.integration-spec.ts` (ca tỷ lệ 5 % giờ kèm `reserveReason`). **Đổi lại:** chọn (B): thêm cột "tỷ lệ mặc định lúc lập" (migration mới) và so với cột đó.

### D-B18 — bản nháp/bản trả về cũ còn số quý: sửa tổng thì bỏ số quý, và dọn dữ liệu bằng migration (FIX-LB3 LBG-03)

- **Câu hỏi:** `VersionRepo.patch` đổi `total_minor` nhưng giữ `q1..q4_minor` ⟹ vi phạm CHECK `budget_versions_quarters_check` (23514) ⟹ 500 cho bản `DRAFT`/`CHANGES_REQUESTED` lập trước BG-2 còn số quý; bản đó kẹt, không sửa được nữa.
- **Phương án:** (A) `patch` ghi `q1..q4 = NULL` khi tổng đổi; (B) chỉ migration xóa số quý; (C) cả hai; (D) nới CHECK (trái expand–contract ngược chiều: CHECK đang bảo vệ dữ liệu cũ).
- **Chọn C:** QĐ-111ac bỏ quý (một số cho cả năm) nên không ai còn giữ dự báo quý; (A) làm đường ghi mới luôn thỏa CHECK cũ, (B) dọn dữ liệu đang có để bản trả về không còn quý. Migration `20261113100800_fixlb3_version_quarters_cleared` chỉ `UPDATE … SET q1..q4 = NULL WHERE state IN ('DRAFT','CHANGES_REQUESTED')`; KHÔNG đụng bản đã gửi/duyệt/từ chối/hết hạn (không có trigger bất biến nào chặn UPDATE cột quý; trigger `budget_versions_retired_columns` chỉ bảo vệ `reason`, `high_value_*`), không drop cột. `patch` chỉ ghi NULL khi tổng thật sự đổi (tổng không đổi thì CHECK vẫn thỏa).
- **File/commit:** `budget/version.repo.ts` (`patch`), migration trên; test `budgets/budget-version-legacy-quarters` (API: nháp và bản trả về có số quý, sửa cơ sở/dự phòng ⟹ 200 và quý NULL, gửi lại được) và `budgets/budget-version-quarters-migration` (DB thật dựng lịch sử tới migration trước, nạp 6 bản ở 6 trạng thái, chạy migration: nháp + trả về hết quý, đã gửi/duyệt/từ chối/hết hạn giữ nguyên 25/25/25/25). **Đổi lại:** xóa migration (chưa chạy ở đâu) và bỏ nhánh `q*: null` ở `patch` thì quay về lỗi 500.

## Optional và việc để lại

- BG-2: `approvedBudgetLines` của dashboard trưởng phòng nên đổi tên khóa (vd. `approvedBudget`) khi FE đổi; `costCenterId` của `BM-10` vẫn tùy chọn (D-B12); `GET /budget-cycles/{year}/package` chưa trả `note` của đề nghị (FE đọc ở `GET /budget-proposals/{id}`); CHECK nguồn phiên bản chưa có nhánh `ADJUSTMENT` (AD-1 tự thêm); e2e `test/e2e/budget-version`, `mobile-approver-journey` đã sửa theo `BM-10` nhưng chưa chạy.

- Báo cáo xác nhận chưa có tổng `done`/`pending` toàn tập (cần join chéo module); thêm khi FE đòi.
- `GET /policies/{code}` cho phiên bản cũ trả `myAcknowledgement = null` (chỉ bản hiện hành có trạng thái).
- FIX-LB2 Optional: LBF-04 (CHECK của migration `…100200` làm deploy hỏng nếu một DB đã có bản xuất bản vi phạm — chưa DB nào ngoài máy dev chạy PL-1, FYI, không cần Owner); LBF-05 (ca gọi `insertOnce` hai lần trong một transaction; CHECK bản 1 luôn đòi xác nhận lại; quyền runtime của `policy_acknowledgements`); LBF-06 phần còn lại (so mã `SYSTEM` theo cặp bước + mục, khóa chữ mục `SYSTEM` — cần Owner chốt nếu khóa chữ); LBF-07 (`publishedBy` có tên); LBF-08/09/10 (ghi chú thứ tự, lệch OVERNIGHT/HANDOFF, backfill so snapshot 1.0); PF1-04 (request bay lúc ghi `LEFT` đặt lại ảnh/SĐT), PF1-05 (sweeper gọi storage trong một transaction), PF1-06 (README module + `security-jobs.md` + chú thích client vẽ lại ảnh), PF1-07 (giới hạn điểm ảnh), PF1-08…12. Chi tiết ở `AUDIT-LB-FIX1-PF1.md`.
- Mã thông báo cũ `BUDGET_DEPARTMENT_CEILING_PUBLISHED` giữ (đọc được hàng cũ) — BG-1.3 chỉ ngừng phát.

## Seed cần cho Z2

> Lane B KHÔNG sửa `src/cli/seed/**` hay flows (việc của Z2). Hợp đồng ngân sách đã đổi (BG-1, BG-2) rộng hơn những gì ghi lúc đầu: **cho tới khi Z2 làm xong,
> 4 suite seed (`test/integration/installation/seed.integration-spec.ts`, `seed-calendar`, `seed-rerun`, `test/integration/_serial/seed-check-runtime.integration-spec.ts`) sẽ ĐỎ ở
> bước `budget.cycles`/`budget.*` (chúng chạy `ops:seed apply` qua API thật), và nightly `flows` (mf4 và mọi flow cần dataset) sẽ đỏ.** Đỏ vì hợp đồng
> đã đổi chứ không phải test sai. Chi tiết theo từng file (số dòng ở `529beb0f`, có thể lệch vài dòng):

1. **`src/cli/seed/steps/finance.steps.ts`** (bước `budget.cycles`):
   - `:72`, `:109` `CycleRow.firstPublishedAt` — wire kỳ không còn trường này (có `status` `DRAFT|OPEN|LOCKED`, `openedAt`) ⟹ `found?.firstPublishedAt` luôn rỗng, kỳ không bao giờ "present". Đổi: nhận diện "đã có" bằng `openedAt !== null`.
   - `:112-117` `POST /budget-cycles` thiếu `sharedPoolReserve` (nay bắt buộc ⟹ 422): thêm `sharedPoolReserve: money(plan.sharedPoolReserve)`.
   - `:119-123` `PUT /budget-cycles/{year}/department-ceilings` và `POST …/publish` ⟹ 404 (đã xóa). Bỏ cả hai, gọi `POST /budget-cycles/{year}/opening`; bỏ `ceilingsOf` (`:91-102`); `evenShareOf` chỉ còn dùng ở `shared-demo-v4.spec.ts`.
   - **Hạn nộp (cần Z2 quyết):** kỳ chỉ mở được khi hạn nộp chưa qua (422 `BUDGET_CYCLE.DEADLINE_PASSED`), và sau hạn đề nghị của trưởng phòng bị 409 `BUDGET_CYCLE.LOCKED`. `dayBeforeNewYear(year, 60)` của năm hiện hành (2/11/2026) đã qua so với ngày chạy seed ⟹ kỳ năm hiện hành không mở được và không nộp được đề nghị. Z2 chọn: tính hạn từ "hôm nay + N ngày" (kỳ năm hiện hành mở với hạn còn), hoặc dựng ngân sách năm hiện hành bằng `source: 'BASELINE'` (được phép sau hạn khi phòng không có đề nghị; xem mục 2).
2. **`src/cli/seed/steps/budget.steps.ts`** (+ `finance-kit.ts`):
   - `:45-49` `POST /budget-proposals` gửi `{ year, lines }` ⟹ 422 (khóa lạ `lines`; thiếu `requestedAmount`, `attachmentIds`). Đổi sang `{ year, requestedAmount: money(…), note?, attachmentIds }`. Tệp BM-10 phải tải trước: `POST /budget-proposals/attachments` (khai tên, loại, dung lượng) ⟹ PUT lên URL trả về ⟹ `POST /budget-attachments/{id}/complete`; 1–10 tệp, không trùng. `finance-kit.ts:12-23` `proposalLines` bỏ.
   - `:61`, `:127`, `:149` `POST /budget-versions/{id}/submission` cần ≥ 1 tệp của phiên bản (422 `BUDGET_VERSION.ATTACHMENT_REQUIRED`): tải trước bằng `POST /budget-versions/{id}/attachments` ⟹ PUT ⟹ `POST /budget-attachments/{id}/complete`.
   - `:133-135` quyết định `'REQUEST_CHANGES'` ⟹ 422. Đổi `'RETURN'` (lý do bắt buộc, đã có `plan.reason`); `REJECT` cũng 422.
   - `:74` `POST /budget-versions { source: 'BASELINE', costCenterId, year }` vẫn dùng được nhưng phiên bản sinh ra có `origin = BASELINE_NO_PROPOSAL` (không còn dòng; phiên bản cũ `BASELINE_NO_HEAD` chỉ còn để đọc), chỉ lập được sau hạn nộp và khi phòng không có đề nghị đang chờ (409 `BUDGET.BASELINE_VERSION_NOT_ALLOWED`); `base` bỏ trống ⟹ = số chạy sang (0 tới khi `requests` bind, mục "Bị chặn").
   - `:83`, `:145` `POST /budget-versions { proposalId, base }` vẫn đúng (dự phòng mặc định 10 % không cần lý do). Nếu fixture muốn dự phòng khác 10 % (`reservePercent` hoặc `reserve`) thì phải kèm `reserveReason` khi gửi (D-B17, 422 `BUDGET.RESERVE_REASON_REQUIRED`).
3. **`src/cli/seed/fixture/shared-demo-v4/finance.ts`** + **`src/cli/seed/fixture/demo-fixture.types.ts`** + **`src/cli/seed/fixture/shared-demo-v4.spec.ts`:**
   - `budgets[].lines` (`:56-105`) và `nextYear[].lines` (`:112-150`) ⟹ thay bằng `requestedAmount` (+ `note`); dòng `RENEW/CHANGE/NEW/CANCEL`, `zbb`, `note` "vượt trần phòng", xếp hạng và cờ vượt Trần phòng không còn (đã bỏ ở BG-2); `DemoBudgetLine` bỏ khi không còn nơi dùng.
   - `nextCycle.ceilings` (`finance.ts:39-48`) và `DemoCycle.ceilings` (`demo-fixture.types.ts:114-123`) ⟹ bỏ (Trần phòng không còn, chỉ còn Trần năm + Dự phòng kho); sửa các chú thích ở `finance.ts:25-26`, `:32-33`, `:50-55`, `:107-111` và `note` "Vượt trần phòng" (`:122`, `:126`) nhắc "Trần của từng phòng", "dòng", "vượt trần".
   - `shared-demo-v4.spec.ts:173-197` (và `import { evenShareOf }` ở `:4`) kiểm Trần phòng và `evenShareOf` ⟹ viết lại theo luật mới: tổng (cơ sở + dự phòng) các phiên bản năm ≤ Trần năm − Dự phòng kho.
4. **`src/cli/seed/fixture/shared-demo-v4/README.md`** `:253-257` (kịch bản demo MF-4) còn các route đã xóa: `PUT …/department-ceilings`, `POST …/publish`, `GET /budget-proposals/{id}/lines` ⟹ thay bằng `POST …/opening`, tải tệp BM-10, `GET /budget-proposals/{id}`.
5. **`test/integration/installation/seed-calendar.integration-spec.ts`** `:127-133` đọc `first_published_at` (cột không còn được ghi; biến `published`) ⟹ `opened_at IS NOT NULL AS opened`; kỳ vọng đếm phiên bản (`2026: 8`, `2027: 2`) phụ thuộc cách Z2 dựng ngân sách năm hiện hành (mục 1, hạn nộp).
6. **`test/flows/mf4-budget.flow-spec.ts`:**
   - `:44-71` thân `BM-10` gửi `lines` ⟹ `{ year, requestedAmount: { amount }, note?, attachmentIds: [≥ 1 tệp] }` (có sẵn `uploadedFile` ở `:27`; `proposal()` mặc định `attachmentIds = []` nay là 422).
   - `:166-207` ca 422: `valid` dùng `lines` + `attachmentIds: []` ⟹ thân `BM-10` mới kèm một tệp (ca 201 cuối `:207` cần tệp); `withCurrency` đổi sang `requestedAmount: { amount, currency }` và `issuesOf` kỳ vọng `['requestedAmount']` (hiện `['lines.0.amount']`).
   - `:115`, `:260`, `:274`, `:282` mọi `POST …/submission` cần ≥ 1 tệp phiên bản đã đính trước (`:250` vẫn 422 `RESERVE_REASON_REQUIRED` vì luật lý do kiểm trước luật tệp). Ca dự phòng 6.000.000 trên cơ sở 30.000.000 (`:241-260`) vẫn đúng với D-B17.
7. **`test/flows/mf1-request-contract.flow-spec.ts`** `:103-130` (review LBG-04 chưa nêu): ca "ngân sách: dòng BM-10 còn khoảng mua" gửi `POST /budget-proposals { year, lines: [proposalLine] }` mong 201 ⟹ nay 422. Đổi sang thân `BM-10` (có `requestedAmount` + một tệp) cho nhánh 201, và dùng khóa bị bỏ (`lines`, `highValuePercent`) làm nhánh 422.

## Bị chặn

- **BG-2.1 phía `requests` (chờ lane A):** `budgets` đã mở và đăng ký `CarriedOverContributions` (`budgets/public/budgets.extension-points.ts`, export ở `BudgetsModule`); `GET /budget-cycles/{year}/baseline` đọc `carriedOverNextYear` qua `CarriedOverContributions.totals(costCenterIds, year)` và phiên bản nguồn `BASELINE` lấy nó làm cơ sở điền sẵn. Chưa có nguồn nào bind ⟹ số chạy sang = 0 (Finance nhập). Lane A (chủ `requests/year-start-commitments/` và hàm XY-1.1) cần thêm một listener `requests/year-start-commitments/carried-over.listener.ts` với `static readonly binds = [CarriedOverContributions]`, trong `onModuleInit` gọi `contributions.add('requests', { carriedOverOf: (costCenterIds, year, tx) => … })` trả `Map<costCenterId, bigint>` bằng **đúng hàm của khoản 01/01**: dòng/quyền có thời hạn còn hiệu lực sau 31/12 ⟹ tổng số năm sau đã lưu; quyền _Dùng lâu dài_ đang chạy ⟹ 12 × giá tháng VND hiện hành. T-BG2: 10 quyền lâu dài × 1.000.000 × 12 + 3.000.000 đã lưu = **123.000.000 đ** (phía `budgets` đã chứng minh bằng nguồn giả ở `test/integration/budgets/budget-baseline-version.integration-spec.ts`). Có thể cần khai cạnh ở `test/gates/module-graph.gate-spec.ts` (`PUBLIC_CONTRACT_EXPORTS` của `BudgetsModule` thêm `CarriedOverContributions`) khi bind.

## Dừng ở đâu

- Xong PL-1, PL-3, PF-1, FIX-LB1, BG-1, FIX-LB2 và cả BG-2: BG-2.0 `4d58016a`, BG-2.4 `09fb1d0e`, BG-2.1 + một phần BG-2.6 `5a1dfc03`, BG-2.3 `a4ba8bec`, BG-2.2 `7f740cf4`, BG-2.5 + BG-2.6 `d2bad69f`, BG-2.7 `6c62609d`, BG-2-G `50d9ca2f`. Còn lại ngoài lane B: phía `requests` của BG-2.1 (mục "Bị chặn"), seed/flows (mục "Seed cần cho Z2" ở HANDOFF). Dừng "LANE B CHỜ MERGE".
