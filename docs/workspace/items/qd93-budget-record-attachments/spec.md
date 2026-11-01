# Spec: qd93-budget-record-attachments — tài liệu đính kèm của đề xuất ngân sách năm (`BM-10`) và phiên bản ngân sách

- Phụ trách: chưa phân công — người nhận (dev hoặc AI theo giao việc Owner) ghi tên khi nhận; sở hữu thiết kế, implementation,
  test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI theo giao việc của điều phối (01/11/2026, lượt `QĐ-93` → spec/plan BE).
- Thiết kế: `draft`. Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec.
- Nguồn: Docs `69e8a3d` (BRD v3.58 — `FR-5.15`(1)(2)(6), `BM-10` mục 5.13, `FR-1.5`, `FR-8.2`; User Stories sinh lại 143 Story /
  1 586 AC — `US-06-09` AC-24 → AC-26, `US-06-10` AC-14 → AC-16, `US-06-11` AC-11, bảng mục đích của `US-04-04`; quyết định
  `QĐ-93j`, `QĐ-91a`, `QĐ-82a`), BE `1a77ffe8` (nhánh `dev`, sạch). Không dùng "bản mới nhất".
- Bổ sung sau pin: `QĐ-93d`(1) `D-S16`, `QĐ-93g`(5) `D-S14`, `QĐ-93j`(3) `D-S15` — Docs chưa commit lúc ghi (01/11/2026); cập
  nhật pin khi Owner commit. Hạng mục này dùng `QĐ-93j`(3) `D-S15` (người xem tài liệu; `US-06-09` AC-25 viết lại — AC tải
  tài liệu của phiên bản nằm ở `US-06-09` trong `EP-06`; nhãn _Owner xác nhận 01/11/2026_ ở `US-06-09` AC-24 → AC-26,
  `US-06-10` AC-14 → AC-16, `US-06-11` AC-11; BRD `FR-5.15`(6)).
- Bổ sung sau pin: `D-S17`…`D-S26` (Owner 01/11/2026, Docs chưa commit). Hạng mục này dùng `D-S24` (danh sách phiên bản đã gửi
  của trưởng phòng; trưởng phòng thấy bộ tài liệu của lần gửi gần nhất) và `D-S26` (quyền chạy test, plan); các mục khác không chạm
  hạng mục này.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Trưởng phòng có hiệu lực gửi đề xuất ngân sách năm (`BM-10`) kèm tệp gốc (báo giá, bảng tính), Finance đính kèm/gỡ tài liệu
của phiên bản ngân sách khi phiên bản còn sửa được; Finance, Người duyệt chi và trưởng phòng của phòng đó xem danh sách và tải
lại đúng tệp gốc qua liên kết 5 phút (trưởng phòng tìm các phiên bản đã gửi Người duyệt chi quyết của Cost Center mình qua một
danh sách không có số tiền, và chỉ thấy bộ tài liệu phiên bản mang ở lần gửi gần nhất — `D-S24`), mọi vai khác bị từ chối; người
tải lên thấy và bỏ được tệp chưa gắn của mình; tệp không bao giờ được đọc thành dòng ngân sách và bất biến khi bản ghi rời trạng
thái sửa được. Kiểm được bằng integration HTTP trên PostgreSQL thật với kho đối tượng trong bộ nhớ.

## Sizing decision

- Container: G5 (`EP-06`, vòng lập ngân sách năm `FR-5.15`) và yêu cầu trực tiếp `QĐ-93j` của Owner (01/11/2026) — chỉ là
  container, không phải ranh giới.
- Mode: `grouped-stories`.
- Outcome and owner: hồ sơ ngân sách năm có tài liệu gốc kèm theo — trưởng phòng kèm vào đề xuất, Finance kèm vào phiên bản,
  ba bên tải lại theo quyền; capability mới `budgets/attachment` (module `budgets`, T5).
- Boundaries: một bảng mới `budget_attachments` do `budgets` sở hữu, hai giá trị mới của `BudgetVersionHistoryKind` và ràng
  buộc hình dạng `budget_version_history_shape_check` dựng lại cho hai giá trị đó; ghi trong transaction gửi/gửi lại đề xuất (đã
  có) hoặc dưới khóa dòng phiên bản (đính kèm/gỡ); mười operation HTTP mới (bảy của tệp, danh sách phiên bản đã gửi của trưởng
  phòng `D-S24`, danh sách và bỏ tệp chưa gắn của chính mình), hai body đổi (thêm trường tùy chọn); kho đối tượng chỉ qua
  `ObjectStoragePort` của `src/infrastructure/object-storage` (đồ thị module ở mục 11); ghi: `MANAGER` (trưởng phòng hiệu lực)
  cho đề xuất, `FINANCE` cho phiên bản; đọc: Finance, Người duyệt chi, trưởng phòng của Cost Center; một sweeper theo giờ trong
  tiến trình API (ADR-0018).
- Not larger: import CSV thành dòng `POST /budget-versions/{id}/imports` giữ nguyên (`QĐ-93j`(2)); tài liệu hợp đồng của
  `catalog` (`/documents`) không đổi; quyết định phiên bản luôn của Người duyệt chi và bỏ người thay thế (`QĐ-93d`) thuộc
  `qd93-remove-fallback-substitute-approvers`; quét mã độc, xóa theo thời hạn lưu, kế thừa tài liệu giữa bản nộp lại hoặc từ
  đề xuất sang phiên bản không thuộc đây (mục `## Explicit out of scope`).
- Not smaller: ba Story dùng chung một bảng, một luồng tải lên (khai báo → `PUT` có chữ ký → kiểm byte → giữ bản đã kiểm), một
  luật người xem và một sweeper. Tách theo Story tạo một hạng mục dựng bảng + luồng tải lên mà hạng mục kia chỉ dùng lại
  (coupling giả, hai test matrix trùng phần tải lên/kiểm byte/hết hạn); `US-06-11` AC-11 chỉ là vế đọc của cùng tệp. Tách theo
  tầng (migration/controller/service) là cấm.
- Siblings: `g5-budget-proposal-and-review` (gửi/gửi lại đề xuất — body thêm `attachmentIds`), `g5-budget-version-decision`
  (quyết định phiên bản, AC-1 → AC-10), `qd93-remove-fallback-substitute-approvers` và
  `qd93-direct-manager-spending-approver-roles` (định nghĩa Người duyệt chi và trưởng phòng mà luật người xem dùng),
  `qd93-parameter-labels-dashboard-queues` (cùng sửa `parameter-definitions.policy.ts`), `g3-contract-documents` (luồng
  tệp hợp đồng làm mẫu, không đổi).
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story      | AC          | Coverage | Phần còn lại thuộc                                                                                                                                                                                                           |
| ---------- | ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-06-09` | AC-24→AC-26 | partial  | AC-1, AC-3, AC-5→AC-8, AC-11, AC-13→AC-20, AC-22, AC-23: `g5-budget-proposal-and-review`; AC-2, AC-4, AC-9: `g5-commitment-creation`; AC-10, AC-21: `g5-budget-version-decision`; AC-12: `g3-downstream-finance-integration` |
| `US-06-10` | AC-14→AC-16 | partial  | AC-1→AC-13: `g5-budget-proposal-and-review`                                                                                                                                                                                  |
| `US-06-11` | AC-11       | partial  | AC-1→AC-10: `g5-budget-version-decision`; AC-12: `qd93-remove-fallback-substitute-approvers`                                                                                                                                 |

Cả ba dòng là `partial` vì hạng mục chỉ sở hữu các AC mới của `QĐ-93j`; mỗi AC sở hữu ở đây là `full` ở cấp khóa trong scope map.
Bảy khóa là AC mới ở Docs `69e8a3d`; scope map G5 (re-pin `69e8a3d`) đã ghi chúng `full` cho hạng mục này, và
`g5-budget-proposal-and-review` (`US-06-10`), `g5-budget-version-decision` (`US-06-11`) đã claim `partial` nêu hạng mục này.
Luật người xem của các AC này là `QĐ-93j`(3), Owner xác nhận 01/11/2026 (`D-S15`): spec hiện thực đúng chữ AC (mục 5).

## Supporting references

- `FR-5.15`(1)(2)(6), `BM-10` (BRD 5.13): đề xuất và phiên bản lưu tệp gốc, tải lại theo quyền, không đọc thành dòng; quyền xem
  của hồ sơ ngân sách (`SoD-2`, `QĐ-82m` `INF-06`).
- `US-04-04` (bảng mục đích có thêm hai dòng _tài liệu đề xuất ngân sách năm_ và _tài liệu phiên bản ngân sách_; AC-10 loại/kích
  thước theo tham số tài liệu) — chỉ truy vết; không đổi AC hay code của `catalog`.
- `FR-1.5` (tệp riêng tư, liên kết ký có thời hạn), `QĐ-91a` (đề xuất đã nộp là bản chụp bất biến), `QĐ-91d` (yêu cầu sửa trả
  **chính** phiên bản về Finance), `QĐ-92c`, `SoD-8`.
- ADR-0014 (kho đối tượng, liên kết tải lên 120 giây ký loại + kích thước, sao sang khóa cuối, liên kết tải về 300 giây), ADR-0016
  (ngữ cảnh budgets), ADR-0018 (sweeper ở tiến trình API), ADR-0019 (tầng module, cửa `public/`).
- Mã nguồn tham chiếu (BE `1a77ffe8`): `src/modules/catalog/contract/document.service.ts`, `contract.policy.ts` (mẫu luồng tải
  lên, không import), `src/modules/budgets/proposal/proposal.service.ts` (`send`), `src/modules/budgets/version/version-access.service.ts`
  (`lockEditable`), `src/modules/budgets/version/version-history.service.ts`, `src/modules/budgets/budget/budget-facts.service.ts`
  (`isDecider`, `headedCostCenter`, `requireHeadedCostCenter`).

## Explicit out of scope

- Import dòng CSV/Excel của Finance (`budgetVersionImport`) — giữ nguyên contract và hành vi; test hồi quy chỉ chứng minh đính
  kèm không tạo dòng.
- Đổi `catalog/contract` (bảng `document_attachments`, `/documents`, `DocumentExpirySweeper`). Gom hai luồng tải lên vào helper
  hạ tầng chung là refactor giữ hành vi, đề xuất làm hạng mục sau (tên dự kiến `catalog-document-storage-helper-adoption`, chưa
  tạo), không thuộc đây.
- Kế thừa tự động tài liệu của đề xuất bị trả lại sang bản nộp lại, hay của đề xuất sang phiên bản lập từ nó (hai câu hỏi mở của
  `US-06-09`, `US-06-10` — mặc định Owner duyệt 01/11/2026 ở `## Quyết định đã chốt`).
- Quét mã độc, xem trước/chuyển đổi định dạng, OCR, đọc nội dung tệp (cấm theo `QĐ-93j`(1)).
- Xóa tệp theo thời hạn lưu giữ (BRD 7.5 chưa có dòng cho hồ sơ ngân sách) và lifecycle rule mới của bucket (khóa tạm dùng chung
  tiền tố `pending-documents/` đã có rule).
- Thông báo trong hộp thư khi có tài liệu mới; số đếm tài liệu trong danh sách/chi tiết đề xuất hay phiên bản (FE gọi route
  danh sách).
- Cập nhật tài liệu API cho FE ở repo Docs (`Figma UI-UX/API-Integration`) — phía Docs sinh lại từ `openapi.json`; hạng mục chỉ ghi
  thay đổi contract ở mục _Tương thích và thay đổi contract cho FE_.

## Dependencies and blockers

- Không blocker cứng để **bắt đầu**: BE `1a77ffe8` đã có đề xuất/phiên bản (`g5-budget-proposal-and-review`,
  `g5-budget-version-decision`), kho đối tượng (`ObjectStorageModule`) và tham số `DOCUMENT_MAX_SIZE_MB`.
- Thứ tự **merge** (lượt `QĐ-93`, sóng W4; merge từng hạng mục một, rebase lên `dev` ngay trước khi merge): hạng mục này merge
  **sau** `qd93-remove-fallback-substitute-approvers` phase A (phase A ra cùng bản phát hành với
  `qd93-direct-manager-spending-approver-roles`, nên cũng sau hạng mục vai) và **sau** `qd93-parameter-labels-dashboard-queues`
  (W1).
  - Fallback phase A và vai (`QĐ-93a`: `MANAGER`, `SPENDING_APPROVER` gán trực tiếp; bỏ người thay thế khi xung đột) đổi cách
    `BudgetFactsService.isDecider` nhận ra Người duyệt chi. Hạng mục này **chỉ** gọi `isDecider`, không tự định nghĩa người duyệt;
    test người xem dùng cách gán vai của harness trên `dev` lúc rebase.
  - `qd93-parameter-labels-dashboard-queues` merge trước và thêm `label`/`group` vào cùng tệp
    `src/modules/operating-parameters/parameter-definitions.policy.ts`; hạng mục này rebase lên nó và chỉ đổi `description` của
    `DOCUMENT_MAX_SIZE_MB`, giữ nhãn của nó.
- Migration (Task 1) đi trước mọi code dùng bảng. **Quy tắc timestamp** (mọi migration mới của lượt `QĐ-93`): mỗi thư mục
  migration mới mang timestamp thật lúc người implement tạo nó; trước khi merge, người implement đổi lại timestamp cho lớn hơn
  migration mới nhất trên `dev` (ở `1a77ffe8` là `20261101000200_licensing_subscription_renewals`, cộng mọi migration `qd93-*` đã
  merge trước). KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng mục (thư mục migration mới xếp sau cùng nên gate
  `migration-order` vẫn xanh); Owner thêm vào danh sách khi phát hành. `<timestamp>` trong spec/plan là chỗ đặt theo quy tắc
  này, không phải tên cuối.
