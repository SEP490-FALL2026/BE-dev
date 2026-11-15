# OVERNIGHT-DECISIONS-LANE-B — chạy đêm lane B (15/11/2026)

> Nhánh `feat/fe-feedback-lane-b`. Owner không trả lời lúc chạy; mọi điểm dưới đây là **tạm chốt**, audit hỏi lại từng `D-Bn`. Mỗi mục: câu
> hỏi · phương án · đã chọn + căn cứ · file/commit · cách đổi lại. Thứ tự căn cứ: QĐ → BRD → OWNER-REVIEW → SPEC/PLAN → code → thông lệ.

## Chờ Owner quyết

| Mã                   | Câu hỏi                                                                                                                                                                                                                                                                                                                                                                                                                      | A                                                                                                                                                                                                                                                               | B                                                                       | Khuyến nghị                                                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LBG-12 (D-B12(2))    | `costCenterId` của `BM-10` tùy chọn hay bắt buộc? Hiện server suy ra Cost Center của phòng người gửi và chỉ bắt buộc (422 `BUDGET.COST_CENTER_REQUIRED`) khi người đó phụ trách hơn một Cost Center trong năm; SPEC ghi bắt buộc.                                                                                                                                                                                            | Giữ tùy chọn (đúng QĐ-111ab, FR-5.15(1); không đổi hợp đồng đang chạy của FE).                                                                                                                                                                                  | Bắt buộc như SPEC: bỏ `.optional()` ở `budget.dto.ts`, FE luôn gửi.     | **A.** Không trái QĐ; bắt buộc chỉ thêm một trường FE phải gửi mà server đã suy ra được.                                                                                                                                    |
| LBG-08               | Dự phòng kho (`sharedPoolReserve`) ≤ Trần năm (`annualCeiling`) chưa được kiểm khi tạo/sửa kỳ. Dự phòng > Trần ⟹ phần còn lại bị kẹp về 0 ở view và mọi lần gửi phiên bản bị 409 `BUDGET_VERSION.OVER_CEILING` mà không có thông báo sớm về nguyên nhân.                                                                                                                                                                     | Chặn ngay ở `POST`/`PATCH /budget-cycles`: 422 mã mới `BUDGET_CYCLE.RESERVE_OVER_CEILING` (luật thuần ở `cycle.policy.ts` + unit test; thêm mã vào manifest/ví dụ OpenAPI).                                                                                     | Giữ như nay: lỗi chỉ lộ ở lúc gửi phiên bản.                            | **A.** Chi phí nhỏ, báo lỗi đúng chỗ Finance đang nhập.                                                                                                                                                                     |
| LBG-13               | Gửi phiên bản trước khi khóa kỳ chưa bị chặn: Finance lập và gửi phiên bản từ đề nghị trước hạn nộp được, trong khi QT §4.6 nói "sau khi khóa, Finance … chốt"; gửi sớm còn đóng cửa sổ tạo phòng R-16 sớm hơn mong đợi.                                                                                                                                                                                                     | Chặn gửi phiên bản khi kỳ chưa `LOCKED` (409 mới). Chi phí: harness/test hiện gửi phiên bản khi kỳ đang `OPEN` phải đặt hạn quá khứ trước khi gửi; FE/Z2 phải biết.                                                                                             | Giữ: Finance làm dần khi đề nghị về; ghi rõ vào D-B8.                   | **A nếu Owner muốn đúng chữ QT §4.6**; B nếu muốn Finance xử lý sớm. Tôi nghiêng về A nhưng đổi hợp đồng nên cần Owner chốt.                                                                                                |
| MG-03 (AUDIT-MERGE1) | Hóa đơn mua gắn **thuê bao** (`invoices.subscription_id`, `cost_center_id` NULL) không vào `spent` của Cost Center nào (`invoice.repo.ts` `spentOf` gom theo `COALESCE(i.cost_center_id, c.cost_center_id)`), nên kiểm FR-3.20 khi trình lô, snapshot Người duyệt chi và `spentThisYear` của số liệu nền không thấy khoản đó; Dự phòng kho dùng chung (mức kỳ) cũng không có số "đã dùng". Chỉ `lastInvoiceRecordedAt` thấy. | Thuê bao có phòng sở hữu ⟹ ghi thêm `cost_center_id` = Cost Center của phòng sở hữu ở tháng kỳ (lane A, `bookPurchaseInvoice` trả `SUBSCRIPTION` kèm `costCenterId`); thuê bao kho (`K2`/`K4`) ⟹ "đã chi kho" đọc theo `subscription_id` ở báo cáo kỳ (lane B). | Giữ nguyên và ghi vào SPEC rằng chi thuê bao nằm ngoài ngân sách phòng. | **A cho thuê bao có phòng sở hữu** (không thì kiểm FR-3.20 bỏ sót chi thật); phần kho cần Owner xác nhận có muốn số "đã dùng" của Dự phòng kho hay không. Chưa làm: đổi nghĩa `spent` là việc của lane A và cần Owner chốt. |

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

