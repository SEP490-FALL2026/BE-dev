# policies

Mục đích: thư viện chính sách của tổ chức — bộ chính sách cố định (không có route tạo hay xóa, `R-42`), phiên bản đã xuất bản
không sửa, xác nhận đã đọc của người dùng, checklist khi quyết định và file mẫu import (`QĐ-111ao`, `QĐ-111ap`, `QĐ-111ar`,
`QĐ-111as`, `QĐ-111bi`, `QĐ-112b`). Story chính: US-01-13, US-01-14.

Tầng: T3 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: audit, notifications, organization, identity-access (đều tầng
thấp hơn). Được dùng bởi: `src/app/app.module.ts`; module trên gọi qua `public/` khi các gói sau (PL-2, PL-3) thêm cửa.

## Trạng thái

Gói PL-1 (thư viện, xác nhận đã đọc, 8 chính sách khởi tạo) và PL-3 (file mẫu import) đã nối. PL-2 (checklist khi quyết định) đã nối đủ bảy bước: nền (`PolicyChecklistApi`, bảng `decision_checklists`) ở PL-2.1; nhu cầu `1.2`, dùng dự phòng `1.6` và duyệt chi `1.7` (`requests`), đánh giá case B `1.3` (`requests/assessment-decision`), phiên bản ngân sách `4.7` (`budgets/version`), quyết định ghost seat `5.4` và đẩy sớm `5.3` (`optimization`) gọi `judge` rồi `record` trong giao dịch của quyết định; mỗi module ghi bước của mình ở README của nó.

## Public API (`public/`)

- `public/policies.types.ts` — `POLICY_ROLES`, `PolicyRole`: các vai một chính sách có thể áp dụng (cùng bộ với `identity-access`).
- `PoliciesBootstrapApi` ([public/policies-bootstrap.api.ts](public/policies-bootstrap.api.ts)): `seedInitialPolicies` — ghi 8 chính sách và bản 1 của
  mỗi chính sách trong transaction của người gọi (lệnh cài đặt; seed demo sau này), chạy lại không đổi gì, không đụng bản đã có.
  Nằm ở `policies-bootstrap-facade.module.ts` (không controller) để lệnh cài đặt không nạp cả thư viện.
- `PolicyChecklistApi` ([public/policy-checklist.api.ts](public/policy-checklist.api.ts)): `judge` (bản chính sách hiện hành của bước, đủ câu trả lời, quyết định cho phép hay khóa, lý do tự điền từ mục _Không_) rồi `record` (một dòng `decision_checklists` cho mỗi Request/dòng/phiên bản/khuyến nghị của lần quyết) trong cùng transaction với quyết định. Lỗi ở `public/policy-checklist.errors.ts`; kiểu và `checklistBodySchema` (body chung `checklist`) ở `public/policy-checklist.types.ts`. Nằm ở `policies-checklist-facade.module.ts` (không controller).
- `public/policies.extension-points.ts` — `ImportTemplateContributions` (xem mục Extension point), `ImportTemplateSource`.
- `public/policies.types.ts` còn `IMPORT_TEMPLATE_KINDS`, `IMPORT_TEMPLATE_ROLES` (ai tải mẫu nào) và `ImportTemplateDefinition`/`ImportTemplateColumn`.

## Bảng sở hữu

- `policies` (mã cố định mỗi tổ chức), `policy_versions` (mỗi bản một dòng; bản nháp là dòng có `version_number` NULL, tối đa một mỗi chính
  sách; bản xuất bản không bao giờ sửa hay xóa — trigger `policy_versions_guard`), `policy_acknowledgements` và `decision_checklists` (chỉ ghi thêm — trigger
  `policies_append_only`, quyền runtime `INSERT, SELECT`; `decision_checklists` giữ câu trả lời kèm bản chính sách cho từng thứ được quyết) ([prisma/models/policies.prisma](../../../prisma/models/policies.prisma)).
  `employee_id`, `app_user_id` là giá trị, không khóa ngoại: người thuộc module khác.

## Capability (không vòng: `reading` → `acknowledgement` → `library`)

- `library/` — kho phiên bản: `library.json.ts` (codec cột `content`: các mục văn bản và các bước có checklist), `library.repo.ts`,
  nháp (`library-draft.service.ts`: sao chép bản hiện hành, ghi đè từng trường, hủy) và xuất bản (`library-publish.service.ts`: hiệu lực ngay,
  căn cứ ban hành bắt buộc, báo in-app mọi tài khoản của vai áp dụng trong cùng transaction). Mọi ghi khóa dòng `policies` trước.