- Luật người xem `QĐ-93j`(3) đã được Owner xác nhận 01/11/2026 (`D-S15`, mục 5); đổi luật sau này chỉ chạm
  `budget-attachment.policy.ts` và test người xem.
- Kiểm trên kho S3 thật (CORS cho `PUT` từ trình duyệt, `SEC-09`) vẫn là việc vận hành thủ công như ADR-0014; không chặn local.

## Ownership: module, data, API

- Module/capability: `budgets` (T5), capability mới `src/modules/budgets/attachment/`. Không Nest submodule hay bounded context
  mới. Hướng capability (R6, không vòng): `proposal → attachment → version → budget`; `attachment` không import `proposal`
  (luật người xem của đề xuất đặt lại trong `budget-attachment.policy.ts`, cùng nghĩa với `ProposalViewService.scope`).
- Hạ tầng (kỹ thuật, không nghiệp vụ) mới trong `src/infrastructure/object-storage/`: `file-signature.ts` (định dạng ↔ byte đầu),
  `stored-object.ts` (nhận biết "không có đối tượng"/"đã bị ghi lại" của S3: 404/412), `upload-inspection.ts` (`UploadInspection`:
  `head` → so loại/kích thước khai → `readPrefix` kèm `IfMatch` → hàm chấp nhận → `copyIfMatch` sang khóa cuối; `discard`).
  `ObjectStorageModule` export thêm `UploadInspection`. `catalog` không đổi.
- `BudgetsModule` import thêm `ObjectStorageModule`. Đồ thị module (kiểm ở `1a77ffe8`): `BudgetsModule` có trong `AppModule` **và**
  trong `RecordSuperAdminEventCliModule` (qua `SuperAdminEventCliModule` → `PersonnelModule` → `RequestsModule` → `BudgetsModule`);
  đồ thị CLI đó **đã** chứa `ObjectStorageModule` hôm nay qua `RequestsModule` → `CatalogModule`. Ca "kho chỉ trong API" của gate
  `module-graph` (`module-graph.gate-spec.ts` dòng 467) chỉ duyệt tám đồ thị khai ở dòng 263 (không gồm CLI này), nên kỳ vọng
  của gate không đổi; hạng mục không thêm đồ thị tiến trình mới nào có kho. Sweeper mới có mặt trong đồ thị CLI nhưng không bao giờ
  chạy ở đó (lượt đầu chờ 5 phút, timer `unref` — như `DocumentExpirySweeper` hôm nay).
- Tách service theo `max-params` (8, `eslint.config.mjs`; gate `lint-debt` cấm mọi suppression `max-params`):
  `ProposalService` đã tiêm 8 phụ thuộc (`proposal.service.ts:44-54`) nên **không** nhận thêm binder. Tách:
  - `proposal/proposal-sender.service.ts` — `ProposalSender.send(tx, actor, input)`: phần `send` + `proposalToFollow` hiện có, gọi
    `ProposalAttachmentBinder.bind(tx, …)` sau khi chèn đề xuất; phụ thuộc `ProposalRepo`, `VersionRepo`, `BudgetFactsService`,
    `BudgetNotifierService`, `BudgetYearLockRepo`, `AuditApi`, `ProposalAttachmentBinder` (7). `ProposalService` thay
    `BudgetYearLockRepo` (chỉ `send` dùng) bằng `ProposalSender` — vẫn 8; `submit`/`resubmit` gọi `sender.send`, hành vi và thứ tự
    khóa không đổi.
  - `attachment/budget-attachment-declaration.service.ts` (khai báo đề xuất + phiên bản, ký liên kết tải lên sau commit):
    `TransactionRunner`, `BudgetAttachmentRepo`, `BudgetFactsService`, `VersionAccessService`, `OperatingParametersApi`,
    `ObjectStoragePort`, `AuditApi` (7).
  - `attachment/budget-attachment-completion.service.ts` (complete): `TransactionRunner`, `BudgetAttachmentRepo`,
    `VersionAccessService`, `VersionHistoryService`, `UploadInspection`, `AuditApi` (6).
  - `attachment/budget-attachment-removal.service.ts` (gỡ, ≤ 5), `budget-attachment-discard.service.ts` (bỏ tệp chưa gắn, ≤ 4),
    `budget-attachment-query.service.ts`, `budget-attachment-link.service.ts` (≤ 6 mỗi lớp). Không lớp nào quá 8 tham số.
- Bảng ghi: `budget_attachments` (mới, budgets), `budget_version_history` (thêm dòng), `audit_events` qua `AuditApi`. Bảng đọc
  (của chính budgets): `budget_proposals`, `budget_versions`. Đọc module khác qua facade: `OrganizationReadApi` (người, Cost
  Center, trưởng phòng — đã qua `BudgetFactsService`), `OperatingParametersApi.getValue('DOCUMENT_MAX_SIZE_MB')`.
- Gate sở hữu bảng: thêm `BudgetAttachment: 'budgets'` vào `test/gates/architecture-boundaries.gate-spec.ts`.
- Operation HTTP thêm: 10 (bảng ở mục 7): 7 của tệp, `budgetMineVersionList` (`D-S24`, controller `budget-view/budgets.controller.ts`,
  repo `VersionRepo.pageSentOf`), `budgetAttachmentMineList`, `budgetAttachmentDiscard`. Đổi: `budgetProposalSubmit`,
  `budgetProposalResubmit` (trường body tùy chọn `attachmentIds`), `budgetVersionHistoryList` (hai giá trị `kind` mới). Contract
  phải giữ nguyên: mọi operation khác của `budgets` (gồm `budgetMine`, `budgetVersionList`, `budgetVersionGet`), `/documents` của
  `catalog`, `budgetVersionImport`.

## Behavior and design

### 1. Chọn nơi giữ tệp — bảng riêng của `budgets` dùng chung cổng kho

| Phương án                                                                                                                                         | Đánh giá                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Tổng quát hóa `document_attachments` của `catalog` (mục đích `BUDGET_PROPOSAL_ATTACHMENT`, `BUDGET_VERSION_ATTACHMENT`, FK nullable + `CHECK`) | Loại. Bảng thuộc `catalog` (T4) với bất biến của hợp đồng: `READY` ⇔ có `contract_id`, tệp **không bao giờ** gỡ, chỉ `IT_ADMIN`/`FINANCE` mở. Tệp ngân sách cần gỡ có lịch sử (AC-26), người xem theo phòng (trưởng phòng hôm nay) mà chỉ `budgets` (T5) biết; `catalog` không được gọi lên `budgets` trừ qua `Hook`, và `budgets` phải ghi trạng thái bảng của `catalog` (ghi xuyên module). Đổi trigger/`CHECK` của hợp đồng rủi ro hồi quy `SEC-01`/`DB-13`. |
| B. Bảng riêng `budget_attachments` của `budgets`, dùng `ObjectStoragePort` + helper hạ tầng mới                                                   | **Chọn.** Đúng quy tắc sở hữu (một module ghi bảng của mình, đọc chéo qua facade), không ghi xuyên module, giữ nguyên `catalog`. Luồng kiểm byte/sao khóa cuối nằm ở helper kỹ thuật `UploadInspection` (không nghiệp vụ) nên không chép logic vào `budgets`. Chi phí: `catalog` vẫn có bản riêng của cùng luồng tới khi một refactor sau dùng helper.                                                                                                          |
| C. `catalog` mở facade "kho tệp" cho module khác                                                                                                  | Loại: biến `catalog` thành kho tệp toàn hệ thống (ngoài bounded context ADR-0013), vẫn cần luật người xem của `budgets`.                                                                                                                                                                                                                                                                                                                                        |

Hai mục đích của bảng `US-04-04` ánh xạ thành `budget_attachments.target` = `PROPOSAL` | `VERSION`.

### 2. Vòng đời một tệp

```text
khai báo (AWAITING_UPLOAD) ──PUT bằng liên kết 120 s──► complete
   ├─ đối tượng chưa tới ⟹ vẫn AWAITING_UPLOAD (409 UPLOAD_PENDING, gọi lại được)
   ├─ sai kích thước/loại/byte đầu ⟹ QUARANTINED (xóa đối tượng; cuối)
   ├─ quá 24 giờ kể từ khai báo ⟹ EXPIRED (cuối)
   ├─ target PROPOSAL ⟹ UPLOADED (chỉ người tải lên thấy; chờ được gửi kèm đề xuất)
   │     ├─ gửi/gửi lại đề xuất có id này ⟹ ATTACHED (proposal_id đặt một lần; bất biến cùng bản chụp)
   │     └─ không gửi sau 7 ngày ⟹ EXPIRED (sweeper xóa đối tượng)
   └─ target VERSION (phiên bản khai lúc khai báo, còn sửa được) ⟹ ATTACHED
         └─ Finance gỡ khi phiên bản còn sửa được ⟹ REMOVED (giữ đối tượng, vẫn tải được trong lịch sử; cuối)
người tải lên bỏ tệp AWAITING_UPLOAD hoặc UPLOADED của mình ⟹ DISCARDED (xóa đối tượng sau commit; cuối)
```

- Không bao giờ xóa dòng; những gì đã khai (tên, loại, kích thước, khóa tạm, người tải lên, target, phiên bản đích) không đổi;
  khóa cuối đặt một lần; trạng thái chỉ đi một chiều (trigger DB, mục 9).
- "Trạng thái sửa được" của đề xuất: đề xuất **không có bản nháp** trong BE (`QĐ-82a`: đề xuất gửi đi không sửa tại chỗ), nên
  phần "đang soạn" là phía client. Tài liệu được gắn **trong transaction gửi/gửi lại**; sau đó mọi trạng thái của đề xuất
  (`SUBMITTED`, `RETURNED`, `WITHDRAWN`, `REVIEWED`, `CLOSED_FISCAL_YEAR_ENDED`) đều bất biến về tài liệu — không có route thêm/gỡ
  tài liệu của đề xuất (AC-16). Bản nộp lại (AC-5) là đề xuất mới nhận tài liệu mới; tài liệu của bản trước giữ nguyên.
- "Trạng thái sửa được" của phiên bản: đúng luật `isEditable` hiện có — `DRAFT` hoặc `CHANGES_REQUESTED`, chưa `detached_at`, năm
  tài chính chưa kết thúc (`VersionAccessService.lockEditable`). `SENT`, `APPROVED`, `SUPERSEDED`, `REJECTED`, `EXPIRED` ⟹ bất biến
  (AC-26); tài liệu cần thêm sau khi duyệt đi vào phiên bản sửa đổi mới (AC-7 của `US-06-09`).

### 3. Luồng của trưởng phòng — đề xuất (`US-06-10` AC-14, AC-16)

1. `POST /budget-proposals/attachments` cho từng tệp → nhận `upload` (URL `PUT`, header phải gửi, hết hạn) → FE `PUT` byte →
   `POST /budget-attachments/{id}/complete` → `UPLOADED`.
2. `POST /budget-proposals` (hoặc `POST /budget-proposals/{id}/resubmission`) với `attachmentIds`. Kiểm hiện có giữ nguyên thứ
   tự và mã lỗi (trưởng phòng, Cost Center, năm, dòng, đề xuất đang mở…) — phần này chuyển nguyên văn sang `ProposalSender.send`
   (mục _Ownership_); sau khi chèn đề xuất, trong cùng transaction, `ProposalAttachmentBinder.bind`: khóa các
   dòng tệp `FOR UPDATE` theo `id` tăng dần; mỗi id phải là `target = PROPOSAL`, `status = UPLOADED`, người tải lên = người gửi;
   sai bất kỳ id nào ⟹ 422 `BUDGET_ATTACHMENT.NOT_ATTACHABLE` `details.attachmentIds` (đúng các id sai, theo thứ tự gửi), transaction
   hoàn tác — **không** đề xuất, dòng hay tệp nào đổi. Đúng ⟹ mỗi tệp `ATTACHED`, `proposal_id`, `attached_at`; một sự kiện audit
   `BUDGET_ATTACHMENT.ATTACHED` mỗi tệp. Body không có `attachmentIds` ⟹ hành vi như hôm nay.
3. Nội dung tệp không bao giờ thành dòng: dòng của đề xuất chỉ đến từ `lines` của body (AC-14).

### 4. Luồng của Finance — phiên bản (`US-06-09` AC-24, AC-26)

1. `POST /budget-versions/{id}/attachments` (phiên bản phải sửa được ngay lúc khai báo) → `PUT` → `complete`.
2. `complete` khóa phiên bản (`lockEditable`), khóa dòng tệp, kiểm lại `AWAITING_UPLOAD` và giới hạn 20 tệp → `ATTACHED`
   (`attached_at` = đồng hồ đọc **sau** khi giữ khóa dòng phiên bản, như `sent_at` của `VersionService.send`); một dòng lịch sử
   `ATTACHMENT_ADDED` (`before` null, `after` `{ attachmentId, fileName, contentType, sizeBytes }` — **mọi giá trị là chuỗi**,
   `sizeBytes` ghi dạng text như `"48213"`, vì `HistoryValues` và `changesOf` của `version-history.policy.ts:202-220` chỉ hiện giá
   trị chuỗi của các khóa trong `after`) và audit `ATTACHED`.
   Phiên bản đã rời trạng thái sửa được giữa khai báo và complete ⟹ 409 `BUDGET.VERSION_NOT_EDITABLE` (năm đã hết ⟹ 422
   `BUDGET.YEAR_ENDED`), bản sao cuối bị rút lại, tệp vẫn `AWAITING_UPLOAD` (gọi lại được nếu phiên bản trở về `CHANGES_REQUESTED`
   trong 24 giờ, không thì hết hạn).