### D-B6 — bỏ mục đích tệp `COST_STATEMENT` ("sao kê") khỏi enum nhận mới (ĐÃ LÀM ở FIX-LB4 MG-04 `4508b978`, xem D-B22)

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
- **Việc BG-2 còn lại, chưa làm ở lượt này:** BG-2.1 `CarriedOverContributions` (budgets mở điểm mở rộng, `requests` gắn bằng hàm 01/01 của XY-1 — lane A đang sửa chính hàm đó nên chờ; **đã nối ở FIX-LB4 MG-02**, D-B19), BG-2.2 `BM-10` = tệp + `requestedAmount` + `note` + khóa sau hạn, BG-2.3 xóa route dòng/import, BG-2.5 phần còn lại (`reservePercent`, ≥ 1 tệp khi gửi, mặc định cơ sở = số chạy sang), BG-2.6 số liệu nền (`carriedOverNextYear`, `noProposalSubmitted`, `BASELINE_NO_PROPOSAL`, bỏ chặn `HAS_HEAD`), BG-2.7 quyết định chỉ `APPROVE`|`RETURN`.

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

- **Chọn:** (1) `reservePercent` (0–100, số nguyên) **hoặc** `reserve` (loại trừ nhau ⟹ 422); tỷ lệ Finance chọn được lưu vào `reserve_percent` (trả lại đúng như đã gửi) và dùng để tính `reserve`; dự phòng khác mặc định của tổ chức, dù chọn bằng tỷ lệ hay số tiền, cần `reserveReason` khi gửi (SỬA theo FIX-LB3 LBG-02 ⟹ D-B17; bản đầu cho tỷ lệ đã chọn khỏi lý do vì so với chính tỷ lệ đã lưu, trái QĐ-100h/100k, FR-5.15(2)); (2) `base` bỏ trống ⟹ điền `carriedOverNextYear` (cả nguồn `PROPOSAL` lẫn `BASELINE`; nguồn chạy sang: `requests` bind từ FIX-LB4 MG-02, D-B19; không ai bind ⟹ 0); `PUT` không tự đổi cơ sở theo số chạy sang; (3) `belowCarriedOver` = (**cơ sở + dự phòng**) < số chạy sang, kèm `carriedOverShortfall` (SỬA theo FIX-LB3 LBG-01 ⟹ D-B16; bản đầu so riêng cơ sở, trái QĐ-111ac, `C-09` và QT §4.6); ở số liệu nền cờ lấy theo phiên bản mới nhất (không tách rời) của Cost Center trong năm, không có phiên bản ⟹ `false`; (4) đếm tệp đính kèm khi gửi đọc `budget_attachments` qua `VersionRepo.countAttachedFiles` (capability `attachment` đã phụ thuộc `version`, import ngược tạo vòng — gate capability graph); (5) BG-2.5 và BG-2.6 vào một commit vì cùng DTO và cùng `VersionFigures`.
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

### D-B19 — số chạy sang của `CarriedOverContributions` là một lần chạy thử đúng luật 01/01, chỉ đọc (FIX-LB4 MG-02)