- `acknowledgement/` — `acknowledgement.policy.ts` là luật duy nhất "người này còn nợ xác nhận không" (`R-34`: V\* = bản mới nhất đòi xác nhận
  lại; bản 1 luôn đòi), `acknowledgement-facts.service.ts` (một câu cho phiên bản, một câu cho xác nhận, bất kể số chính sách),
  `acknowledgement.service.ts` (`POST` idempotent), `acknowledgement-report.service.ts` (báo cáo đã/chưa cho Super Admin).
- `initial/` — dữ liệu bản 1 của 8 chính sách (`pol-*.types.ts`, sinh từ [POLICY-SEED-DRAFT](../../../docs/reviews/fe-feedback-2026-11-11/POLICY-SEED-DRAFT.md)
  đã duyệt `QĐ-112b`), `initial-policies.policy.ts` (danh sách + căn cứ ban hành bản 1 mặc định), `initial-policies.service.ts` (ghi một lần, chạy lại an toàn). Bảy bước có
  checklist của `QĐ-111ap` nằm đúng chính sách của luồng mình; spec khóa danh sách đó.
- `checklist/` — `checklist.policy.ts` là luật thuần duy nhất (`evaluateChecklist`: bản cũ ⟹ `VERSION_CHANGED`, thiếu/thừa/trùng ⟹ `INCOMPLETE`, mục `SYSTEM` tự _Có_; `judgeDecision`: quyết định đi tiếp bị khóa khi có _Không_, từ chối/trả về lấy lý do gõ tay hoặc điền từ mục _Không_), `checklist.repo.ts` (bản hiện hành của mọi chính sách, ghi `decision_checklists`), `checklist-judge.service.ts`, `checklist-record.service.ts`. Bước nằm đúng một chính sách (thư viện giữ bộ bước cố định) nên bước tìm chính sách theo mã bước.
- `import-template/` — `GET /import-templates/{kind}?format=xlsx|csv` (`QĐ-111as`): file dựng từ định nghĩa cột do module đọc file góp vào
  (sheet _Dữ liệu_ có dòng ví dụ + sheet _Hướng dẫn_: cột, bắt buộc, định dạng, ví dụ, ràng buộc; CSV UTF-8 có BOM). Trả file thô
  (`@RawResponse`), không có mẫu sao kê. `import-template.policy.ts` giữ luật thuần (CSV, bảng hướng dẫn, ai được tải).
- `reading/` — `GET /policies`, `/policies/{code}`, `/versions`, `/steps/{stepCode}`: mọi tài khoản đọc; `myAcknowledgement` theo
  `directRoles` (vai được cấp, giống `GET /me`).

## Extension point

- Mở: `ImportTemplateContributions` (giữ ở `policies-template-facade.module.ts`, không kéo cả thư viện): mỗi module đọc file thêm một nguồn.
- Người đăng ký vào điểm mở trên: `data-import/data-import-template.listener.ts` (`employees`, `seat-baseline`), `licensing/license-key/license-key-template.listener.ts` (`license-keys`), `usage/vendor-import/vendor-import-template.listener.ts` (`usage-csv`), `budgets/proposal/budget-proposal-template.listener.ts` (`budget-proposal` — biểu mẫu `BM-10`, không parse). Mỗi nơi có spec đọc lại chính file mẫu bằng parser của mình.
- Đăng ký vào: `acknowledgement/pending-acknowledgements.listener.ts` thêm một nguồn vào `PendingPolicyAcknowledgements` của
  identity-access để `GET /me` trả `pendingPolicyAcknowledgements` (BE không chặn route nào vì chưa xác nhận — `QĐ-111ar`).

## Chưa làm

- PL-2.2…PL-2.6: từng bước quyết định (nhu cầu, dự phòng, duyệt chi, đánh giá case B, phiên bản `MF-4`, ghost seat, đẩy sớm) gọi
  `PolicyChecklistApi`; module chủ bước đã nối bước nào thì ghi ở README của module đó. Seed demo gọi `PoliciesBootstrapApi` với căn
  cứ riêng (việc của Z2). Mục `SYSTEM` của checklist chưa đối chiếu với guard thật (CS-8): PL-2 làm.