3. `POST /budget-versions/{id}/attachments/{attachmentId}/removal` (không body): khóa phiên bản (`lockEditable`) → khóa dòng tệp →
   tệp phải là tài liệu của phiên bản đó: id không có, `version_id` khác phiên bản trong path, hoặc tệp của phiên bản chưa từng gắn
   (`AWAITING_UPLOAD`, `QUARANTINED`, `EXPIRED`, `DISCARDED` — không phải tài liệu của phiên bản, danh sách không hiện) ⟹ 404
   `BUDGET_ATTACHMENT.NOT_FOUND`; đã `REMOVED` ⟹ 409 `BUDGET_ATTACHMENT.ALREADY_REMOVED`; `ATTACHED` → `REMOVED`, `removed_at`
   (đồng hồ đọc sau khóa phiên bản), `removed_by_employee_id`; lịch sử `ATTACHMENT_REMOVED` (`before`
   `{ attachmentId, fileName, contentType, sizeBytes, state: 'ATTACHED' }`, `after` `{ attachmentId, fileName, state: 'REMOVED' }`
   — chuỗi, để màn lịch sử hiện tên tệp đã gỡ), audit `REMOVED`. Đối tượng giữ nguyên. Kiểm phiên bản trước kiểm tệp: phiên bản
   không sửa được ⟹ 409 `BUDGET.VERSION_NOT_EDITABLE` (năm hết ⟹ 422 `BUDGET.YEAR_ENDED`) dù tệp thế nào.
4. Import dòng (`budgetVersionImport`) độc lập: tệp đính kèm không được đọc, không tạo/đổi dòng hay số tiền (AC-24).

### 5. Ai xem, ai ghi

| Bản ghi                                      | Đính kèm / gỡ                                                                         | Xem danh sách và tải                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Đề xuất `BM-10`                              | Trưởng phòng có hiệu lực của Cost Center, chỉ trong transaction gửi/gửi lại; không gỡ | Finance; Người duyệt chi (`BudgetFactsService.isDecider`); trưởng phòng có hiệu lực **hôm nay** của Cost Center của đề xuất — mọi trạng thái của đề xuất                                                                                                                                                                                         |
| Phiên bản ngân sách                          | Finance, khi phiên bản sửa được                                                       | Finance và Người duyệt chi — mọi trạng thái, mọi tệp `ATTACHED` và `REMOVED`; trưởng phòng có hiệu lực hôm nay của Cost Center của phiên bản — **chỉ từ khi phiên bản được gửi Người duyệt chi quyết** (`sent_at IS NOT NULL`, `QĐ-93j`(3) `D-S15`, `US-06-09` AC-25) và **chỉ bộ tài liệu phiên bản mang ở lần gửi gần nhất** (`D-S24`, mục 5a) |
| Tệp chưa gắn (`AWAITING_UPLOAD`, `UPLOADED`) | người tải lên bỏ được (`DISCARDED`)                                                   | chỉ người tải lên: danh sách `budgetAttachmentMineList`; liên kết tải chỉ cho `UPLOADED` (xem trước khi gửi)                                                                                                                                                                                                                                     |

- Đánh giá theo vai và giai đoạn trưởng phòng **ở mỗi request** (AC-15, AC-25: trưởng phòng đổi ⟹ người mới có quyền, người cũ mất
  quyền từ thao tác kế tiếp). Người duyệt chi chỉ đọc; gọi đính kèm/gỡ bị guard vai từ chối 403 (`US-06-11` AC-11). IT Admin, Super
  Admin, Employee, trưởng phòng khác bị từ chối và không lộ tên tệp hay sự tồn tại (mục 7).
- "Được gửi Người duyệt chi quyết" = `budget_versions.sent_at IS NOT NULL` (`VersionRepo.setSent` đặt lại mỗi lần gửi, đọc đồng hồ
  sau khi khóa dòng phiên bản; không bị xóa khi Người duyệt chi yêu cầu sửa — kiểm ở `1a77ffe8`): `SENT`, `APPROVED`, `REJECTED`,
  `SUPERSEDED`, phiên bản đóng cuối năm đã từng gửi, và `CHANGES_REQUESTED` sau lần gửi — trưởng phòng thấy theo mục 5a; `DRAFT`
  chưa từng gửi (kể cả bản nháp đã tách `detached_at`) và phiên bản đóng cuối năm chưa từng gửi — trưởng phòng không thấy.
- Trưởng phòng hỏi phiên bản của Cost Center mình chưa từng gửi ⟹ xử lý như bản ghi không được xem: danh sách 404
  `BUDGET.VERSION_NOT_FOUND`, `link` 404 `BUDGET_ATTACHMENT.NOT_FOUND` — không lộ tên tệp hay sự tồn tại (như trưởng phòng của
  Cost Center khác). Không mã lỗi mới.
- **Không có tiền lệ để dựa** (sửa câu cũ): `budgetVersionList`/`budgetVersionGet` chỉ nhận Finance và người quyết
  (`BudgetFactsService.requireVersionReader`, `version-view.service.ts:31,40`); trưởng phòng gọi chúng nhận **403**
  `AUTHORIZATION.FORBIDDEN`, không phải 404, và không có cách nào biết id phiên bản. Vì vậy hạng mục thêm `budgetMineVersionList`
  (mục 5b) và luật 403/404 của danh sách tài liệu phiên bản là luật riêng của hạng mục, không "như `budgetVersionGet`".
- Luật người xem là hàm thuần `budgetRecordView({ isFinance, isDecider, headedCostCenterId, recordCostCenterId, versionSentAt })`
  trong `budget-attachment.policy.ts`, trả `'FULL'` (Finance, người quyết; trưởng phòng với đề xuất của Cost Center mình),
  `'AS_LAST_SENT'` (trưởng phòng với phiên bản đã gửi của Cost Center mình) hoặc `'NONE'`; `versionSentAt` = `null` cho đề xuất —
  không áp; vế đề xuất cùng nghĩa `ProposalViewService.scope`; test unit đối chiếu bảng trên.

### 5a. Trưởng phòng thấy bộ tài liệu của lần gửi gần nhất (`D-S24`)

- Owner 01/11/2026 (`D-S24`): khi phiên bản quay về Finance (`CHANGES_REQUESTED`), trưởng phòng chỉ thấy tài liệu có ở **lần gửi
  gần nhất** — gắn lúc hoặc trước `sent_at` gần nhất và không bị gỡ trước thời điểm đó; Finance và Người duyệt chi thấy tất cả.
- Hạng mục áp **một** luật `AS_LAST_SENT` cho trưởng phòng ở mọi trạng thái đã gửi. Ngoài `CHANGES_REQUESTED`, phiên bản không
  đổi tài liệu sau lần gửi gần nhất (mục 2), nên tập này đúng bằng các tệp đang `ATTACHED`; khác biệt duy nhất so với bản D-S15
  cũ: trưởng phòng **không** thấy dòng `REMOVED` gỡ trước lần gửi (lịch sử gỡ thuộc Finance và Người duyệt chi, như lịch sử phiên
  bản `budgetVersionHistoryList` chỉ hai bên đó đọc). Owner xác nhận áp luật này cho mọi trạng thái đã gửi ngày 01/11/2026; đổi sau này
  chỉ chạm `budgetRecordView` và test người xem.
- Truy vấn (repo, một câu cho trang + một câu đếm trong cùng transaction `RepeatableRead`, `:sentAt` là `budget_versions.sent_at`
  đọc trong cùng transaction):

  ```sql
  WHERE a.version_id = :versionId
    AND a.status::text IN ('ATTACHED', 'REMOVED')
    AND a.attached_at <= :sentAt
    AND (a.removed_at IS NULL OR a.removed_at > :sentAt)
  ORDER BY a.attached_at, a.id
  ```

  Mỗi dòng hiện **như lúc gửi**: `status` = `ATTACHED`, `removedAt` = `null` (một lần gỡ sau lần gửi là việc Finance đang sửa, chưa
  gửi — ẩn như tệp mới thêm). `budgetAttachmentLink` của trưởng phòng dùng cùng điều kiện: tệp ngoài tập ⟹ 404
  `BUDGET_ATTACHMENT.NOT_FOUND`; tệp đã gỡ sau lần gửi vẫn tải được (phiên bản đã mang nó khi gửi). Gửi lại ⟹ `sent_at` mới, trưởng
  phòng thấy bộ mới từ request kế.

- So thời điểm an toàn vì `attached_at`, `removed_at` và `sent_at` đều đọc đồng hồ **sau** khi giữ khóa dòng phiên bản (mục 10), nên
  thứ tự thời điểm theo đúng thứ tự khóa trong một tiến trình. Rủi ro còn lại: hai instance API lệch đồng hồ (mức mili-giây với
  NTP) và Finance gắn rồi gửi cách nhau ít hơn độ lệch đó — chấp nhận, ghi ở đây; nếu cần chính xác tuyệt đối, thay bằng cột đánh
  dấu lần gửi ở hạng mục sau.

### 5b. Trưởng phòng tìm phiên bản đã gửi (`D-S24`)

- `GET /budgets/mine/versions?year&page&pageSize` — `budgetMineVersionList`, `@RequireRoles('MANAGER')`, cùng controller và cách
  xác định Cost Center với `budgetMine` (`BudgetViewService.ownCostCenter`: Cost Center của phòng người gọi đang làm trưởng phòng
  hôm nay; không làm trưởng phòng ⟹ 403 `BUDGET.NOT_YOUR_COST_CENTER`).
- Trả các phiên bản của Cost Center đó có `sent_at IS NOT NULL`, lọc `year` tùy chọn (2000–2200), thứ tự
  `year DESC, number DESC, id ASC`, trang `page`/`pageSize` (1–100, mặc định 20), đếm và trang trong một transaction
  `RepeatableRead` (`VersionRepo.pageSentOf(costCenterId, { year?, skip, take })`, `select` đúng năm trường).
- Dòng (`mineVersionSummarySchema`, tên riêng): `{ id, year, number, state, sentAt }`, `state` ∈ `SENT`, `APPROVED`, `REJECTED`,
  `CHANGES_REQUESTED`, `SUPERSEDED`, `EXPIRED`; `sentAt` không null. **Không** số tiền, dòng, lý do hay người (`FR-5.15`(6),
  `QĐ-82m` `INF-06`); số tiền của ngân sách hiện hành vẫn chỉ ở `budgetMine`. Phiên bản của Cost Center cũ (đã thay liên kết) không
  hiện — như `budgetMine`.
- Chọn route mới thay vì nối vào `budgetMine`: thêm mảng vào `budgetMine` là mảng lồng mới trong `GET` (`API-LIST-DETAIL.1` cần
  mục registry và quyết định Owner); collection phân trang với schema dòng riêng không cần mục registry nào.
- Đề xuất không cần route khám phá mới: trưởng phòng đã liệt kê đề xuất của Cost Center mình qua `budgetProposalList`
  (`ProposalViewService.scope`).

### 6. Loại tệp, kích thước, giới hạn

| Đuôi          | `contentType` phải khai                                                   | Kiểm byte đầu (tối đa 512 byte, `IfMatch` ETag)                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pdf`         | `application/pdf`                                                         | `%PDF-`                                                                                                                                                                                                           |
| `xlsx`        | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`       | ZIP `50 4B 03 04`                                                                                                                                                                                                 |
| `docx`        | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | ZIP `50 4B 03 04`                                                                                                                                                                                                 |
| `csv`         | `text/csv`                                                                | văn bản UTF-8: BOM `EF BB BF` tùy chọn; không byte `00`; không ký tự điều khiển C0 trừ tab/LF/CR; dãy UTF-8 hợp lệ (dãy cụt chỉ được ở cuối khi tệp dài hơn 512 byte); không bắt đầu bằng chữ ký PDF/PNG/JPEG/ZIP |
| `png`         | `image/png`                                                               | `89 50 4E 47 0D 0A 1A 0A`                                                                                                                                                                                         |
| `jpg`, `jpeg` | `image/jpeg`                                                              | `FF D8 FF`                                                                                                                                                                                                        |

- Danh sách loại là hằng trong `budget-attachment.policy.ts` (Owner duyệt 01/11/2026): BRD/`QĐ-93j` chỉ nói "theo tham số tài liệu",
  và hệ thống chưa có tham số loại tệp; `xls`, `xlsm`, `doc`, `docm`, `txt`, `exe`… bị từ chối ở khai báo
  (`BUDGET_ATTACHMENT.TYPE_NOT_ALLOWED`, `details.allowed` = danh sách đuôi). Đuôi phải khớp loại khai (`bao-gia.pdf` khai
  `image/png` ⟹ từ chối).