- **Câu hỏi:** `requests` bind nguồn số chạy sang bằng cách nào để `carriedOverNextYear`, cơ sở điền sẵn và `belowCarriedOver` không còn luôn 0, mà không viết luật 01/01 thứ hai.
- **Phương án:** (A) chạy thử đúng luật của lượt 01/01 (cùng hàm, không khóa, không ghi); (B) viết công thức riêng cho số chạy sang; (C) lưu sẵn một cột "số năm sau" lúc duyệt chi rồi cộng.
- **Chọn A:** B tạo hai luật dễ lệch (QĐ-111ac: "một luật, cùng lượt 01/01"); C không phản ánh seat bị thu hồi, người nghỉ, quyền gia hạn hay giá 01/01 của quyền _Dùng lâu dài_. Cụ thể: (1) `YearStartCommitmentsBatchService.judgeBatch` tách khỏi `commitBatch` (không đổi hành vi: lượt 01/01 vẫn khóa hàng rồi gọi nó, test cũ xanh); (2) `YearStartCommitmentsRepo.readBatch` đọc cùng tập Request như `lockBatch` nhưng **không `FOR UPDATE`**, nên đọc ngân sách không chờ và không chặn Request đang được quyết; (3) `YearStartCarriedOverService.carriedOverOf(costCenterIds, year, tx?)` quét Request trả phí của tổ chức theo lô 100, cộng `amountMinor` của khoản mà lượt 01/01 sẽ tạo theo Cost Center (`carriedOverByCostCenter`, policy thuần); không `tx` thì tự mở một transaction đọc; (4) Request **đã giữ khoản của năm đó** thì không tính (đúng như lượt 01/01 bỏ qua — khoản ấy đã nằm trong số cam kết, không chạy sang nữa), nên sau lượt 01/01 số chạy sang của năm đó về 0; (5) mọi số bằng đồng như khoản 01/01 (QĐ-111an); không ghi audit "bỏ qua/bỏ số đã lưu" (việc của lượt thật).
- **Hệ quả chấp nhận:** mỗi lần budgets hỏi (số liệu nền, tạo phiên bản, đọc phiên bản) quét hết Request trả phí của tổ chức (cỡ vài trăm đến vài nghìn ⟹ vài chục câu lệnh); chưa thu hẹp theo phòng vì phòng chịu chi phí chỉ biết sau khi đọc seat. Nếu chậm: lọc theo `department_id` của Cost Center cộng các seat bàn giao, hoặc cache theo (năm, phiên bản đọc).
- **File/commit:** `requests/year-start-commitments/{carried-over.listener.ts, year-start-carried-over.service.ts, year-start-commitments-batch.service.ts, year-start-commitments.repo.ts, year-start-commitments.policy.ts}`, `requests.module.ts`, `test/gates/module-graph.gate-spec.ts` (`BudgetsModule: CarriedOverContributions`); test `requests/year-start-carried-over` (T-BG2 = 123.000.000 từ nguồn thật, chạy thử = cam kết lượt 01/01 tạo ra, không ghi, không chờ khóa). Commit `949f665f`. **Đổi lại:** bỏ `CarriedOverListener` khỏi `providers` của `requests.module.ts` ⟹ số chạy sang về 0.

### D-B20 — `budget-baseline-version` không thêm nguồn giả cạnh nguồn thật (FIX-LB4 MG-05)

- **Câu hỏi:** suite thêm nguồn `'test'` vào `CarriedOverContributions`, mà `totals` cộng mọi nguồn; sau MG-02 nguồn thật của `requests` được cộng thêm.
- **Phương án:** (A) spy `totals` trả đúng số suite nói; (B) giữ nguồn giả và dùng phòng không có Request nào; (C) bỏ nguồn thật khỏi graph.
- **Chọn A:** suite này kiểm phía `budgets` (cờ đỏ, cơ sở điền sẵn, phần thiếu) trên số do test đặt; nguồn thật và các con số của nó đã có suite riêng (D-B19). Không còn hai nguồn cộng dồn. Commit `949f665f`. **Đổi lại:** thay spy bằng `add('test', …)` kèm phòng không có Request.

### D-B21 — kỳ ngân sách của harness mở đến hết năm, không đến 01/12 (FIX-LB4 MG-01)

