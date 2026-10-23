# Spec: toàn vẹn tệp hợp đồng — liên kết tải lên ràng buộc loại/kích thước, tệp đã xác minh bất biến, tải về dạng đính kèm

- Phụ trách: chưa phân công (đề xuất: người phụ trách catalog/contract và object storage).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — chọn cách làm tệp bất biến (sao sang khóa cuối hay `VersionId`) và
  vòng đời dọn tệp bỏ dở (ADR-0014 cần bổ sung).
- Nguồn: Docs `72e1480` (`US-04-04` AC-10 — _tệp `.exe`/vượt kích thước bị từ chối và không có tệp nào được lưu_), BE
  `69f4891`; finding `SEC-01`, `SEC-07`, `SEC-09`, `DB-13` của
  [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#5-bảo-mật-migration-transaction-và-audit).
- Nhóm roadmap: catalog — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này một tệp hợp đồng đã qua kiểm loại/kích thước/byte đầu **không thể** bị thay bằng liên kết tải lên cũ, liên kết
tải lên chỉ nhận đúng loại và kích thước đã khai, liên kết tải về buộc `attachment` với loại đã khai, cả hai liên kết trả
`Cache-Control: no-store`, và tệp bỏ dở được dọn theo vòng đời — kiểm bằng test HTTP và kiểm chứng trên kho S3/MinIO thật.

## Sizing decision

- Container: bó finding `SEC-01`, `SEC-07`, `SEC-09`, `DB-13` của review hậu merge 22/10/2026.
- Mode: `technical-enabler`.
- Outcome and owner: toàn vẹn tệp của hợp đồng; capability `catalog/contract`, `infrastructure/object-storage`.
- Boundaries: adapter S3 (presign PUT/GET), `DocumentService` (`create`, `complete`, `links`), controller tài liệu
  (header), migration mới nếu lưu khóa cuối/`VersionId`; quyền giữ nguyên (IT Admin, Finance; người tải lên trước khi gắn).
- Not larger: danh sách hợp đồng/tệp (`Q5`) chờ Owner (điểm 1 của `api-list-detail-contract-remediation`); quét mã độc
  ngoài phạm vi ADR-0014.
- Not smaller: ràng buộc liên kết, bất biến sau xác minh và tải về an toàn cùng đóng một đường tấn công (thay tệp đã xác
  minh); tách ra để lại đường còn mở.
- Siblings: `g3-contract-documents`, `secret-and-upload-hardening`.
- Scope map: n/a

## Primary Story/AC

| Story | AC       | Coverage | Phần còn lại thuộc                                                                    |
| ----- | -------- | -------- | ------------------------------------------------------------------------------------- |
| —     | `SEC-01` | n/a      | gỡ chặn `g3-contract-documents` (vế _không có tệp nào được lưu_ của `US-04-04` AC-10) |
| —     | `DB-13`  | n/a      | gỡ chặn `g3-contract-documents` (tệp bỏ dở, `complete` sớm)                           |

## Supporting references

ADR-0014 (kho đối tượng cho tệp hợp đồng; mục hệ quả ghi liên kết tải lên dùng lại 15 phút là câu hỏi mở);
`s3-compatible-object-storage.adapter.ts:41-61`, `document.service.ts:32,100-164`, `documents.controller.ts:63-96,176-193`.
Kiểm tra trực tiếp adapter hiện tại ngày 22/10/2026: dù `PutObjectCommand` nhận `ContentType`, URL sinh ra có
`X-Amz-SignedHeaders=host`; loại và kích thước chưa được chữ ký buộc vào request.

## Explicit out of scope

Quét mã độc; route liệt kê hợp đồng/tệp; bốn mục đích tài liệu còn bị từ chối (`g3-downstream-finance-integration`).

## Dependencies and blockers

Owner chọn cách bất biến (A: `CopyObject` khóa tạm → khóa cuối lúc `complete`; B: bật versioning, lưu `VersionId`). Cần môi
trường S3/MinIO thật để kiểm (ADR-0014 ghi chưa kiểm chứng kho thật). Cập nhật ADR-0014.

## Ownership: module, data, API

`infrastructure/object-storage/s3-compatible-object-storage.adapter.ts` (presign PUT có `ContentType`, `ContentLength`,
`signableHeaders`; GET có `ResponseContentDisposition`, `ResponseContentType`, `VersionId` nếu chọn B; cân nhắc
`requestChecksumCalculation: 'WHEN_REQUIRED'`), `catalog/contract/document.service.ts`, `documents.controller.ts`
(`@Header('Cache-Control', 'no-store')`), migration mới (cột khóa cuối hoặc `version_id`) nếu cần; `openapi.json` nếu header
được khai.

## Behavior and design

- `POST /documents` ký PUT với loại và kích thước đã khai (`signableHeaders: content-type, content-length`), hạn ngắn
  (đề xuất 120 giây, thay 900).
- `complete`: kiểm như hiện hành; rồi (A) sao sang khóa cuối và xóa khóa tạm, hoặc (B) lưu `VersionId` của bản đã kiểm.
  Liên kết tải về chỉ trỏ bản đã kiểm.
- `complete` gọi khi PUT chưa tới: trả lỗi có thể thử lại (409 `DOCUMENT.UPLOAD_PENDING` — mã chọn khi `ready`) thay vì
  cách ly vĩnh viễn.
- Tải về: `attachment; filename*=UTF-8''…` + loại đã khai; `Cache-Control: no-store` cho cả hai liên kết.
- Vòng đời: khóa tạm và tài liệu `AWAITING_UPLOAD` quá hạn được dọn bởi lifecycle rule của bucket (cấu hình vận hành) và
  một lệnh/worker đánh dấu hết hạn (không xóa bản ghi audit; trigger hiện cấm xóa — chọn trạng thái `EXPIRED` khi `ready`).
- Audit: thêm sự kiện khi tài liệu hết hạn/cách ly.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                  | Cấp test                      | Kết quả mong đợi                                     | Bằng chứng sau implement                                                                                                                                               |
| ----------- | ---------------------------------------------------- | ----------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-01`    | PUT lại bằng liên kết cũ sau `complete`/`attach`     | integration (kho thật) + unit | bản tải về vẫn là bản đã kiểm                        | xanh — `document-http` (mới 7), `document-constraints`, `document-final-key-migration`, `object-storage-real` (chạy trên LocalStack 3.8.1), unit `content-disposition` |
| `SEC-01`    | PUT khác `Content-Type` hoặc lớn hơn kích thước khai | integration (kho thật)        | kho từ chối chữ ký                                   | xanh — `document-http` (mới 7), `document-constraints`, `document-final-key-migration`, `object-storage-real` (chạy trên LocalStack 3.8.1), unit `content-disposition` |
| `SEC-01`    | adapter sinh URL tải lên                             | unit                          | signed headers/policy buộc loại và kích thước khai   | xanh — `document-http` (mới 7), `document-constraints`, `document-final-key-migration`, `object-storage-real` (chạy trên LocalStack 3.8.1), unit `content-disposition` |
| `SEC-07`    | phản hồi tạo liên kết tải lên/tải về                 | e2e                           | `Cache-Control: no-store`                            | xanh — `document-http` (mới 7), `document-constraints`, `document-final-key-migration`, `object-storage-real` (chạy trên LocalStack 3.8.1), unit `content-disposition` |
| `DB-13`     | `complete` trước khi PUT tới; tài liệu bỏ dở quá hạn | integration                   | lỗi thử lại được; quá hạn chuyển trạng thái có audit | xanh — `document-http` (mới 7), `document-constraints`, `document-final-key-migration`, `object-storage-real` (chạy trên LocalStack 3.8.1), unit `content-disposition` |
| `SEC-09`    | trình duyệt PUT theo liên kết ký sẵn tới MinIO/S3    | thủ công trên kho thật        | thành công; ghi bằng chứng                           | xanh — `document-http` (mới 7), `document-constraints`, `document-final-key-migration`, `object-storage-real` (chạy trên LocalStack 3.8.1), unit `content-disposition` |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — áp cho `SEC-01`,
      `DB-13`.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; ADR-0014 cập nhật; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook (lifecycle bucket) đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 08. Chưa code, chưa review, chưa nghiệm thu.

23/10/2026 (Prompt 10 — xử lý tồn đọng G0→G4): `SEC-01`, `SEC-07`, `DB-13` hiện thực theo **phương án A** (sao sang khóa cuối, kèm `If-Match`) — xem bổ sung ADR-0014 ngày 23/10/2026; migration `20261022130000_document_final_key_and_expiry` (`final_object_key`, trạng thái `EXPIRED`, trigger). `SEC-09` (trình duyệt PUT qua CORS) **chưa kiểm chứng**: chỉ có kiểm adapter thật bằng LocalStack (không phải MinIO/S3). Áp dụng **mặc định do spec khuyến nghị**, không phải quyết định của Owner: Owner chưa review; nếu Owner chọn khác thì đổi ở đây. Kiểm chứng: `document-http` (mới 7), `document-constraints`, `document-final-key-migration`, `object-storage-real` (chạy trên LocalStack 3.8.1), unit `content-disposition` — xanh trên cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026. Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. Giới hạn: Chưa có hạn cho tệp `PENDING_ATTACH` không bao giờ được gắn; lifecycle rule/CORS của bucket là cấu hình vận hành chưa kiểm chứng. Chưa commit khi viết dòng này, chưa remote CI, chưa Owner review, chưa nghiệm thu: không có gì là `accepted`; đỏ-trước của từng test không được ghi lại.
