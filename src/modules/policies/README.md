# policies

Mục đích: thư viện chính sách của tổ chức — bộ chính sách cố định (không có route tạo hay xóa, `R-42`), phiên bản đã xuất bản
không sửa, xác nhận đã đọc của người dùng, checklist khi quyết định và file mẫu import (`QĐ-111ao`, `QĐ-111ap`, `QĐ-111ar`,
`QĐ-111as`, `QĐ-111bi`, `QĐ-112b`). Story chính: US-01-13, US-01-14.

Tầng: T3 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: audit, notifications, organization, identity-access (đều tầng
thấp hơn). Được dùng bởi: `src/app/app.module.ts`; module trên gọi qua `public/` khi các gói sau (PL-2, PL-3) thêm cửa.

## Trạng thái

Gói PL-1 (thư viện, xác nhận đã đọc, 8 chính sách khởi tạo) đã nối; PL-2 (checklist khi quyết định) và PL-3 (file mẫu import) chưa có.

## Public API (`public/`)

- `public/policies.types.ts` — `POLICY_ROLES`, `PolicyRole`: các vai một chính sách có thể áp dụng (cùng bộ với `identity-access`).
- `PoliciesBootstrapApi` ([public/policies-bootstrap.api.ts](public/policies-bootstrap.api.ts)): `seedInitialPolicies` — ghi 8 chính sách và bản 1 của
  mỗi chính sách trong transaction của người gọi (lệnh cài đặt; seed demo sau này), chạy lại không đổi gì, không đụng bản đã có.
  Nằm ở `policies-bootstrap-facade.module.ts` (không controller) để lệnh cài đặt không nạp cả thư viện.
- Chưa có `PolicyChecklistApi`; thêm ở PL-2.

## Bảng sở hữu

- `policies` (mã cố định mỗi tổ chức), `policy_versions` (mỗi bản một dòng; bản nháp là dòng có `version_number` NULL, tối đa một mỗi chính
  sách; bản xuất bản không bao giờ sửa hay xóa — trigger `policy_versions_guard`), `policy_acknowledgements` (chỉ ghi thêm — trigger
  `policies_append_only`, quyền runtime `INSERT, SELECT`) ([prisma/models/policies.prisma](../../../prisma/models/policies.prisma)).
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
- `reading/` — `GET /policies`, `/policies/{code}`, `/versions`, `/steps/{stepCode}`: mọi tài khoản đọc; `myAcknowledgement` theo
  `directRoles` (vai được cấp, giống `GET /me`).

## Extension point

- Mở: chưa có (PL-3 mở `ImportTemplateContributions`).
- Đăng ký vào: `acknowledgement/pending-acknowledgements.listener.ts` thêm một nguồn vào `PendingPolicyAcknowledgements` của
  identity-access để `GET /me` trả `pendingPolicyAcknowledgements` (BE không chặn route nào vì chưa xác nhận — `QĐ-111ar`).

## Chưa làm

- PL-2 checklist khi quyết định; PL-3 file mẫu import. Seed demo gọi `PoliciesBootstrapApi` với căn cứ riêng (việc của Z2). Mục `SYSTEM` của
  checklist chưa đối chiếu với guard thật (CS-8): PL-2 làm.