- **Câu hỏi:** `BudgetHarness.openedCycle` đặt hạn nộp 01/12 và hạn duyệt 15/12; từ 02/12 kỳ khóa (`cycleStateOf`) và mọi `budgetFor`/`approvedBudget` của năm hiện tại trả 409 `BUDGET_CYCLE.LOCKED`.
- **Phương án:** (A) cả hai hạn = 31/12 của năm (CHECK chỉ đòi hạn duyệt ≥ hạn nộp); (B) giả lập đồng hồ trong mọi suite; (C) đặt hạn theo "hôm nay + N ngày".
- **Chọn A:** đơn giản, không phụ thuộc đồng hồ, kỳ vẫn Mở đến hết ngày 31/12 (ngày bằng hạn còn trong hạn, D-B8); suite nào kiểm khóa tự đặt hạn (`setDeadline`). `budget-mine` đọc đúng hạn của harness nên đổi kỳ vọng sang 31/12 và trạng thái `OPEN`. Thêm ca giả lập 20/12 (`budget-harness-december`). Commit `aa4162af`. **Đổi lại:** một dòng SQL ở `openedCycle`.

### D-B22 — `POST /documents` không nhận `COST_STATEMENT`, bản ghi cũ vẫn đọc được (FIX-LB4 MG-04, làm xong D-B6)

- **Câu hỏi:** bỏ mục đích tệp "sao kê" khỏi enum nhận mới thế nào mà không làm gãy tệp đã lưu.
- **Phương án:** (A) tách enum nhận (`NEW_DOCUMENT_PURPOSES`, 5 giá trị) khỏi enum đọc (6 giá trị) ở DTO; chính sách vẫn giữ vai cho bản ghi cũ; (B) bỏ hẳn giá trị khỏi mọi chỗ (làm gãy response schema của tệp cũ); (C) bỏ cả giá trị enum DB (phá, không expand–contract).
- **Chọn A:** body `POST /documents` với `purpose: COST_STATEMENT` ⟹ 422 `VALIDATION_ERROR` với mọi vai (trước đây 403 hoặc 409 theo vai); `GET /documents/{id}` và danh sách tệp của hợp đồng vẫn trả `COST_STATEMENT` cho tệp đã lưu; DB giữ giá trị. OpenAPI: enum của body mất giá trị, response giữ. Commit `4508b978`. **Đổi lại:** thêm `'COST_STATEMENT'` vào `NEW_DOCUMENT_PURPOSES`.

## Optional và việc để lại

### FIX-LB4 — Optional và Nit của AUDIT-MERGE1

Đã làm: MG-01 `aa4162af`, MG-02 `949f665f`, MG-05 `949f665f`, MG-04 `4508b978`, MG-07 và MG-08 `c225606c`, `budget-attachment-access` `d10a6e44`. Còn lại:

- **MG-03** (cần Owner quyết) hóa đơn thuê bao không vào "đã chi" của ai: câu hỏi ở bảng "Chờ Owner quyết"; chưa làm vì đổi nghĩa `spent` là việc của lane A.
- **MG-06** (FYI vận hành) thứ tự migration lane A (`20261113004400`, `004500`) trước lane B (`2026111310xxxx`) an toàn vì không bảng/enum/CHECK nào bị hai bên cùng sửa; môi trường đã deploy riêng nhánh lane B nên chạy `ops:preflight`/`migrate status` trước khi deploy bản hợp nhất. Không có việc code.
- **Chi phí của D-B19**: mỗi lần budgets hỏi số chạy sang, `requests` quét hết Request trả phí của tổ chức (theo lô 100); thu hẹp theo phòng hoặc cache khi tổ chức lớn hoặc khi đo thấy chậm. `budget-cycle-baseline` (có đếm câu lệnh) vẫn xanh vì suite không có Request.
- `src/cli/seed/**` và flows vẫn thuộc Z2: nay `base` điền sẵn của phiên bản `BASELINE` là số thật của `requests`, không còn 0 (đã ghi ở mục "Seed cần cho Z2").
- Mô tả OpenAPI chạm ở lượt này (enum `purpose` của body `POST /documents`) không chứa mã "QĐ-…".

