# ADR-0015: Ngữ cảnh `requests` (C4) cho Request, bước duyệt và định tuyến

## Trạng thái

**Proposed** — 23/10/2026, do người phụ trách G5 (AI theo giao việc của người dùng) đề xuất khi lập
[`g5-request-submission-and-routing`](../workspace/items/g5-request-submission-and-routing/spec.md). Proposed chưa phải
Accepted: chưa có sự kiện Owner review.

## Bối cảnh

BRD 5.12.1 tách `C4` (Yêu cầu và phê duyệt: Request, ApprovalStep, lô trình duyệt chi) khỏi `C3` (cấp phát: Assignment,
ProvisioningTask) theo `ADR-07` của BRD: _quyết định cho một người dùng phần mềm_ và _việc tạo tài khoản thật phía nhà
cung cấp_ có vòng đời khác nhau. G3/G4 đã
dựng `catalog`, `finance`, `licensing` ([ADR-0013](0013-catalog-finance-licensing-contexts.md)); `licensing` đã có cổng
`GRANT_REQUEST_GATE` đang từ chối mọi Request cho tới khi ngữ cảnh Request tồn tại. G5 thêm ngữ cảnh đó.

## Quyết định

1. Một module nghiệp vụ mới `requests` (C4) sở hữu `access_requests`, `access_request_beneficiaries`,
   `access_request_steps` và các bảng tiếp theo của G5 (bản ghi phê duyệt, `request_budget_checks`, `request_finance_reviews`, lô trình `spend_batches`, hồ sơ bổ sung `request_supplements`, câu hỏi ngân sách). Theo
   [module structure](../rules/module-structure.md#layout-trong-một-module) đây là bounded context mới vì
   có bảng riêng, nghiệp vụ riêng và contract công khai riêng (cổng cấp phát).
2. **Hướng phụ thuộc:** `requests → organization, identity-access (facade), catalog, finance, budgets (facade), operating-parameters,
audit`. `requests`
   không import `licensing`; ngược lại `licensing` giữ cổng `GRANT_REQUEST_GATE` là port và `requests` hiện thực nó khi
   hạng mục nối cấp phát được giao ([`g4-request-and-transfer-integration`](../workspace/items/g4-request-and-transfer-integration/spec.md)).
   Tới lúc đó cổng mặc định vẫn từ chối, nên không có seat nào được cấp từ một Request.
3. **Ngữ cảnh khác không đọc bảng của `requests`.** Câu trả lời mà module khác cần (người giữ vai nào, Request đủ phê
   duyệt chưa) đi qua facade hoặc port của `requests`, không qua bảng.
4. **Vai Người duyệt chi và approver dự phòng** do `identity-access` giữ; nó thêm một lần đọc chỉ-đọc vào facade
   `IdentityAccessService` (`getApprovalRoleHolders`) thay vì để `requests` đọc bảng `approval_role_holders`.
5. **Chính sách chốt cứng tại lúc gửi:** nhánh, chuỗi loại bước và SLA của bước chụp vào `policy` của Request khi gửi;
   đổi tham số vận hành sau đó không đổi Request đang chạy (`US-05-02` AC-3).
6. Cảnh báo của G5 là **dẫn xuất khi đọc**, theo mẫu của G2–G4; bảng nghẽn và danh mục cảnh báo thuộc hạng mục SLA.

## Hệ quả

- `PRISMA_MODEL_OWNER` thêm ba model ở lát đầu tiên; `PUBLIC_CONTRACT_EXPORTS` chỉ thêm khi `requests` thật sự export một
  contract (cổng cấp phát, ở hạng mục nối cấp phát).
- Controller của `requests` nằm trong chính module cho tới khi một worker (nhắc SLA, `g5-step-sla-and-alerts`) cần module
  mà không cần controller; khi đó tách lớp HTTP riêng theo điều kiện 1 của rule.
- Request chưa có tiền, ngân sách hay cam kết ở lát đầu; các bảng đó thuộc các hạng mục sau của G5 và không được thêm
  trước Story dùng chúng.