- Tên tệp: cắt khoảng trắng hai đầu, 1–200 ký tự, không `/`, `\`, ký tự điều khiển (như `catalog`) ⟹ `BUDGET_ATTACHMENT.FILE_INVALID`
  (`details.problem` = `NAME` | `EMPTY` khi `sizeBytes` < 1). Tiếng Việt có dấu được giữ nguyên; tên tải về đi qua
  `content-disposition.ts` hiện có.
- Kích thước tối đa: tham số `DOCUMENT_MAX_SIZE_MB` (1–50, mặc định 10) đọc lúc khai báo — đúng "tham số tài liệu của hệ thống"
  (`QĐ-93j`(3), `US-04-04` AC-10) ⟹ `BUDGET_ATTACHMENT.TOO_LARGE` (`details.maxBytes`). Mô tả tham số đổi thành "The largest file
  the system keeps: a contract or purchase document, or a document of an annual budget proposal or version; a larger file is
  refused." (nhãn tiếng Việt do `qd93-parameter-labels-dashboard-queues` thêm).
- Giới hạn — **mặc định kỹ thuật của spec** (không phải quy tắc nghiệp vụ BRD; Owner duyệt cùng các mặc định kỹ thuật của spec
  01/11/2026; hằng trong `budget-attachment.policy.ts`): tối đa **20** tệp `ATTACHED` mỗi đề xuất hoặc phiên bản; `attachmentIds` ≤ 20,
  không trùng; mỗi người có tối đa **20** tệp chưa gắn (`AWAITING_UPLOAD` + `UPLOADED`) ⟹ 409 `BUDGET_ATTACHMENT.LIMIT_REACHED`
  (`details.limit`). Người chạm giới hạn (tải lại trang, gửi lỗi) tự gỡ bằng `budgetAttachmentMineList` + `budgetAttachmentDiscard`
  thay vì chờ hết hạn.
- Hết hạn — mặc định kỹ thuật như trên: `AWAITING_UPLOAD` quá 24 giờ (như ADR-0014 bổ sung 8) và `UPLOADED` chưa gắn quá 7 ngày ⟹
  `EXPIRED`.

### 7. API

Mọi route dưới `/api/v1`, envelope chuẩn, `operationId` ổn định, tag `budgets`. Route trả liên kết đặt `Cache-Control: no-store`.

| `operationId`                     | Method, path                                                    | Guard                                 | Thành công (message)                                              |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| `budgetProposalAttachmentDeclare` | `POST /budget-proposals/attachments`                            | `@RequireRoles('MANAGER')`            | 201 `{ attachment, upload }` (`BUDGET_ATTACHMENT.DECLARED`)       |
| `budgetVersionAttachmentDeclare`  | `POST /budget-versions/{id}/attachments`                        | `@RequireRoles('FINANCE')`            | 201 `{ attachment, upload }` (`BUDGET_ATTACHMENT.DECLARED`)       |
| `budgetAttachmentComplete`        | `POST /budget-attachments/{id}/complete`                        | `@RequireRoles('MANAGER', 'FINANCE')` | 200 `{ attachment }` (`BUDGET_ATTACHMENT.COMPLETED`)              |
| `budgetProposalAttachmentList`    | `GET /budget-proposals/{id}/attachments?page&pageSize`          | `@AuthenticatedOnly()`                | 200 trang `BudgetAttachmentSummary` (`BUDGET_ATTACHMENT.LISTED`)  |
| `budgetVersionAttachmentList`     | `GET /budget-versions/{id}/attachments?page&pageSize`           | `@AuthenticatedOnly()`                | 200 trang `BudgetAttachmentSummary` (`BUDGET_ATTACHMENT.LISTED`)  |
| `budgetAttachmentLink`            | `POST /budget-attachments/{id}/links`                           | `@AuthenticatedOnly()`                | 200 `{ url, expiresAt }` (`BUDGET_ATTACHMENT.LINK_ISSUED`)        |
| `budgetVersionAttachmentRemove`   | `POST /budget-versions/{id}/attachments/{attachmentId}/removal` | `@RequireRoles('FINANCE')`            | 200 `{ attachment }` (`BUDGET_ATTACHMENT.REMOVED`)                |
| `budgetMineVersionList` (`D-S24`) | `GET /budgets/mine/versions?year&page&pageSize`                 | `@RequireRoles('MANAGER')`            | 200 trang `MineVersionSummary` (`BUDGET.VERSIONS_LISTED`)         |
| `budgetAttachmentMineList`        | `GET /budget-attachments/mine?page&pageSize`                    | `@AuthenticatedOnly()`                | 200 trang `BudgetUploadSummary` (`BUDGET_ATTACHMENT.MINE_LISTED`) |
| `budgetAttachmentDiscard`         | `POST /budget-attachments/{id}/discard`                         | `@AuthenticatedOnly()`                | 200 `{ attachment }` (`BUDGET_ATTACHMENT.DISCARDED`)              |
| `budgetProposalSubmit` (đổi)      | `POST /budget-proposals`                                        | như hiện có                           | như hiện có                                                       |
| `budgetProposalResubmit` (đổi)    | `POST /budget-proposals/{id}/resubmission`                      | như hiện có                           | như hiện có                                                       |

Body khai báo (cả hai route, `z.strictObject`, cùng giới hạn hình dạng với `createDocumentBodySchema` của `catalog`): `fileName`
(string 1–400; tên sau khi cắt khoảng trắng 1–200 ký tự, ký tự cấm do policy trả `FILE_INVALID`), `contentType` (string 1–100;
loại không nhận do policy trả `TYPE_NOT_ALLOWED`), `sizeBytes` (số nguyên 0–1 000 000 000; 0 do policy trả `FILE_INVALID` `EMPTY`,
quá tham số trả `TOO_LARGE`). Hình dạng sai ⟹ 422 `VALIDATION_ERROR`. Body gửi/gửi lại thêm `attachmentIds` (mảng `uuid`,
`.max(20)`, `.refine((ids) => new Set(ids).size === ids.length, { message: 'A document is named once.' })` rồi
`.meta({ uniqueItems: true })`, tùy chọn — như `beneficiaryEmployeeIds` của `delegated-request.dto.ts:23`; `uniqueItems` chỉ là chú
thích OpenAPI, không tự từ chối trùng). Query danh sách: `page` ≥ 1 (mặc định 1), `pageSize` 1–100 (mặc định 20) — dùng lại
`pageQuery` của `budget.dto.ts`; `pageQuery` và `employeeRef` ở `1a77ffe8` là hằng **không export** (`budget.dto.ts:139`, `:163`),
Task 3 thêm `export` cho hai hằng đó (không đổi giá trị, không đổi wire).

Wire (hai schema tên riêng, để gate `API-LIST-DETAIL.1` không coi là dùng lại detail):

```ts
// Một dòng của danh sách
const budgetAttachmentSummarySchema = z.strictObject({
  id: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  status: z.enum(['ATTACHED', 'REMOVED']),
  uploadedBy: employeeRef.nullable(), // { employeeId, employeeCode, fullName } như submittedBy của đề xuất
  attachedAt: z.iso.datetime(),
  removedAt: z.iso.datetime().nullable(),
});
// Trả về từ khai báo, complete, gỡ
const budgetAttachmentSchema = z.strictObject({
  id: z.uuid(),
  target: z.enum(['PROPOSAL', 'VERSION']),
  status: z.enum(['AWAITING_UPLOAD', 'UPLOADED', 'ATTACHED', 'REMOVED', 'QUARANTINED', 'EXPIRED', 'DISCARDED']),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  uploadedBy: employeeRef.nullable(),
  createdAt: z.iso.datetime(),
  proposalId: z.uuid().nullable(),
  versionId: z.uuid().nullable(),
  attachedAt: z.iso.datetime().nullable(),
  removedAt: z.iso.datetime().nullable(),
  removedBy: employeeRef.nullable(),
});
// upload: { url, method: 'PUT', headers: { 'Content-Type', 'Content-Length' }, expiresAt }
// Một dòng của "tệp chưa gắn của tôi"
const budgetUploadSummarySchema = z.strictObject({
  id: z.uuid(),
  target: z.enum(['PROPOSAL', 'VERSION']),
  status: z.enum(['AWAITING_UPLOAD', 'UPLOADED']),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  versionId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(), // created_at + 24 giờ (AWAITING_UPLOAD) hoặc + 7 ngày (UPLOADED), tính ở policy
});
// Một dòng của budgetMineVersionList (budget.dto.ts)
const mineVersionSummarySchema = z.strictObject({
  id: z.uuid(),
  year: z.number().int(),
  number: z.number().int().positive(),
  state: z.enum(['SENT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'EXPIRED']),
  sentAt: z.iso.datetime(),
});
```

Danh sách: đề xuất trả các tệp `ATTACHED` của đề xuất; phiên bản trả `ATTACHED` và `REMOVED` (lịch sử) cho Finance và người quyết,
và tập `AS_LAST_SENT` cho trưởng phòng (mục 5a). Thứ tự `attached_at ASC, id ASC`; trang và tổng trong một transaction
`RepeatableRead`; `select` đúng trường của summary; người tải lên đọc theo lô (một lời gọi `OrganizationReadApi.getEmployees` cho cả
trang) — số câu lệnh không đổi theo số dòng (test `query-count`). `budgetAttachmentMineList`: tệp `AWAITING_UPLOAD`/`UPLOADED` có
`uploaded_by_employee_id` = người gọi, cả hai target, thứ tự `created_at DESC, id DESC`, không đọc người (chính người gọi).
`budgetMineVersionList`: mục 5b. Không mảng lồng; không mục registry `API-LIST-DETAIL.1` mới (bốn collection mới đều phân trang
có `pageSize.maximum` 100 và schema dòng tên riêng).

Mã lỗi (một mã một status; `*.errors.ts` của capability, ánh xạ ở `budget-attachment.http-errors.ts`, ví dụ OpenAPI dựng bằng
`errorExampleOf`):

| HTTP | Mã                                      | Khi nào                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 404  | `BUDGET_ATTACHMENT.NOT_FOUND`           | tệp không phải của người gọi (complete, bỏ); gỡ: id không có, không thuộc phiên bản trong path, hoặc chưa từng gắn (`AWAITING_UPLOAD`/`QUARANTINED`/`EXPIRED`/`DISCARDED`); link: người gọi không được xem bản ghi chứa nó (gồm trưởng phòng với phiên bản chưa từng gửi quyết, hoặc tệp ngoài tập `AS_LAST_SENT`), tệp chưa gắn của người khác, hoặc tệp không có bản đã kiểm để tải (`AWAITING_UPLOAD`, `QUARANTINED`, `EXPIRED`, `DISCARDED` — kể cả của chính người gọi) |
| 404  | `BUDGET.PROPOSAL_NOT_FOUND` (có sẵn)    | danh sách tài liệu của đề xuất mà người gọi không được xem hoặc không tồn tại                                                                                                                                                                                                                                                                                                                                                                                                |
| 404  | `BUDGET.VERSION_NOT_FOUND` (có sẵn)     | phiên bản không tồn tại; trưởng phòng hỏi phiên bản của Cost Center khác, hoặc phiên bản của Cost Center mình chưa từng gửi Người duyệt chi quyết (`D-S15`)                                                                                                                                                                                                                                                                                                                  |
| 403  | `AUTHORIZATION.FORBIDDEN`               | guard vai; người gọi danh sách tài liệu phiên bản không là Finance, Người duyệt chi và không làm trưởng phòng phòng nào hôm nay (lỗi mới `BudgetAttachmentNotAReaderError`, cùng mã có sẵn — không dùng lại `BudgetNotAReaderError` vì chữ của nó nói chỉ Finance và Người duyệt chi đọc); complete khi không còn vai chọn target                                                                                                                                            |
| 403  | `BUDGET.NOT_YOUR_COST_CENTER` (có sẵn)  | khai báo tệp đề xuất, hoặc `budgetMineVersionList`, khi không đang làm trưởng phòng                                                                                                                                                                                                                                                                                                                                                                                          |
| 409  | `FINANCE.SETUP_INCOMPLETE` (có sẵn)     | khai báo tệp đề xuất khi phòng chưa có Cost Center hiện hành                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 422  | `VALIDATION_ERROR`                      | body/query/path sai hình dạng; `attachmentIds` trùng hoặc > 20                                                                                                                                                                                                                                                                                                                                                                                                               |
| 422  | `BUDGET_ATTACHMENT.FILE_INVALID`        | tên rỗng/dài/ký tự cấm, `sizeBytes` < 1 (`details.problem`)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 422  | `BUDGET_ATTACHMENT.TYPE_NOT_ALLOWED`    | loại không có trong bảng mục 6 hoặc đuôi không khớp (`details.allowed`)                                                                                                                                                                                                                                                                                                                                                                                                      |
| 422  | `BUDGET_ATTACHMENT.TOO_LARGE`           | vượt `DOCUMENT_MAX_SIZE_MB` (`details.maxBytes`)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 422  | `BUDGET_ATTACHMENT.UPLOAD_MISMATCH`     | đối tượng đã lưu khác kích thước/loại khai hoặc byte đầu sai: xóa đối tượng, `QUARANTINED`                                                                                                                                                                                                                                                                                                                                                                                   |
| 422  | `BUDGET_ATTACHMENT.NOT_ATTACHABLE`      | `attachmentIds` có id không phải tệp đề xuất `UPLOADED` của người gửi (`details.attachmentIds`)                                                                                                                                                                                                                                                                                                                                                                              |
| 422  | `BUDGET.YEAR_ENDED` (có sẵn)            | phiên bản của năm đã kết thúc (khai báo, complete, gỡ)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 409  | `BUDGET.VERSION_NOT_EDITABLE` (có sẵn)  | phiên bản không ở `DRAFT`/`CHANGES_REQUESTED` hoặc đã tách                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 409  | `BUDGET_ATTACHMENT.LIMIT_REACHED`       | 20 tệp của bản ghi hoặc 20 tệp chưa gắn của người gọi (`details.limit`)                                                                                                                                                                                                                                                                                                                                                                                                      |
| 409  | `BUDGET_ATTACHMENT.NOT_AWAITING_UPLOAD` | complete lần hai, hoặc tệp đã cách ly/hết hạn                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 409  | `BUDGET_ATTACHMENT.UPLOAD_PENDING`      | đối tượng chưa tới kho; gọi lại được                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 409  | `BUDGET_ATTACHMENT.UPLOAD_EXPIRED`      | complete quá 24 giờ sau khai báo                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 409  | `BUDGET_ATTACHMENT.ALREADY_REMOVED`     | gỡ tệp đã gỡ                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 409  | `BUDGET_ATTACHMENT.NOT_DISCARDABLE`     | bỏ tệp của mình không còn `AWAITING_UPLOAD`/`UPLOADED` (đã gắn, đã gỡ, cách ly, hết hạn, đã bỏ) (`details.status`)                                                                                                                                                                                                                                                                                                                                                           |
| 503  | `SERVICE_UNAVAILABLE`                   | CSDL hoặc kho không trả lời (`toUnavailableApiException`); không bao giờ 500 hay ghi thành công                                                                                                                                                                                                                                                                                                                                                                              |

Vì sao không lộ tồn tại: danh sách đề xuất dùng 404 như `budgetProposalGet` hiện nay (`ProposalViewService.scope` có vế trưởng
phòng); danh sách tài liệu phiên bản dùng luật **riêng** của hạng mục — 403 khi người gọi không thể đọc tài liệu phiên bản nào
(quyết theo vai và "đang làm trưởng phòng hôm nay" trước khi tra bản ghi), 404 khi là trưởng phòng nhưng phiên bản thuộc Cost
Center khác hoặc chưa từng gửi quyết. `budgetVersionGet` **không** phải tiền lệ: nó chỉ nhận Finance và người quyết, trưởng phòng
nhận 403 (mục 5). `link` luôn 404 cho người không được xem. Không route nào trả tên tệp cho người không được xem (AC-15, AC-25).

### 8. Audit, lịch sử, thông báo

- Audit (`resourceType` `BUDGET_ATTACHMENT`, cùng transaction với thay đổi): `BUDGET_ATTACHMENT.DECLARED` (`after`: target,
  versionId?, fileName, contentType, sizeBytes), `.UPLOADED`, `.QUARANTINED`, `.EXPIRED` (tác nhân `SYSTEM` khi do sweeper), `.ATTACHED`
  (`after`: target, proposalId | versionId), `.REMOVED`, `.DISCARDED` (`before`: status), `.LINK_ISSUED` (`after`: `expiresAt`;
  **không** URL). Không ghi byte, URL, khóa đối tượng.
- Lịch sử phiên bản: thêm `ATTACHMENT_ADDED`, `ATTACHMENT_REMOVED` vào `BudgetVersionHistoryKind` và `budget-history.dto.ts`;
  `position`, `fromPosition`, `toPosition`, `lineCount` = null; codec `version-history-snapshot.json.ts` không đổi (đối tượng tự do).
  Mọi lần đính kèm/gỡ ở `DRAFT` và `CHANGES_REQUESTED` đều ghi một dòng (như mọi lần sửa khác — AC-26). Hình dạng `before`/`after`
  ở mục 4 (mọi giá trị là chuỗi); `budget_version_history_shape_check` được dựng lại để nhận hai `kind` mới (mục 9) — không có bước
  đó, mọi dòng lịch sử của tệp bị từ chối `23514`. `version-history.policy.ts` thêm `attachmentAdded`/`attachmentRemoved` và test
  unit khẳng định `changesOf` của hai dòng hiện `fileName`, `contentType`, `sizeBytes` (thêm) và `fileName`, `state` (gỡ).
- Không gửi thông báo hộp thư mới.

### 9. Dữ liệu và migration (Task 1, đi trước code)

Hai migration liền nhau, cùng PR và cùng bản phát hành (tên đặt theo quy tắc timestamp ở `## Dependencies and blockers`; thư mục
thứ hai sắp sau thư mục thứ nhất). Tách theo tiền lệ của repo `20261023110000_requests_need_decision_states` →
`20261023110100_requests_approval_records`: PostgreSQL không cho dùng giá trị enum vừa thêm trong chính transaction thêm nó, nên
ràng buộc dùng giá trị mới nằm ở migration sau.

**Migration 1 — `<timestamp>_budget_history_attachment_kinds`** (chỉ hai giá trị):

```sql
-- The kinds of a version's history for its documents (US-06-09 AC-26). Not reversible (DB-05): a value added to an enum is never
-- removed. PostgreSQL does not let a new enum value be used in the transaction that adds it, so the shape check that names
-- them is rebuilt in the next migration.
ALTER TYPE "BudgetVersionHistoryKind" ADD VALUE 'ATTACHMENT_ADDED';
ALTER TYPE "BudgetVersionHistoryKind" ADD VALUE 'ATTACHMENT_REMOVED';
```

**Migration 2 — `<timestamp>_budget_record_attachments`** (ràng buộc lịch sử dựng lại, bảng, trigger, index):

```sql
-- BLOCKER B1: budget_version_history_shape_check (20261029100600, lines 350-361) names the kinds it allows, so a row of a new kind
-- fails with 23514 until the check names it. Kinds are compared as text, so the check stays valid even if the two migrations are
-- ever squashed into one transaction; the three old branches are copied unchanged.
ALTER TABLE "budget_version_history" DROP CONSTRAINT "budget_version_history_shape_check";
ALTER TABLE "budget_version_history" ADD CONSTRAINT "budget_version_history_shape_check" CHECK (
    ("kind"::text = 'FIGURES_UPDATED' AND "position" IS NULL AND "from_position" IS NULL AND "to_position" IS NULL
        AND "line_count" IS NULL AND "before" IS NOT NULL AND jsonb_typeof("before") = 'object'
        AND jsonb_typeof("after") = 'object')
    OR ("kind"::text IN ('LINE_UPDATED', 'WINDOW_MOVED') AND "position" IS NOT NULL AND "position" >= 1
        AND "from_position" IS NULL AND "to_position" IS NULL AND "line_count" IS NULL
        AND "before" IS NOT NULL AND jsonb_typeof("before") = 'object' AND jsonb_typeof("after") = 'object')
    OR ("kind"::text IN ('LINES_ADDED', 'LINES_IMPORTED') AND "position" IS NULL AND "from_position" IS NOT NULL
        AND "from_position" >= 1 AND "to_position" IS NOT NULL AND "to_position" >= "from_position"
        AND "line_count" IS NOT NULL AND "line_count" BETWEEN 1 AND 200 AND "before" IS NULL
        AND jsonb_typeof("after") = 'array' AND jsonb_array_length("after") <= 200)
    OR ("kind"::text = 'ATTACHMENT_ADDED' AND "position" IS NULL AND "from_position" IS NULL AND "to_position" IS NULL
        AND "line_count" IS NULL AND "before" IS NULL AND jsonb_typeof("after") = 'object')
    OR ("kind"::text = 'ATTACHMENT_REMOVED' AND "position" IS NULL AND "from_position" IS NULL AND "to_position" IS NULL
        AND "line_count" IS NULL AND "before" IS NOT NULL AND jsonb_typeof("before") = 'object'
        AND jsonb_typeof("after") = 'object')
);

CREATE TYPE "BudgetAttachmentTarget" AS ENUM ('PROPOSAL', 'VERSION');
CREATE TYPE "BudgetAttachmentStatus" AS ENUM
    ('AWAITING_UPLOAD', 'UPLOADED', 'ATTACHED', 'REMOVED', 'QUARANTINED', 'EXPIRED', 'DISCARDED');

CREATE TABLE "budget_attachments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,              -- FK organizations
    "target" "BudgetAttachmentTarget" NOT NULL,
    "status" "BudgetAttachmentStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,                   -- UNIQUE: where the upload link puts the bytes
    "final_object_key" TEXT,                      -- UNIQUE: the copy that was looked at
    "uploaded_by_employee_id" UUID NOT NULL,      -- a value, not a FK: the history outlives the account
    "proposal_id" UUID,                           -- FK budget_proposals ON DELETE RESTRICT
    "version_id" UUID,                            -- FK budget_versions ON DELETE RESTRICT
    "attached_at" TIMESTAMPTZ(3),
    "removed_at" TIMESTAMPTZ(3),
    "removed_by_employee_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budget_attachments_pkey" PRIMARY KEY ("id")
);
```

- `ALTER TYPE … ADD VALUE` không hoàn tác được (`DB-05`) — ghi ở spec này trước merge như rule yêu cầu. Không có migration đảo;
  sau khi phát hành, hai giá trị ở lại kể cả khi tính năng bị tắt. Hai migration phải vào cùng bản phát hành: chỉ có migration 1
  thì giá trị tồn tại nhưng mọi dòng lịch sử của nó vẫn bị `23514`.
- Dựng lại `budget_version_history_shape_check` kiểm lại mọi dòng lịch sử hiện có dưới khóa `ACCESS EXCLUSIVE` của bảng (bảng chỉ
  thêm dòng, nhỏ ở mọi cài đặt hiện có; `ops:preflight` không đổi). Dòng cũ thỏa ba nhánh cũ chép nguyên văn nên không dòng nào
  bị từ chối.
- `CHECK` (so `::text` khi tham chiếu giá trị enum):
  - tên có chữ (`length(btrim(file_name)) > 0`), `size_bytes > 0`;
  - target khớp chủ: `PROPOSAL` ⟹ `version_id IS NULL`; `VERSION` ⟹ `proposal_id IS NULL AND version_id IS NOT NULL`;
  - `PROPOSAL`: `(status = 'ATTACHED') = (proposal_id IS NOT NULL)`; `UPLOADED` chỉ cho `PROPOSAL`; `REMOVED` chỉ cho `VERSION`;
  - `(status IN ('ATTACHED','REMOVED')) = (attached_at IS NOT NULL)`; `(status = 'REMOVED') = (removed_at IS NOT NULL)` và
    `(removed_at IS NULL) = (removed_by_employee_id IS NULL)`;
  - khóa cuối: `UPLOADED`/`ATTACHED`/`REMOVED` ⟹ có; `AWAITING_UPLOAD`/`QUARANTINED` ⟹ không; `EXPIRED`, `DISCARDED` có thể có (hết hạn hay bị bỏ sau khi
    đã giữ).
- Trigger `budget_attachment_guard` (`BEFORE INSERT OR UPDATE OR DELETE`, lỗi `55000` có tên constraint như `document_attachment_guard`):
  - `DELETE` ⟹ `budget_attachments_kept`; `INSERT` chỉ `AWAITING_UPLOAD`, không `proposal_id`, không khóa cuối
    (`budget_attachments_born_awaiting`);
  - cột đã khai (`id`, `organization_id`, `target`, `file_name`, `content_type`, `size_bytes`, `object_key`,
    `uploaded_by_employee_id`, `created_at`, `version_id`) không đổi (`budget_attachments_declared`); `final_object_key`,
    `proposal_id` đặt một lần (`budget_attachments_fixed`);
  - một chiều (`budget_attachments_one_way`): `AWAITING_UPLOAD` → `UPLOADED` (PROPOSAL) | `ATTACHED` (VERSION) | `QUARANTINED` |
    `EXPIRED` | `DISCARDED`; `UPLOADED` → `ATTACHED` | `EXPIRED` | `DISCARDED`; `ATTACHED` → `REMOVED` (VERSION); `REMOVED`,
    `QUARANTINED`, `EXPIRED`, `DISCARDED` cuối; so trạng thái bằng `::text` như `document_attachment_guard`;
  - khi `INSERT` một tệp `VERSION`, hoặc chuyển sang `ATTACHED`/`REMOVED`: bản ghi đích phải sửa được — phiên bản `state` ∈
    (`DRAFT`, `CHANGES_REQUESTED`) và `detached_at IS NULL`; đề xuất `state = 'SUBMITTED'` (`budget_attachments_target_locked`).
    Trigger chỉ đọc; service đã khóa dòng phiên bản trước (mục 10).
  - Hàm trigger là `LANGUAGE plpgsql` thường (`SECURITY INVOKER`, mặc định), **không** `SECURITY DEFINER`, như
    `document_attachment_guard` và `budget_version_history_reject_change`: chạy với quyền của vai runtime, không mở thêm quyền đọc
    `budget_versions`/`budget_proposals` mà vai đó chưa có.
- Index: `(proposal_id, attached_at, id)`, `(version_id, status, attached_at, id)`, `(status, created_at)` (sweeper),
  `(uploaded_by_employee_id, status, created_at)` (giới hạn chưa gắn và `budgetAttachmentMineList`).
- Prisma: `model BudgetAttachment` + hai enum trong `prisma/models/budgets.prisma`, quan hệ ngược trên `BudgetProposal`,
  `BudgetVersion`, `Organization`; `prisma migrate diff` không drift (`DB-16`).
- Vai PostgreSQL (H7): DML thường; xóa đã bị trigger chặn nên **không** cần `RUNTIME_TABLE_EXCEPTIONS`; không sequence.
- Không backfill: bảng mới rỗng; tương thích ngược hoàn toàn với dữ liệu cũ.

### 10. Transaction, khóa, đồng thời

Thứ tự khóa của budgets giữ nguyên (đề xuất → phiên bản → khóa năm) và **thêm** hai khóa ở cuối: khóa người tải lên (khóa tư vấn
theo transaction), rồi dòng tệp đính kèm theo `id` tăng dần. Chỉ hai luồng khai báo lấy khóa người tải lên, và không luồng nào giữ
dòng tệp trước khi lấy nó.

- Khai báo (cả hai target): (VERSION: `lockEditable(version)` →) `pg_advisory_xact_lock(hashtextextended('budget-attachment-uploader:'
|| employeeId, 0))` (cách khóa như `BudgetYearLockRepo`, hàm khóa ở `BudgetAttachmentRepo`) → đếm tệp chưa gắn của người đó (và
  tệp của phiên bản) → chèn tệp → audit; ký liên kết tải lên **sau** commit (như `catalog`). Khóa người tải lên chặn đua giới hạn
  20: hai lần khai báo song song của cùng người xếp hàng, lần sau đếm thấy lần trước (không bao giờ thành 21).
- Complete: ngoài transaction đọc dòng, kiểm người tải lên/trạng thái/24 giờ, rồi `UploadInspection.inspect` (head → so khai →
  `readPrefix(512, IfMatch)` → chấp nhận → `copyIfMatch` sang `budget-documents/…`). Transaction: (VERSION) `lockEditable` → khóa tệp
  `FOR UPDATE` → kiểm lại `AWAITING_UPLOAD` + giới hạn → cập nhật + lịch sử + audit. Commit lỗi ⟹ rút bản sao cuối trừ khi dòng đã
  ghi nó (như `DocumentService.withdrawCopy`); sau commit xóa khóa tạm (lỗi xóa để lifecycle rule `pending-documents/`).
- Gửi/gửi lại đề xuất: thứ tự hiện có (đề xuất được nối tiếp → khóa năm → kiểm đề xuất mở → chèn đề xuất → audit → thông báo) rồi
  khóa tệp theo `id` tăng dần → kiểm → `ATTACHED` → audit.
- Gỡ: `lockEditable(version)` → khóa tệp → kiểm → `REMOVED` + lịch sử + audit.
- Bỏ tệp chưa gắn: khóa dòng tệp `FOR UPDATE` → người tải lên = người gọi (không ⟹ 404) → `AWAITING_UPLOAD`/`UPLOADED` (không ⟹ 409
  `NOT_DISCARDABLE`) → `DISCARDED` + audit; sau commit xóa khóa tạm và khóa cuối nếu có (lỗi xóa chỉ log; khóa tạm còn lifecycle
  rule). Đua với gửi đề xuất (binder khóa cùng dòng): một bên thắng — bỏ trước ⟹ gửi nhận 422 `NOT_ATTACHABLE`; gửi trước ⟹ bỏ nhận 409. Đua với complete: complete kiểm lại `AWAITING_UPLOAD` dưới khóa dòng ⟹ 409 `NOT_AWAITING_UPLOAD` và rút bản sao cuối.
- Sweeper: mỗi tệp một transaction, chọn `FOR UPDATE SKIP LOCKED`, cập nhật có điều kiện; xóa đối tượng sau commit.
- `attached_at`, `removed_at` đọc đồng hồ **sau** `lockEditable` (như `VersionService.send` đọc `sent_at` sau khóa) — điều kiện của
  mục 5a dựa vào đó.
- Đua với gửi phiên bản / quyết định / đóng năm: các luồng đó khóa dòng phiên bản; complete/gỡ khóa phiên bản trước nên xếp hàng —
  bên sau thấy trạng thái mới: gỡ hay complete chờ sau gửi/quyết ⟹ 409 `VERSION_NOT_EDITABLE` (422 `YEAR_ENDED` khi đóng năm), tệp
  giữ nguyên; gửi chờ sau gỡ ⟹ gửi thành công và phiên bản gửi đi không còn tệp đó (trưởng phòng không thấy nó, mục 5a). Không có
  tệp gắn/gỡ trên phiên bản đã gửi. Đua gửi đề xuất ↔ sweeper: khóa dòng tệp, một bên thắng; sweeper không chờ (`SKIP LOCKED`).
- Một transaction chạy một câu một lúc (R2); không `Promise.all` trên `tx`.

### 11. Kho đối tượng và bảo mật

- Kho chỉ được **dùng** trong tiến trình API. Đồ thị module: `ObjectStorageModule` có trong `AppModule` và — đã có từ trước qua
  `CatalogModule` — trong `RecordSuperAdminEventCliModule`, vì CLI đó nạp `PersonnelModule` → `RequestsModule` →
  `CatalogModule`/`BudgetsModule` (mục _Ownership_); lệnh CLI đó không gọi route hay service tệp nào. Gate `module-graph` giữ nguyên
  kỳ vọng (ca dòng 467 chỉ duyệt các đồ thị ở dòng 263). Kho không trả lời ⟹ 503.
- Liên kết tải lên: ký `Content-Type` + `Content-Length`, sống 120 giây, khóa tạm `pending-documents/<yyyy>/<mm>/<uuid>` (dùng chung
  lifecycle rule 2 ngày đã có ở `docs/guides/containers.md`); bản đã kiểm sao sang `budget-documents/<yyyy>/<mm>/<uuid>`, không
  liên kết tải lên nào tới được.
- Liên kết tải về: 300 giây, `Content-Disposition: attachment` với tên đã khai, `Content-Type` đã khai, trỏ khóa cuối; không lưu ở
  CSDL, audit hay log; mỗi lần gọi là một liên kết và một sự kiện audit.
- Byte, tên, loại là dữ liệu không tin cậy (security rules): kiểm tên/đuôi/loại/kích thước lúc khai, so kích thước/loại đối tượng và
  byte đầu lúc complete. Hệ thống đọc tối đa 512 byte đầu để nhận dạng, **không** đọc nội dung thành dòng (`QĐ-93j`(1)).
- Rủi ro còn lại (ghi, không xử lý ở đây): không quét mã độc (ADR-0014 hệ quả); `xlsx`/`docx` chỉ kiểm chữ ký ZIP; CSV lưu
  nguyên văn (có thể chứa công thức — FE chỉ cho tải về, không hiển thị nội dung); macro trong `xlsx` bị Office từ chối mở.

### 12. Sweeper

`BudgetAttachmentExpirySweeper` (`attachment/budget-attachment-expiry.job.ts`) theo mẫu `DocumentExpirySweeper`: lần đầu sau 5
phút, mỗi giờ, timer `unref`, chỉ log khi lỗi (`describeForOperator`), an toàn khi nhiều instance. Gọi
`BudgetAttachmentExpiryService.expire(now, limit = 100)`: `AWAITING_UPLOAD` có `created_at` < now − 24 giờ (xóa khóa tạm), `UPLOADED`
có `created_at` < now − 7 ngày (xóa khóa cuối); mỗi tệp `EXPIRED` + audit `SYSTEM`. Ghi vào `docs/rules/security-jobs.md` (mục
Storage and jobs) cùng thay đổi.

### 13. Tương thích và thay đổi contract cho FE

- Thêm 10 operation (bảng mục 7), gồm `budgetMineVersionList` để màn trưởng phòng tìm phiên bản đã gửi rồi mở tài liệu của nó, và
  `budgetAttachmentMineList` + `budgetAttachmentDiscard` để FE dọn tệp chưa gắn (sau khi tải lại trang hoặc gửi lỗi) thay vì chờ
  hết hạn. Đổi tương thích: `budgetProposalSubmit`, `budgetProposalResubmit` có `attachmentIds` tùy chọn;
  không gửi ⟹ như cũ. `budgetVersionHistoryList.items[].kind` có thêm `ATTACHMENT_ADDED`, `ATTACHMENT_REMOVED` (client sinh mã
  phải chấp nhận giá trị mới). `operatingParameterList`: mô tả `DOCUMENT_MAX_SIZE_MB` đổi chữ.
- Luồng FE: chọn tệp → khai báo (`contentType` theo bảng mục 6, **không** lấy `File.type` của trình duyệt vì Windows có thể báo
  `.csv` là `application/vnd.ms-excel`) → `PUT` đúng `upload.url` với đúng `upload.headers` trong 120 giây → `complete` (409
  `UPLOAD_PENDING` ⟹ thử lại sau vài giây) → (đề xuất) gửi `attachmentIds`; (phiên bản) đã gắn sau `complete`. Tải: `link` →
  mở `url` trong 300 giây.
- Ghi thay đổi trong PR và báo FE sinh lại client; tài liệu API phía Docs sinh lại từ `openapi.json` (ngoài hạng mục).

### 14. Tệp mẫu cho FE (`docs/examples/budget-attachments/`)

Owner yêu cầu nhiều tệp mẫu để FE thử. Tệp mẫu được **sinh bằng script**, không làm tay (tệp Office làm tay không tái tạo được,
không review được):

- Bộ dựng byte thuần, tất định (không ngày giờ, không ngẫu nhiên) ở `test/support/budget-attachment-samples.ts` (≤ 400 dòng, chỉ
  Node: ZIP kiểu _stored_ tự viết + CRC32 cho `xlsx`/`docx` tối thiểu, PDF 1 trang tự viết có bảng `xref` tính offset, PNG qua
  `zlib.deflateSync`, JPEG tối thiểu là hằng byte có nguồn ghi trong comment, CSV UTF-8 có BOM với `LF`); lệnh
  `scripts/dev/write-budget-attachment-samples.ts` (chạy như `scripts/dev/export-openapi.ts`, thêm dòng vào `scripts/README.md`) ghi
  các tệp vào `docs/examples/budget-attachments/files/`. Không thêm dependency.
- Git và xuống dòng: PDF nhỏ không có byte `00`, CSV và `.txt` là văn bản, nên với `core.autocrlf=true` (Windows) Git có thể đổi
  xuống dòng khi checkout và làm lệch `sha256`. Cần một dòng **theo đường dẫn** trong `.gitattributes`:
  `docs/examples/budget-attachments/files/** -text`. `.gitattributes` mang quy tắc Owner `GATE-EOL=A` ("chỉ `openapi.json` ghim LF;
  không quy tắc toàn repo") — dòng này hẹp theo thư mục nhưng vẫn là thay đổi của tệp đó ⟹ Owner đã cho phép ngày 01/11/2026 (plan
  Task 9): thêm dòng đó và commit các tệp sinh cùng `manifest.json`.
- `manifest.json` (mảng `{ file, contentType, sizeBytes, sha256, declare: { status, code? }, complete: { status, code? } | null }`)
  ghim `sizeBytes` và `sha256` của **mọi** tệp, kể cả CSV (không còn `null`); `README.md` tiếng Việt: mục đích, lệnh sinh lại, luồng
  gọi, bảng dưới, cách thử ca không cần tệp.

| Tệp                             | `contentType` khai                                                        | Nội dung (giả, ghi rõ "tệp mẫu kiểm thử")                                                              | Kỳ vọng                               |
| ------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `bao-gia-figma-2027.pdf`        | `application/pdf`                                                         | PDF 1 trang "Báo giá Figma Organization 2027 — tệp mẫu kiểm thử", ≤ 50 KB                              | 201 → 200                             |
| `bang-tinh-ngan-sach-2027.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`       | Sheet `Ngan sach`: `Phần mềm`, `Số lượng`, `Chi phí (VND)`; `Figma`, 10, 50000000; `Miro`, 5, 20000000 | 201 → 200; không tạo dòng (AC-24)     |
| `nhu-cau-2027.csv`              | `text/csv`                                                                | UTF-8 có BOM, ba dòng: `phan_mem,so_luong,chi_phi_vnd` / `Figma,10,50000000` / `Miro,5,20000000`       | 201 → 200                             |
| `bien-ban-hop-ngan-sach.docx`   | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Một đoạn "Biên bản họp ngân sách 2027 — tệp mẫu kiểm thử"                                              | 201 → 200                             |
| `anh-chup-bao-gia.png`          | `image/png`                                                               | Ảnh nhỏ (≤ 20 KB)                                                                                      | 201 → 200                             |
| `anh-hoa-don.jpg`               | `image/jpeg`                                                              | Ảnh nhỏ (≤ 20 KB)                                                                                      | 201 → 200                             |
| `gia-mao.pdf`                   | `application/pdf`                                                         | Một dòng văn bản, không xuống dòng: `Day khong phai PDF`                                               | 201 → 422 `UPLOAD_MISMATCH` (cách ly) |
| `gia-mao.xlsx`                  | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`       | Một dòng văn bản, không xuống dòng                                                                     | 201 → 422 `UPLOAD_MISMATCH`           |
| `nhi-phan.csv`                  | `text/csv`                                                                | Bản sao byte của `anh-chup-bao-gia.png`                                                                | 201 → 422 `UPLOAD_MISMATCH`           |
| `ghi-chu.txt`                   | `text/plain`                                                              | Một dòng văn bản                                                                                       | 422 `TYPE_NOT_ALLOWED` ở khai báo     |

Ca không cần tệp (ghi trong README): `setup.exe` / `application/octet-stream`, `bang-tinh.xls`, `.xlsm`, `.doc` ⟹ 422
`TYPE_NOT_ALLOWED`; `bao-gia.pdf` khai `image/png` ⟹ 422 `TYPE_NOT_ALLOWED`; `sizeBytes` = (`DOCUMENT_MAX_SIZE_MB` + 1) × 1 048 576 ⟹
422 `TOO_LARGE` (tạo tệp lớn tại máy: `fsutil file createnew big.pdf 11534336` trên Windows, `truncate -s 11M big.pdf` trên
Linux/macOS — không commit). Test `budget-attachment-samples.integration-spec.ts` đọc `manifest.json`, so byte của bộ dựng với
`sizeBytes`/`sha256` đã ghi (và với tệp đã commit khi có), rồi chạy từng tệp qua khai báo → `PUT` (kho trong bộ nhớ với đúng byte)
→ complete và so kết quả, để tệp mẫu luôn khớp luật của server.

### 15. Tài liệu vận hành phải cập nhật cùng thay đổi

`src/modules/budgets/README.md` (capability, bảng, sweeper, hai service tách theo `max-params`), ADR-0014 (mục _Bổ sung — tệp của
hồ sơ ngân sách_: kho import bởi `CatalogModule` và `BudgetsModule`; chỉ tiến trình API dùng kho; `RecordSuperAdminEventCliModule`
nạp cả hai module qua `PersonnelModule` → `RequestsModule` nhưng không gọi tệp — **không** viết "`BudgetsModule` chỉ ở
`AppModule`"; helper `UploadInspection`), `src/infrastructure/object-storage/object-storage.module.ts` (comment),
`docs/rules/security-jobs.md` (kho và sweeper), `scripts/README.md` (lệnh sinh tệp mẫu), `docs/generated/routes.md`
(`pnpm arch:routes`), `docs/generated/module-graph.md` nếu đổi (`pnpm arch:graph`). Không đổi `ARCHITECTURE.md` (bảng tầng không
đổi).

## Quyết định đã chốt

1. Luật người xem `QĐ-93j`(3) — **Owner xác nhận 01/11/2026 (`D-S15`)**, quyết định nghiệp vụ: đề xuất — trưởng phòng của
   phòng, Finance, Người duyệt chi; phiên bản — Finance, Người duyệt chi, và trưởng phòng của phòng đó **từ khi phiên bản được
   gửi Người duyệt chi quyết** (mục 5). Đã loại (`D-S15`): trưởng phòng thấy mọi trạng thái kể cả nháp; chỉ phiên bản từng hiện
   hành.
2. Phiên bản ở _yêu cầu sửa_ (Owner duyệt 01/11/2026): cho gỡ tài liệu Người duyệt chi đã thấy — gỡ là `REMOVED`, giữ lịch sử và
   vẫn tải được. Đã loại: chỉ cho thêm.
3. Bản nộp lại tự mang tài liệu của bản trước (Owner duyệt 01/11/2026): **không** — trưởng phòng đính lại; tài liệu bản trước
   giữ nguyên.
4. Phiên bản rà soát kế thừa tài liệu của đề xuất (Owner duyệt 01/11/2026): **không** — hai bộ tách nhau; Người duyệt chi xem
   tài liệu của đề xuất nguồn qua `budgetProposalAttachmentList` (`US-06-11` AC-11).
5. Danh sách loại tệp (`pdf`, `xlsx`, `csv`, `docx`, `png`, `jpg/jpeg`) là hằng trong code (Owner duyệt 01/11/2026). Đã loại:
   tham số loại tệp riêng.
6. Giới hạn 20 tệp mỗi bản ghi, 20 tệp chưa gắn mỗi người; hết hạn 24 giờ (chưa tải lên) và 7 ngày (đã tải chưa gửi) — mặc định
   kỹ thuật của spec, Owner duyệt cùng các mặc định kỹ thuật 01/11/2026; kèm route xem/bỏ tệp chưa gắn của chính mình để giới hạn
   không chặn người dùng tới khi hết hạn.
7. Thời hạn lưu tệp hồ sơ ngân sách (Owner duyệt 01/11/2026): giữ cùng bản ghi, không tự xóa cho tới khi BRD 7.5 có dòng
   riêng.
8. Owner 01/11/2026 (`D-S24`): trưởng phòng có danh sách các phiên bản **đã gửi** của Cost Center mình (id, số, trạng thái,
   `sentAt`, năm — không số tiền, `FR-5.15`(6)) — `budgetMineVersionList`, mục 5b; khi phiên bản ở `CHANGES_REQUESTED`, trưởng phòng
   chỉ thấy tài liệu có ở lần gửi gần nhất, Finance và Người duyệt chi thấy tất cả — mục 5a (hạng mục áp cùng luật cho mọi trạng thái
   đã gửi; hệ quả duy nhất ngoài `CHANGES_REQUESTED`: trưởng phòng không thấy dòng `REMOVED`).

## Test matrix

| AC / rủi ro                             | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                                                                                                                    | Cấp test                                                                                                                                                                                                  | Kết quả mong đợi                                                                                                                                                                                                                                                                  | Bằng chứng sau implement |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `US-06-09` AC-24                        | `F1` khai báo `bao-gia-figma-2027.pdf` và `bang-tinh-ngan-sach.xlsx` vào `V10` `DRAFT` (2 dòng), `PUT`, complete                                                                                                                                                                                                       | integration `test/integration/budgets/budget-version-attachments.integration-spec.ts`                                                                                                                     | hai tệp `ATTACHED`, danh sách có tên/loại/kích thước/người tải `F1`/thời điểm; `V10` vẫn 2 dòng, tổng không đổi; audit `ATTACHED`; lịch sử 2 dòng `ATTACHMENT_ADDED`                                                                                                              | planned                  |
| `US-06-09` AC-24 từ chối                | `.exe`, `.xls`, đuôi lệch loại, vượt `DOCUMENT_MAX_SIZE_MB` (đặt 1 MB), tên rỗng; `C1`, `H1`, IT Admin, Super Admin gọi khai báo/gỡ của `V10`                                                                                                                                                                          | HTTP `test/http/budgets/budget-attachments.http-spec.ts`; integration như trên                                                                                                                            | 422 `TYPE_NOT_ALLOWED`/`TOO_LARGE`/`FILE_INVALID`, không dòng nào được chèn; 403 cho vai khác                                                                                                                                                                                     | planned                  |
| `US-06-09` AC-24 tách import            | sau khi đính kèm `.xlsx`, gọi `budgetVersionImport` với CSV dòng                                                                                                                                                                                                                                                       | integration như trên                                                                                                                                                                                      | import tạo dòng như cũ; tệp đính kèm không thành dòng và không là nguồn import                                                                                                                                                                                                    | planned                  |
| `US-06-09` AC-25                        | `V10` đã gửi quyết: `F1`, `C1`, `H1` (trưởng phòng `P-DES`) liệt kê và lấy link; `H2` (`P-ENG`), IT1, Super Admin, `E1` gọi; `H1` thôi làm trưởng phòng, `H7` nhận                                                                                                                                                     | integration `test/integration/budgets/budget-attachment-access.integration-spec.ts`                                                                                                                       | ba người đầu 200, link trỏ khóa cuối, tên/loại đã khai, 300 giây, `no-store`; `H2` 404; IT1/SA/E1 403 (danh sách) và 404 (link); `H1` mất quyền, `H7` có                                                                                                                          | planned                  |
| `US-06-09` AC-25 (`D-S15`)              | `V11` của `CC-DES` còn `DRAFT` chưa từng gửi, có tài liệu: `H1` liệt kê và lấy link; `F1`, `C1` liệt kê; `F1` gửi `V11` rồi `H1` gọi lại; bản nháp đã tách (`detached_at`, đề xuất bị rút); phiên bản đóng cuối năm chưa từng gửi; phiên bản `APPROVED`, `REJECTED`, `SUPERSEDED`, và phiên bản `EXPIRED` đã từng gửi  | integration `budget-attachment-access.integration-spec.ts`; unit `src/modules/budgets/attachment/budget-attachment.policy.spec.ts` (`budgetRecordView` × `versionSentAt`)                                 | `H1` 404 `BUDGET.VERSION_NOT_FOUND` (danh sách) / 404 `BUDGET_ATTACHMENT.NOT_FOUND` (link), không tên tệp với bản chưa từng gửi (nháp, nháp đã tách, đóng cuối năm chưa gửi); `F1`, `C1` 200; sau khi gửi `H1` 200; `APPROVED`/`REJECTED`/`SUPERSEDED`/`EXPIRED` đã gửi: `H1` 200 | planned                  |
| `D-S24` bộ tài liệu lần gửi gần nhất    | `V12` gửi với `A`, `B` (`B` gỡ trước khi gửi); `C1` yêu cầu sửa; `F1` thêm `C`, gỡ `A`; `H1` liệt kê và lấy link `A`, `B`, `C`; `F1`, `C1` liệt kê; `F1` gửi lại; `H1` liệt kê                                                                                                                                         | integration `budget-attachment-access.integration-spec.ts` (`it('shows the head only the documents of the latest send while the version is back with Finance')`); unit `budget-attachment.policy.spec.ts` | khi `CHANGES_REQUESTED`: `H1` thấy đúng `A` (`ATTACHED`, `removedAt` null), link `A` 200, `B`/`C` 404; `F1`, `C1` thấy `A` (`REMOVED`), `B` (`REMOVED`), `C`; sau gửi lại `H1` thấy đúng `C`                                                                                      | planned                  |
| `D-S24` tìm phiên bản đã gửi            | `H1` gọi `GET /budgets/mine/versions` (có/không `year`) khi `CC-DES` có `V10` gửi, `V11` nháp, `V12` `CHANGES_REQUESTED`, phiên bản năm khác; `H2`; Employee; Finance; người không làm trưởng phòng có vai `MANAGER`; 1 và 25 phiên bản                                                                                | integration `test/integration/budgets/budget-mine-versions.integration-spec.ts` (`test/support/query-count.ts`); HTTP `budget-attachments.http-spec.ts`                                                   | `H1` thấy `V10`, `V12` (không `V11`), đúng năm trường, không số tiền, thứ tự `year DESC, number DESC, id`; `H2` chỉ thấy của `CC-ENG`; Employee/Finance 403 `AUTHORIZATION.FORBIDDEN`; không làm trưởng phòng 403 `NOT_YOUR_COST_CENTER`; số câu lệnh như nhau ở hai cỡ           | planned                  |
| Tệp chưa gắn của tôi                    | `H1` khai báo 20 tệp, tải lại trang: liệt kê, bỏ 1, khai báo lại; bỏ tệp `ATTACHED`/`EXPIRED`/đã bỏ; `H2` bỏ tệp của `H1`; bỏ đua với gửi đề xuất có tệp đó; bỏ đua với complete                                                                                                                                       | integration `budget-proposal-attachments.integration-spec.ts`; HTTP `budget-attachments.http-spec.ts`                                                                                                     | danh sách đúng 20 dòng có `expiresAt`; bỏ ⟹ `DISCARDED`, audit, đối tượng bị xóa, khai báo thứ 21 được; 409 `NOT_DISCARDABLE` (`details.status`); 404 cho `H2`; đua: đúng một bên thắng (422 `NOT_ATTACHABLE` hoặc 409), không tệp vừa `ATTACHED` vừa `DISCARDED`                 | planned                  |
| `US-06-09` AC-26                        | `V10` gửi (`SENT`) → khai báo/complete/gỡ; `C1` yêu cầu sửa → `F1` đính kèm và gỡ; `V10` `APPROVED`, rồi `SUPERSEDED`/`REJECTED`/`EXPIRED` → đính kèm/gỡ                                                                                                                                                               | integration `budget-version-attachments.integration-spec.ts`                                                                                                                                              | 409 `VERSION_NOT_EDITABLE` (422 `YEAR_ENDED` khi hết năm), tài liệu giữ nguyên và tải được; ở `CHANGES_REQUESTED` được, lịch sử ghi `ATTACHMENT_ADDED`/`REMOVED` trước/sau, `budgetVersionHistoryList` hiện `fileName` của cả hai dòng và `sizeBytes` dạng chuỗi                  | planned                  |
| Gỡ: tệp sai, gỡ lần hai                 | gỡ lần hai cùng tệp; gỡ tệp của `V10` qua path `V11`; gỡ id không có; gỡ tệp `AWAITING_UPLOAD`/`QUARANTINED`/`EXPIRED` của `V10`; gỡ khi `V10` đã `SENT` với tệp đã gỡ                                                                                                                                                 | integration `budget-version-attachments.integration-spec.ts`                                                                                                                                              | 409 `ALREADY_REMOVED`; 404 `BUDGET_ATTACHMENT.NOT_FOUND` (ba ca giữa); 409 `VERSION_NOT_EDITABLE` (phiên bản kiểm trước tệp); không dòng lịch sử nào thêm                                                                                                                         | planned                  |
| Đua gỡ ↔ gửi/quyết phiên bản            | giữ khóa dòng `V10` ở kết nối riêng (gửi, rồi ca quyết `C1` yêu cầu sửa/duyệt), gỡ chờ (`pg_locks`), bên kia commit; và ngược lại: gỡ giữ khóa, gửi chờ                                                                                                                                                                | integration `budget-version-attachments` (`test/support/lock-wait.ts`)                                                                                                                                    | gỡ sau gửi/duyệt ⟹ 409 `VERSION_NOT_EDITABLE`, tệp vẫn `ATTACHED`; gửi sau gỡ ⟹ gửi được, `H1` không thấy tệp đã gỡ (mục 5a)                                                                                                                                                      | planned                  |
| Liên kết: tệp chưa có bản kiểm, hết hạn | người tải lên gọi link cho tệp `AWAITING_UPLOAD`, `QUARANTINED`, `EXPIRED`, `DISCARDED` của mình; tệp `UPLOADED` của mình; link cấp lúc `t`, đồng hồ giả `t + 301 s`                                                                                                                                                   | integration `budget-attachment-access.integration-spec.ts`; unit `budget-attachment-link.service.spec.ts`                                                                                                 | 404 `BUDGET_ATTACHMENT.NOT_FOUND` cho bốn trạng thái đầu, 200 cho `UPLOADED`; `expiresAt` = `t + 300 s` và kho được gọi với thời hạn 300 giây; hết hạn thật của URL ký chỉ kiểm ở dòng S3 thủ công của plan                                                                       | planned                  |
| `US-06-10` AC-14                        | `H1` khai báo `bao-gia-figma.pdf`, `nhu-cau-2027.xlsx`, complete, gửi đề xuất 2 dòng kèm `attachmentIds`; Finance liệt kê                                                                                                                                                                                              | integration `test/integration/budgets/budget-proposal-attachments.integration-spec.ts`                                                                                                                    | đề xuất `SUBMITTED`, 2 tài liệu `ATTACHED`, đúng 2 dòng `H1` nhập; Finance thấy danh sách; audit `ATTACHED` ×2                                                                                                                                                                    | planned                  |
| `US-06-10` AC-14 từ chối                | `.exe`/quá cỡ; Finance, `C1` gọi khai báo tệp đề xuất; `attachmentIds` có id của người khác, id `AWAITING_UPLOAD`, id đã gắn, id tệp phiên bản, id không tồn tại                                                                                                                                                       | HTTP `budget-attachments.http-spec.ts`; integration `budget-proposal-attachments`                                                                                                                         | 422/403; 422 `NOT_ATTACHABLE` liệt kê đúng id sai, **không** đề xuất nào được tạo, các tệp hợp lệ vẫn `UPLOADED`                                                                                                                                                                  | planned                  |
| `US-06-10` AC-14 trưởng phòng khác      | `H2` (trưởng phòng `P-ENG`) khai báo và complete tệp đề xuất; `H1` gửi đề xuất của `CC-DES` kèm id tệp của `H2`; `H2` gửi đề xuất của `CC-ENG` kèm id tệp của `H1`                                                                                                                                                     | integration `budget-proposal-attachments`                                                                                                                                                                 | khai báo 201 (khai báo không gắn Cost Center — tệp là tệp chưa gắn của `H2`); từ chối ở lúc gắn/gửi: 422 `NOT_ATTACHABLE` liệt kê id đó, không đề xuất nào được tạo, tệp vẫn `UPLOADED`                                                                                           | planned                  |
| `US-06-10` AC-15                        | `H1`, `F1`, `C1` liệt kê và tải tài liệu của `PR1`; `H2`, IT1, Super Admin, `E1` của `P-DES`; `H1` điều chuyển, `H7` là trưởng phòng                                                                                                                                                                                   | integration `budget-attachment-access.integration-spec.ts`                                                                                                                                                | 200 và tệp gốc (khóa cuối, tên khai); 404 cho bốn người còn lại, không tên tệp; `H7` được, `H1` 404 từ lần gọi kế                                                                                                                                                                 | planned                  |
| `US-06-10` AC-16                        | `PR1` đã nộp (và `RETURNED`, `WITHDRAWN`, `REVIEWED`, `CLOSED_FISCAL_YEAR_ENDED`): không route thêm/gỡ; dùng tệp của `PR1` trong `attachmentIds` của bản nộp lại; SQL trực tiếp gắn thêm/đổi `proposal_id`                                                                                                             | integration `budget-proposal-attachments` + `test/integration/budgets/budget-attachment-constraints.integration-spec.ts`                                                                                  | `POST/DELETE` lạ trên `/budget-proposals/{id}/attachments` 404; 422 `NOT_ATTACHABLE`; trigger từ chối `55000`; bản nộp lại nhận tệp mới, `PR1` giữ nguyên                                                                                                                         | planned                  |
| `US-06-11` AC-11                        | `C1` mở việc quyết `V1`: liệt kê tài liệu của `V1` và của đề xuất nguồn (`proposalId` của phiên bản), lấy link; `C1` gọi khai báo/gỡ của `V1` và khai báo tệp đề xuất                                                                                                                                                  | integration `budget-attachment-access`; HTTP `budget-attachments.http-spec.ts`                                                                                                                            | thấy cả hai danh sách, tải đúng tệp, số và dòng của `V1` không đổi; khai báo/gỡ 403                                                                                                                                                                                               | planned                  |
| Kiểm byte / cách ly                     | complete với đối tượng sai kích thước, sai loại lưu, byte đầu sai (từng loại trong mục 6), CSV có `00`/byte điều khiển/UTF-8 hỏng, đối tượng bị ghi lại giữa nhìn và sao (`beforeCopy`), chưa tới kho, quá 24 giờ, complete lần hai, người khác complete                                                               | unit `src/infrastructure/object-storage/file-signature.spec.ts`, `upload-inspection.spec.ts`, `src/modules/budgets/attachment/budget-attachment.policy.spec.ts`; integration `budget-version-attachments` | `UPLOAD_MISMATCH` + `QUARANTINED` + xóa đối tượng; `UPLOAD_PENDING` không đổi gì; `UPLOAD_EXPIRED` + `EXPIRED`; `NOT_AWAITING_UPLOAD`; 404                                                                                                                                        | planned                  |
| Đồng thời với gửi phiên bản             | giữ khóa dòng `V10` ở kết nối riêng (gửi), complete chờ (`pg_locks`), gửi commit                                                                                                                                                                                                                                       | integration `budget-version-attachments` (`test/support/lock-wait.ts`)                                                                                                                                    | complete 409 `VERSION_NOT_EDITABLE`, tệp `AWAITING_UPLOAD`, bản sao cuối bị rút, `V10` không có tệp mới                                                                                                                                                                           | planned                  |
| Đồng thời gửi đề xuất ↔ sweeper         | giữ khóa dòng tệp `UPLOADED` quá hạn trong transaction gửi; sweeper chạy                                                                                                                                                                                                                                               | integration `test/integration/budgets/budget-attachment-expiry.integration-spec.ts`                                                                                                                       | sweeper bỏ qua (`SKIP LOCKED`), đề xuất gắn được; không tệp nào vừa `ATTACHED` vừa `EXPIRED`                                                                                                                                                                                      | planned                  |
| Hết hạn                                 | `AWAITING_UPLOAD` 25 giờ, `UPLOADED` 8 ngày, `ATTACHED` cũ; chạy hai instance                                                                                                                                                                                                                                          | integration `budget-attachment-expiry`                                                                                                                                                                    | hai tệp đầu `EXPIRED`, audit `SYSTEM`, đối tượng bị xóa; `ATTACHED` không đổi; chạy lại không ghi thêm                                                                                                                                                                            | planned                  |
| Giới hạn                                | tệp thứ 21 của một phiên bản; tệp chưa gắn thứ 21 của một người; `attachmentIds` 21 phần tử hoặc trùng                                                                                                                                                                                                                 | integration `budget-version-attachments`, `budget-proposal-attachments`; HTTP `budget-attachments.http-spec.ts` (trùng ⟹ 422 nhờ `.refine`, không chỉ `uniqueItems`)                                      | 409 `LIMIT_REACHED`; 422 `VALIDATION_ERROR`                                                                                                                                                                                                                                       | planned                  |
| Đua giới hạn mỗi người                  | người có 19 tệp chưa gắn; kết nối A giữ khóa người tải lên trong transaction khai báo, khai báo B của cùng người chờ (`pg_locks`), A commit                                                                                                                                                                            | integration `budget-proposal-attachments` (`test/support/lock-wait.ts`)                                                                                                                                   | A 201, B 409 `LIMIT_REACHED`; đúng 20 tệp chưa gắn, không bao giờ 21                                                                                                                                                                                                              | planned                  |
| Ràng buộc DB                            | `DELETE`, đổi tên/loại/kích thước/`version_id`, nhảy trạng thái sai (gồm rời `DISCARDED`), `UPLOADED` cho `VERSION`, `REMOVED` cho `PROPOSAL`, gắn vào phiên bản `SENT` bằng SQL, chèn sẵn `ATTACHED`                                                                                                                  | integration `budget-attachment-constraints.integration-spec.ts`                                                                                                                                           | mỗi câu bị từ chối `55000`/`23514` với đúng tên constraint                                                                                                                                                                                                                        | planned                  |
| Ràng buộc lịch sử (B1)                  | chèn trực tiếp `budget_version_history` `ATTACHMENT_ADDED` (`before` null, `after` object) và `ATTACHMENT_REMOVED` (`before`, `after` object); rồi từng biến thể sai: `ADDED` có `before`, `REMOVED` không `before`, `after` là mảng, có `position`/`from_position`/`to_position`/`line_count`; một dòng mỗi `kind` cũ | integration `budget-attachment-constraints.integration-spec.ts`                                                                                                                                           | hai dòng đúng được nhận; mỗi biến thể sai bị `23514` `budget_version_history_shape_check`; `kind` cũ vẫn nhận như trước                                                                                                                                                           | planned                  |
| Danh sách (`API-LIST-DETAIL.1`)         | 1 và 25 tệp, hai trang; thứ tự `attached_at, id`; tổng khớp trang                                                                                                                                                                                                                                                      | integration `budget-attachment-access` (`test/support/query-count.ts`); gate `api-collection-contract`                                                                                                    | số câu lệnh như nhau ở hai cỡ; summary ≠ schema của khai báo; không mảng lồng                                                                                                                                                                                                     | planned                  |
| Kho không trả lời                       | `unavailable` cho `createUploadUrl`, `head`, `copyIfMatch`, `createDownloadUrl`                                                                                                                                                                                                                                        | integration `budget-version-attachments`                                                                                                                                                                  | 503 `SERVICE_UNAVAILABLE`, trạng thái không đổi                                                                                                                                                                                                                                   | planned                  |
| Tệp mẫu FE                              | từng tệp trong `docs/examples/budget-attachments/manifest.json`                                                                                                                                                                                                                                                        | integration `test/integration/budgets/budget-attachment-samples.integration-spec.ts`                                                                                                                      | đúng kỳ vọng khai báo/complete; `sizeBytes`/`sha256` khớp tệp nhị phân                                                                                                                                                                                                            | planned                  |
| Contract / OpenAPI                      | 10 operation mới có trong inventory, ví dụ lỗi đúng mã, `no-store`, 401 không token                                                                                                                                                                                                                                    | HTTP `budget-attachments.http-spec.ts`, `test/http/platform/api-inventory.http-spec.ts`, `openapi-export.http-spec.ts`                                                                                    | xanh; `openapi.json` sinh lại khớp                                                                                                                                                                                                                                                | planned                  |

Planned khác passed. Bằng chứng ghi lệnh, revision và môi trường, không chứa URL ký, token hay secret.

## Definition of Done

- [ ] Mọi primary AC `full` (`US-06-09` AC-24 → AC-26, `US-06-10` AC-14 → AC-16, `US-06-11` AC-11) có test đỏ-trước/xanh-sau ở cấp
      phù hợp; luật người xem theo `QĐ-93j`(3) đã Owner xác nhận (`D-S15`), gồm vế trưởng phòng chỉ thấy phiên bản đã gửi
      quyết.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối: `pnpm check`, `pnpm test:http` theo tệp,
      `pnpm test:integration` theo tệp của `budgets` và các suite `requests/budget-*`, `catalog/document-*` (hồi quy), `pnpm openapi:export`
      không còn diff; chạy toàn bộ `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:integration:timing` chỉ sau khi hỏi Owner
      (`D-S26`).
- [ ] Không lớp nào quá 8 tham số (`max-params`), không suppression mới; `ProposalService` vẫn 8 phụ thuộc sau khi tách
      `ProposalSender`.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi ở PR và báo FE; tệp mẫu và README có trong
      `docs/examples/budget-attachments/`.
- [ ] Không tăng legacy ledger kiến trúc, không thêm suppression ESLint, không thêm mục registry `API-LIST-DETAIL.1`.
- [ ] Module card budgets, ADR-0014 (bổ sung), `docs/rules/security-jobs.md`, tài liệu sinh (`routes.md`, `module-graph.md`) đã cập
      nhật; phần chưa kiểm chứng (kho S3 thật, CORS) ghi rõ.

## Changes and acceptance

- 01/11/2026: tạo spec/plan bản `draft` từ Docs `69e8a3d`, BE `1a77ffe8` (AI theo giao việc điều phối). Chọn phương án B (bảng riêng
  của `budgets`) — lý do ở mục 1. Chưa peer review, chưa Owner review, chưa nghiệm thu.
- 01/11/2026 — Owner duyệt các đề xuất kỹ thuật (mục 6: danh sách loại tệp, giới hạn 20, hết hạn 24 giờ/7 ngày; mục _Quyết định
  đã chốt_ 2 → 7); thiết kế vẫn draft chờ Owner review toàn spec.
- 01/11/2026 — `QĐ-93j`(3) `D-S15` (Docs chưa commit lúc ghi): luật người xem đã Owner xác nhận, bỏ nhãn _chi tiết trợ lý_; trưởng
  phòng chỉ xem/tải tài liệu của phiên bản từ khi phiên bản được gửi Người duyệt chi quyết (`sent_at IS NOT NULL`), bản chưa từng
  gửi ẩn như bản ghi không được xem (404). Sửa mục 5, mã lỗi mục 7, test matrix, plan Task người xem. AC viết lại là
  `US-06-09` AC-25 (tài liệu phiên bản).
- 01/11/2026 — sửa sau audit độc lập (AI theo giao việc điều phối; đã đối chiếu từng finding với code `1a77ffe8`; Owner
  `D-S24`, `D-S26`, Docs chưa commit): **B1** hai giá trị lịch sử mới bị `budget_version_history_shape_check` từ chối `23514` ⟹
  tách hai migration theo tiền lệ `requests_need_decision_states`, dựng lại ràng buộc bằng `"kind"::text` có hai nhánh mới (mục 9) + test ràng buộc; **H1** thêm `budgetMineVersionList` (`D-S24`, mục 5b) và sửa câu tiền lệ sai (`budgetVersionGet` trả 403
  cho trưởng phòng); **H2** tách `ProposalSender` và hai service khai báo/complete theo `max-params` 8; **M1** luật
  `AS_LAST_SENT` của trưởng phòng (mục 5a); **M2** `budgetAttachmentMineList` + `budgetAttachmentDiscard` + trạng thái
  `DISCARDED`, giới hạn/hết hạn ghi là mặc định kỹ thuật; **M3** thêm ca test (gỡ đua gửi/quyết, `ALREADY_REMOVED`, gỡ tệp sai,
  link tệp chưa có bản kiểm, link hết hạn, trưởng phòng ở mọi trạng thái, đua giới hạn mỗi người có khóa tư vấn); **Low**
  `.refine` chống trùng, export `pageQuery`/`employeeRef`, lịch sử ghi chuỗi và có `fileName` khi gỡ, tệp mẫu sinh bằng script +
  `-text` theo đường dẫn (hỏi Owner, `GATE-EOL=A`), câu "`BudgetsModule` chỉ ở `AppModule`" sửa theo đồ thị thật, hàm trigger không
  `SECURITY DEFINER`, tệp `test/support` gần trần 400 dòng có kế hoạch tách; thứ tự merge W4 và quy tắc timestamp migration. Thiết
  kế vẫn `draft`, chưa Owner review toàn spec.
- 02/11/2026 — sửa theo rà soát pre-flight cuối: quy tắc migration không sửa `scripts/verify/merged-migrations.txt`;
  dòng `.gitattributes` `-text` là việc chắc chắn (Owner cho phép 01/11/2026, bỏ nhánh "không đồng ý"); trưởng phòng
  khác khai báo tệp đề xuất nhận 201 (khai báo không gắn Cost Center), từ chối ở lúc gắn/gửi (`NOT_ATTACHABLE`) — sửa
  dòng test và thêm dòng _trưởng phòng khác_; byte ổn định của tệp mẫu kiểm bằng `--check` so `sha256` với
  `manifest.json` đã commit, không bằng `git status`; số operation +10 (312) ở Task 4 → 7.