### FIX-LB3 — Optional và Nit của AUDIT-LB-BG (BG-1 + BG-2)

Đã làm (rẻ, an toàn, mỗi mục một commit, test đỏ trước): **LBG-06** `99ff0e49` (`noProposalSubmitted` cũng đúng cho phiên bản `BASELINE_NO_HEAD`), **LBG-17** `b41a12ed` (số liệu nền hỏi `cycleStateOf(cycle, today) === 'LOCKED'`, kỳ nháp có hạn quá khứ không còn bị coi là khóa). Ba mục chờ Owner ở bảng trên: LBG-08, LBG-12, LBG-13. Còn lại để lại:

- **LBG-05** (A khuyến nghị) gói B4/B5 `GET /budget-cycles/{year}/package` không có `carriedOverNextYear`, `belowCarriedOver`, `noProposalSubmitted` theo phòng cạnh đề nghị (QT §4.7, FR-5.16(4)); FE phải gọi `GET /budget-versions/{id}` từng phòng (N+1). Đề xuất: thêm ba trường vào `departments[].version` của package bằng `BaselineFlags` (3 câu lệnh).
- **LBG-07** eventKey thông báo dời hạn (`budget-notifier.service.ts:304`) = `…:${submissionDeadline}:${head}`: dời A→B→A→B thì lần B thứ hai bị chống trùng. Đề xuất: thêm `previousSubmissionDeadline` hoặc id bản ghi audit vào eventKey; test ba lần dời ⟹ ba thông báo.
- **LBG-09** (A/B) kỳ `LOCKED` từ chối mọi sửa, kể cả hạn quyết và ưu tiên (tài liệu chỉ khóa hạn nộp, Trần, Dự phòng kho). A: cho hạn quyết + ưu tiên đổi sau khóa, kèm lý do; B (hiện tại): khóa hết, đã ghi ở D-B8.
- **LBG-10** phòng tạo sau khi mở kỳ (cửa sổ R-16) không được báo kỳ đang mở + mẫu `BM-10` (QĐ-111ba); khi gán trưởng phòng cho phòng thuộc năm của kỳ `OPEN` ⟹ gửi `BUDGET_CYCLE_OPENED` (listener của sự kiện gán trưởng phòng).
- **LBG-11** `headsOf` = 2 truy vấn mỗi phòng trong transaction mở kỳ/dời hạn (đang giữ khóa `FOR UPDATE` của kỳ), 500 phòng ⟹ ~1.000 câu lệnh dưới khóa. Đề xuất: một lần `getDepartmentHeads(ids)` + `getUpcomingHeads(ids)` theo lô.
- **LBG-14** mất ca đồng thời của suite cũ `budget-cycle-edges`; thêm vào `budget-cycle-lifecycle.integration-spec.ts`: hai `POST /opening` song song ⟹ 1×200 + 1×409 `ALREADY_OPEN`, mỗi trưởng phòng đúng 1 thông báo.
- **LBG-15** tài liệu FE (`Docs/Figma UI-UX/API-Integration/reference/budgets.md`, `api-index.md`, `coverage-manifest.json`) còn 8 route đã xóa (`department-ceilings`, `publish`, 6 route dòng/import) ⟹ sinh lại API docs sau merge (generator trên clone dev; repo Docs không sửa ở lane B).
- **LBG-16** FYI vận hành: kỳ năm sau tạo trước migration `20261113100400` mà chưa "phát hành" giờ thành `OPEN` (có `opened_at`), trưởng phòng nộp được ngay mà chưa nhận thông báo mở kỳ. Nếu cần, gửi bù `BUDGET_CYCLE_OPENED` cho kỳ `first_published_at IS NULL` hoặc ghi chú vận hành.
- **LBG-18** (Nit) migration `20261113100600` `DROP CONSTRAINT` không `IF EXISTS`, `100400` `ADD CONSTRAINT` không xóa trước ⟹ không chạy lại thủ công được. Không sửa: migration đã có checksum, Prisma chỉ chạy một lần; migration mới của lane B dùng dạng chạy lại an toàn.
- **LBG-19** (Nit) `budget/version.repo.ts:485-487` (`countAttachedFiles`) đếm `budget_attachments` của capability `attachment` từ capability `budget` (đã ghi ở D-B14(4)); chuyển thành một hàm đọc ở `attachment/` khi gỡ được vòng phụ thuộc capability.
- **LBG-20** (Nit) khóa `approvedBudgetLines` của `dashboards/manager` trỏ sang `budgetMine` (D-B11); đổi tên khi FE đổi.
- **LBG-21** (Nit) `src/cli/seed/fixture/shared-demo-v4/README.md:253,255` còn route đã xóa: thuộc `src/cli/seed/**` (Z2), đã vào mục "Seed cần cho Z2" (mục 4).

- BG-2: `approvedBudgetLines` của dashboard trưởng phòng nên đổi tên khóa (vd. `approvedBudget`) khi FE đổi; `costCenterId` của `BM-10` vẫn tùy chọn (D-B12); `GET /budget-cycles/{year}/package` chưa trả `note` của đề nghị (FE đọc ở `GET /budget-proposals/{id}`); CHECK nguồn phiên bản chưa có nhánh `ADJUSTMENT` (AD-1 tự thêm); e2e `test/e2e/budget-version`, `mobile-approver-journey` đã sửa theo `BM-10` nhưng chưa chạy.

- Báo cáo xác nhận chưa có tổng `done`/`pending` toàn tập (cần join chéo module); thêm khi FE đòi.
- `GET /policies/{code}` cho phiên bản cũ trả `myAcknowledgement = null` (chỉ bản hiện hành có trạng thái).
- FIX-LB2 Optional: LBF-04 (CHECK của migration `…100200` làm deploy hỏng nếu một DB đã có bản xuất bản vi phạm — chưa DB nào ngoài máy dev chạy PL-1, FYI, không cần Owner); LBF-05 (ca gọi `insertOnce` hai lần trong một transaction; CHECK bản 1 luôn đòi xác nhận lại; quyền runtime của `policy_acknowledgements`); LBF-06 phần còn lại (so mã `SYSTEM` theo cặp bước + mục, khóa chữ mục `SYSTEM` — cần Owner chốt nếu khóa chữ); LBF-07 (`publishedBy` có tên); LBF-08/09/10 (ghi chú thứ tự, lệch OVERNIGHT/HANDOFF, backfill so snapshot 1.0); PF1-04 (request bay lúc ghi `LEFT` đặt lại ảnh/SĐT), PF1-05 (sweeper gọi storage trong một transaction), PF1-06 (README module + `security-jobs.md` + chú thích client vẽ lại ảnh), PF1-07 (giới hạn điểm ảnh), PF1-08…12. Chi tiết ở `AUDIT-LB-FIX1-PF1.md`.
- Mã thông báo cũ `BUDGET_DEPARTMENT_CEILING_PUBLISHED` giữ (đọc được hàng cũ) — BG-1.3 chỉ ngừng phát.

## Nợ test cho FIX-TEST

- `test/integration/requests/year-start-commitments-migration.integration-spec.ts` — ca "keeps what was committed…": `schemaDrift` trả mã 2 thay vì 0; nghi gốc: schema Prisma lệch 4 tên index `purchase_invoices` (`…_request_service_month_idx`, `…_resubmission_key`, `…_state_submitted_idx`, `…_subscription_service_month_idx`) của migration PI-1 (`20261113004500`, lane A), không phải do FIX-LB4; hết đỏ khi lane A đổi tên index trong schema hoặc thêm migration đổi tên.
- `test/integration/budgets/budget-baseline-version.integration-spec.ts` — một lần đỏ cả 19 ca ở `beforeAll` với `TransientDatabaseError` tại `BudgetHarness.start` (`test/support/seat-baseline-harness.ts:77`) khi chạy cùng lúc một lượt 49 suite, `test:http` toàn bộ và một lần `migrate deploy` trên cùng container; chạy lại một mình xanh 19/19; nghi gốc: tranh chấp DB/giao dịch tạm thời của `start()` khi nhiều tiến trình cùng dùng một container, không phải logic.

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
   - `:74` `POST /budget-versions { source: 'BASELINE', costCenterId, year }` vẫn dùng được nhưng phiên bản sinh ra có `origin = BASELINE_NO_PROPOSAL` (không còn dòng; phiên bản cũ `BASELINE_NO_HEAD` chỉ còn để đọc), chỉ lập được sau hạn nộp và khi phòng không có đề nghị đang chờ (409 `BUDGET.BASELINE_VERSION_NOT_ALLOWED`); `base` bỏ trống ⟹ = số chạy sang (từ FIX-LB4 MG-02 là số khoản 01/01 của năm đó sẽ giữ theo các Request đang chạy của phòng, D-B19; phòng không có Request ⟹ 0).
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

- Không còn mục nào. **BG-2.1 phía `requests` đã đóng ở FIX-LB4 MG-02** (`949f665f`, D-B19): `requests/year-start-commitments/carried-over.listener.ts` bind `CarriedOverContributions` bằng một lần chạy thử đúng luật 01/01, chỉ đọc. T-BG2 (10 quyền _Dùng lâu dài_ × 1.000.000 × 12 + 3.000.000 đã lưu = **123.000.000 đ**) được chứng minh bằng nguồn thật ở `test/integration/requests/year-start-carried-over.integration-spec.ts`; `PUBLIC_CONTRACT_EXPORTS` đã khai `BudgetsModule: CarriedOverContributions`.

## Dừng ở đâu

- Xong PL-1, PL-3, PF-1, FIX-LB1, BG-1, FIX-LB2 và cả BG-2: BG-2.0 `4d58016a`, BG-2.4 `09fb1d0e`, BG-2.1 + một phần BG-2.6 `5a1dfc03`, BG-2.3 `a4ba8bec`, BG-2.2 `7f740cf4`, BG-2.5 + BG-2.6 `d2bad69f`, BG-2.7 `6c62609d`, BG-2-G `50d9ca2f`. Còn lại ngoài lane B: phía `requests` của BG-2.1 (mục "Bị chặn"), seed/flows (mục "Seed cần cho Z2" ở HANDOFF). Dừng "LANE B CHỜ MERGE".

- **FIX-LB3 xong** (4 mục Required của AUDIT-LB-BG + Optional/Nit rẻ): LBG-01 `df8289da` (D-B16), LBG-02 `4e92423c` (D-B17), LBG-03 `96644b01` (D-B18, migration `20261113100800`), LBG-04 `511e9e41` (danh sách "Seed cần cho Z2" theo từng file), Optional/Nit LBG-17 `b41a12ed`, LBG-06 `99ff0e49`, danh sách còn lại + ba câu "Chờ Owner quyết" (LBG-12, LBG-08, LBG-13) `1a639286`, chore regenerate `e94863de`. Gate cuối gói xanh (xem HANDOFF dòng "FIX-LB3 (gate cuối gói)"). Còn lại ngoài lane B: phía `requests` của BG-2.1 ("Bị chặn"), seed/flows (Z2), lệch tên 4 index `purchase_invoices` của PI-1 (lane A). Dừng "LANE B CHỜ MERGE".

- **FIX-LB4 xong (gói cuối của lane B)**: MG-01 `aa4162af` (D-B21), MG-02 + MG-05 `949f665f` (D-B19, D-B20; đóng mục "Bị chặn" của BG-2.1), `budget-attachment-access` `d10a6e44`, MG-04 `4508b978` (D-B22, làm xong D-B6), MG-07 + MG-08 `c225606c`, chore regenerate `23e5571a`. Gate cuối gói xanh (xem HANDOFF dòng "FIX-LB4 (gate cuối gói)"). Còn lại ngoài lane B: MG-03 chờ Owner, ba câu LBG-08/12/13 chờ Owner, seed/flows (Z2), 4 tên index `purchase_invoices` của PI-1 (lane A), hai dòng "Nợ test cho FIX-TEST". Lane B dừng hẳn; PL-2 thuộc lane A.
