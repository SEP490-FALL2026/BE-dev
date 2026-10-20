# Spec: tệp gốc hợp đồng và chứng từ mua có kiểm soát truy cập (`US-04-04` phần hiện thực được)

- Phụ trách: AI theo giao việc Owner (lập bản đồ phân rã 20/10/2026; thiết kế và triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `57b1e1c`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

IT Admin và Finance đính kèm tệp gốc vào hợp đồng và chứng từ mua, tệp lưu riêng tư và chỉ người có quyền mở được qua liên kết có thời hạn; tệp sai loại hoặc vượt kích thước bị từ chối.

## Sizing decision

- Container: G3 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: IT Admin và Finance đính kèm tệp gốc vào hợp đồng và chứng từ mua, tệp lưu riêng tư và chỉ người có quyền mở được qua liên kết có thời hạn; tệp sai loại hoặc vượt kích thước bị từ chối.
- Boundaries: Thực thể `contracts` và `document_attachments` của `catalog`; mount `ObjectStorageModule` cho API; route tải lên/mở; liên kết ký có thời hạn không lưu.
- Not larger: Hóa đơn, quyết định gia hạn, sao kê và thiết bị cần G7/G8/G9.
- Not smaller: Hợp đồng, tệp và liên kết mở cùng một đường quyền.
- Siblings: `g3-downstream-finance-integration`, `g4-device-dependent-features`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC                           | Coverage | Phần còn lại thuộc                                                                          |
| -------- | ---------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| US-04-04 | AC-1→AC-3, AC-6, AC-9, AC-10 | partial  | AC-4→AC-7, AC-11: `g3-downstream-finance-integration`; AC-8: `g4-device-dependent-features` |

Phần `partial`, nói rõ vế đã làm và vế còn lại:

- Hạng mục làm các AC `AC-1→AC-3`, `AC-6`, `AC-9`, `AC-10` trọn vẹn **cho hai mục đích có đích gắn là Contract**: _đính kèm hợp đồng_ và _chứng từ mua_ (`BM-05`). Bốn mục đích còn lại của bảng mục đích (_chứng từ thuế nộp thay_, _bản ký_ `BM-06`, _nguồn import_, _sao kê chi phí_) có luật vai ghi đủ trong chính sách để AC-6 từ chối đúng (Finance chọn _nguồn import_ ⟹ từ chối; IT Admin chọn _sao kê chi phí_ ⟹ từ chối) nhưng **chưa dùng được**: đích gắn của chúng (hóa đơn, hồ sơ thiết bị, lần import) thuộc `g3-downstream-finance-integration`, `g4-device-dependent-features` và nhóm import sao kê.
- Vế _Người duyệt chi mở tệp của hồ sơ đang được giao quyết_ (AC-5, `OI-08a`) và hóa đơn chưa liên kết hợp đồng (AC-4) thuộc `g3-downstream-finance-integration`; ở đây Người duyệt chi không mở được tệp nào.
- Hợp đồng (`Contract`) chưa có Story riêng (`OQ-B-17`): lát này chỉ làm thực thể tối thiểu (tên, người tạo) đủ để gắn tệp; liên kết với thuê bao, nhà cung cấp, điều khoản do Story hợp đồng quyết sau.
- Hết hạn liên kết (AC-2) do kho đối tượng thi hành: hệ thống chỉ phát liên kết ký với thời hạn ngắn, không lưu và không phát lại; test chứng minh thời hạn được yêu cầu từ kho đúng giá trị và không có liên kết nào nằm trong CSDL, **không** chứng minh được kho S3 thật từ chối liên kết quá hạn (chưa kiểm chứng trên môi trường thật).

## Supporting references

`FR-1.5`, `ADR-06`, `QĐ-18`, `QĐ-19`, `QĐ-43d`, `QĐ-66h`, `TE-07`, `OQ-B-15`, `OQ-B-16`, `OQ-B-17`; `SoD-2` (trưởng phòng không mở hợp đồng).

## Explicit out of scope

Mục đích chứng từ thuế, bản ký `BM-06`, nguồn import, sao kê; hóa đơn; quyết định gia hạn; Người duyệt chi mở tệp; tệp bị cách ly do quét mã độc (trạng thái `QUARANTINED` chỉ dành cho tệp tải lên không khớp khai báo); xóa tệp; sửa hay đổi tên hợp đồng; liên kết hợp đồng với thuê bao.

## Dependencies and blockers

`g3-subscription-purchase`; `ObjectStoragePort` đang không mount (E2 = A) nên lát này mount `ObjectStorageModule` trong `catalog` và khôi phục kiểm tra cấu hình production của nó (HTTPS endpoint, bucket, thông tin xác thực); thực thể Contract chưa có Story riêng (`OQ-B-17`). Test dùng kho giả (bộ nhớ) thay cổng `OBJECT_STORAGE`; kho S3 thật chưa kiểm chứng trong môi trường này.

## Ownership: module, data, API

- Module `catalog`: capability `contract/` (`contract.policy.ts` + spec thuần: luật vai theo mục đích, loại và kích thước tệp, thời hạn liên kết, ai mở tệp; `contract.repo.ts`, `contract.service.ts`, `contracts.controller.ts`; `document.repo.ts`, `document.service.ts`, `documents.controller.ts`; `contract.dto.ts`, `document.dto.ts`, `contract.errors.ts`, `contract.http-errors.ts`); `catalog.module.ts` import `ObjectStorageModule`.
- Module `operating-parameters`: tham số `DOCUMENT_MAX_SIZE_MB` (kích thước tệp tối đa, mặc định 10) trong `parameter-definitions.ts`.
- Dữ liệu: `contracts`, `document_attachments`; `PRISMA_MODEL_OWNER`: `Contract`, `DocumentAttachment` → `catalog`.
- API (bảy operation): `POST /contracts` (`contractCreate`), `GET /contracts/{id}` (`contractGet`), `POST /documents` (`documentCreate`), `POST /documents/{id}/complete` (`documentComplete`), `POST /documents/{id}/attach` (`documentAttach`), `POST /documents/{id}/links` (`documentLink`), `GET /documents/{id}` (`documentGet`).

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                 | Kết luận                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Nguồn / loại                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Cách tải tệp lên                    | Kho chỉ có cổng ký liên kết (`createUploadUrl`, `createDownloadUrl`, `head`, `delete`), không nhận byte qua API: **ba bước**. (1) `POST /documents` khai `{ fileName, contentType, sizeBytes, purpose }`, hệ thống kiểm vai, loại, kích thước rồi tạo bản ghi `AWAITING_UPLOAD` và trả liên kết tải lên có hạn; (2) client `PUT` tệp lên kho; (3) `POST /documents/{id}/complete` hỏi kho (`head`) xem tệp có đúng kích thước và loại khai không, đúng ⟹ `PENDING_ATTACH` (chờ gắn)                      | `TE-07`; `ADR-06`              |
| Loại và kích thước (AC-10)          | Loại nhận: `application/pdf`, `image/png`, `image/jpeg` và đuôi tên tương ứng (`.pdf`, `.png`, `.jpg`, `.jpeg`); đuôi khác (như `.exe`) hay loại khác ⟹ `422 DOCUMENT.TYPE_NOT_ALLOWED`; tên rỗng, quá 200 ký tự, chứa dấu `/`, `\` hay ký tự điều khiển, hoặc tệp 0 byte ⟹ `422 DOCUMENT.FILE_INVALID` (`details.problem` là `NAME` hay `EMPTY`); kích thước ≤ `DOCUMENT_MAX_SIZE_MB` (đọc lúc tải) ⟹ vượt thì `422 DOCUMENT.TOO_LARGE` kèm `details.maxBytes`. Bị từ chối thì **không** có bản ghi và không có liên kết. Ở bước (3) kích thước hoặc loại thật khác khai ⟹ xóa tệp khỏi kho, bản ghi sang `QUARANTINED`, `422 DOCUMENT.UPLOAD_MISMATCH`, tệp không dùng được | AC-10                          |
| Mục đích và vai chọn                | `CONTRACT_ATTACHMENT` và `PURCHASE_DOCUMENT`: IT Admin và Finance; `TAX_PAYMENT_PROOF`: Finance; `SIGNATURE_RECORD`, `IMPORT_SOURCE`: IT Admin; `COST_STATEMENT`: Finance. Vai không được chọn ⟹ `403 DOCUMENT.PURPOSE_FORBIDDEN`; vai được chọn nhưng đích gắn chưa có (mọi mục đích ngoài hai mục đích trên) ⟹ `409 DOCUMENT.PURPOSE_NOT_AVAILABLE`. Employee và vai khác không được gọi route (`403`)                                                                                                 | AC-6, AC-9; `QĐ-43d`, `QĐ-66h` |
| Người tải lên                       | Luôn là người đăng nhập: DTO không có trường người tải lên hay tổ chức (chặt, gửi thêm ⟹ `422 VALIDATION_ERROR`), tổ chức là tổ chức duy nhất của hệ thống (lấy từ cài đặt, không từ yêu cầu)                                                                                                                                                                                                                                                                                                            | AC-6                           |
| Gắn và chủ sở hữu duy nhất          | `POST /documents/{id}/attach` `{ contractId }`: chỉ người tải lên, tệp ở `PENDING_ATTACH`, mục đích gắn được vào Contract, người đó còn vai được chọn mục đích; gắn xong `READY`. Tệp đã gắn gắn tiếp (vào hợp đồng khác hay cùng hợp đồng) ⟹ `409 DOCUMENT.ALREADY_ATTACHED`. CSDL giữ: tệp `READY` có đúng một chủ                                                                                                                                                                                     | AC-6; `QĐ-18`                  |
| Ai mở và khi nào                    | `POST /documents/{id}/links` (và `GET /documents/{id}`): tệp **chưa gắn** (`PENDING_ATTACH`) chỉ người tải lên thấy và mở, với người khác (cả IT Admin, Finance) **như không tồn tại** (`404`); tệp **đã gắn** (`READY`) IT Admin và Finance mở (vai kiểm lúc mở, mất vai thì mất quyền); trưởng phòng (`MANAGER`), Employee, Người duyệt chi, Super Admin ⟹ `403`, không có liên kết nào được phát. Tệp `AWAITING_UPLOAD` và `QUARANTINED` không mở được (`404` với mọi người)                          | AC-1, AC-3, AC-6; `SoD-2`      |
| Liên kết có thời hạn                | Phát `{ url, expiresAt }` từ `createDownloadUrl` với `expiresInSeconds = 300` (hằng số chính sách), **không lưu** liên kết ở đâu; mỗi lần yêu cầu là một liên kết mới và một sự kiện Audit Trail `DOCUMENT.LINK_ISSUED` (người, tệp, thời hạn; không có URL)                                                                                                                                                                                                                                             | AC-1, AC-2; `QĐ-43d`           |
| Hợp đồng tối thiểu                  | `POST /contracts` `{ name }` (1–200 ký tự sau khi cắt): chỉ `IT_ADMIN`; `GET /contracts/{id}`: `IT_ADMIN`, `FINANCE` (trưởng phòng không mở hợp đồng, `SoD-2`). Người tạo lấy từ phiên đăng nhập. Không sửa, không xóa                                                                                                                                                                                                                                                                                   | `OQ-B-17` (Owner xác nhận)     |
| Hai mục đích trùng nhau (`OQ-B-16`) | Giữ hai mục đích riêng (đúng bảng mục đích của Story); việc gộp không chặn thiết kế và để Owner quyết                                                                                                                                                                                                                                                                                                                                                                                                    | `OQ-B-16`                      |
| Mất vai sau khi tải                 | Quyền mở và gắn kiểm theo vai **hiện tại** mỗi lần gọi (lớp quyền của route), nên người đã bị thu hồi vai IT Admin không mở và không gắn được nữa                                                                                                                                                                                                                                                                                                                                                        | AC-6                           |

## Behavior and design

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-D1 | `contract.policy.ts` thuần: `assertMayChoosePurpose(purpose, roles)`, `assertPurposeAvailable(purpose)`, `assertFileAllowed({ fileName, contentType, sizeBytes, maxBytes })`, `assertUploadMatches(declared, stored)`, `mayOpen({ status, uploaderAppUserId, actor, roles })` ⟹ `OPEN`, `HIDDEN` hoặc `FORBIDDEN`, `cleanContractName`; không I/O |
| T-D2 | `document.service.ts`: mỗi bước một `TransactionRunner.run` (khóa dòng tệp `FOR UPDATE` ở bước 3 và gắn); gọi kho (`head`, `delete`) **ngoài** giao dịch rồi ghi kết quả; `contentLength` và `contentType` của `head` so với khai báo; lỗi kho ⟹ `503`                                                                                            |
| T-D3 | Khóa đối tượng do `ObjectKeyFactory.create('documents')` sinh, tên tệp gốc **không** vào khóa; tên tệp lưu ở cột, không bao giờ dùng làm đường dẫn                                                                                                                                                                                                |

### HTTP contract

Lỗi chung: 401, 403 `AUTHORIZATION.FORBIDDEN`, 422 `VALIDATION_ERROR`, 503.

| Operation (operationId)                                                                | Thành công                                                                         | Lỗi riêng                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /contracts` (`contractCreate`) — `{ name }`                                      | 201 `CONTRACT.CREATED` `{ contract }`                                              | 422 `CONTRACT.NAME_REQUIRED`                                                                                                                      |
| `GET /contracts/{id}` (`contractGet`)                                                  | 200 `CONTRACT.FETCHED` `{ contract }`                                              | 404 `CONTRACT.NOT_FOUND`                                                                                                                          |
| `POST /documents` (`documentCreate`) — `{ fileName, contentType, sizeBytes, purpose }` | 201 `DOCUMENT.CREATED` `{ document, upload: { url, method, headers, expiresAt } }` | 403 `DOCUMENT.PURPOSE_FORBIDDEN`; 409 `DOCUMENT.PURPOSE_NOT_AVAILABLE`; 422 `DOCUMENT.TYPE_NOT_ALLOWED`, `DOCUMENT.TOO_LARGE`, `DOCUMENT.FILE_INVALID`                     |
| `POST /documents/{id}/complete` (`documentComplete`)                                   | 200 `DOCUMENT.UPLOADED` `{ document }`                                             | 404 `DOCUMENT.NOT_FOUND`; 409 `DOCUMENT.NOT_AWAITING_UPLOAD`; 422 `DOCUMENT.UPLOAD_MISMATCH`                                                      |
| `POST /documents/{id}/attach` (`documentAttach`) — `{ contractId }`                    | 200 `DOCUMENT.ATTACHED` `{ document }`                                             | 404 `DOCUMENT.NOT_FOUND`, `CONTRACT.NOT_FOUND`; 409 `DOCUMENT.ALREADY_ATTACHED`, `DOCUMENT.NOT_READY_TO_ATTACH`; 403 `DOCUMENT.PURPOSE_FORBIDDEN` |
| `POST /documents/{id}/links` (`documentLink`)                                          | 200 `DOCUMENT.LINK_ISSUED` `{ url, expiresAt }`                                    | 404 `DOCUMENT.NOT_FOUND` (không có, chưa gắn của người khác, chưa tải xong, cách ly)                                                              |
| `GET /documents/{id}` (`documentGet`)                                                  | 200 `DOCUMENT.FETCHED` `{ document }`                                              | 404 `DOCUMENT.NOT_FOUND`                                                                                                                          |

Tài liệu trên dây: `Document = { id, purpose, status, fileName, contentType, sizeBytes, uploadedBy, createdAt, contractId | null, attachedAt | null }`; tên tệp lưu như khai báo (đã cắt), không dùng làm đường dẫn.

### Dữ liệu và migration

Migration `20261020250000_catalog_contracts_and_documents`: enum `DocumentPurpose` (sáu giá trị), `DocumentStatus` (`AWAITING_UPLOAD`, `PENDING_ATTACH`, `READY`, `QUARANTINED`); bảng `contracts` (`id`, `organization_id`, `name` không rỗng, `created_by_app_user_id`, `created_at`; bất biến, không xóa); bảng `document_attachments` (`id`, `organization_id`, `purpose`, `status`, `file_name`, `content_type`, `size_bytes` > 0, `object_key` duy nhất, `uploaded_by_app_user_id`, `contract_id`, `attached_at`, `created_at`; khóa ngoại `RESTRICT`; CHECK `status = 'READY' ⟺ contract_id và attached_at có giá trị`, mục đích gắn vào hợp đồng là `CONTRACT_ATTACHMENT` hoặc `PURCHASE_DOCUMENT`; trigger: tệp không xóa, `READY` bất biến, cột khai báo (mục đích, tên, loại, kích thước, khóa, người tải) không đổi). Tham số `DOCUMENT_MAX_SIZE_MB` nằm trong sổ tham số vận hành (không migration).

### Audit và bảo mật

`CONTRACT.CREATED`, `DOCUMENT.CREATED` (mục đích, tên, loại, kích thước; không URL), `DOCUMENT.UPLOADED`, `DOCUMENT.QUARANTINED` (khi không khớp), `DOCUMENT.ATTACHED` (tệp, hợp đồng), `DOCUMENT.LINK_ISSUED` (người yêu cầu, tệp, hạn; không URL). Không URL ký nào ở CSDL, Audit Trail hay log; khóa đối tượng không chứa tên tệp hay dữ liệu cá nhân; mọi route ghi cần vai `IT_ADMIN` hoặc `FINANCE`.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                                                                     | Cấp test                   | Kết quả mong đợi                              | Bằng chứng sau implement |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------- | ------------------------ |
| US-04-04 AC-1  | IT Admin tạo Contract `K1`, tải PDF (khai, tải lên kho giả, hoàn tất, gắn); Finance yêu cầu mở ⟹ 200 `{ url, expiresAt }`, `expiresInSeconds = 300` tới kho, không URL nào trong CSDL hay Audit Trail                                                                   | policy + HTTP + PostgreSQL | liên kết có thời hạn, không lưu               | chờ chạy                 |
| US-04-04 AC-2  | Kho giả mô phỏng đúng hạn của liên kết: quá `expiresAt` thì không mở được; mỗi lần yêu cầu là một liên kết khác                                                                                                                                                         | HTTP                       | không công khai (kho S3 thật chưa kiểm chứng) | chờ chạy                 |
| US-04-04 AC-3  | Trưởng phòng `H1`, Employee, Super Admin, Người duyệt chi yêu cầu mở tệp `K1` ⟹ 403, kho giả không được hỏi liên kết nào                                                                                                                                                | e2e + HTTP                 | bị từ chối, không liên kết                    | chờ chạy                 |
| US-04-04 AC-6  | `I1` tải mục đích đính kèm hợp đồng, chưa gắn: `F1` và `I2` yêu cầu mở ⟹ 404; `I1` mở được; `I1` gắn vào `K1` ⟹ `F1`, `I2` mở được; `I1` bị thu hồi vai IT Admin ⟹ không mở và không gắn được (403)                                                                     | HTTP + PostgreSQL          | quyền theo trạng thái gắn và vai hiện tại     | chờ chạy                 |
| US-04-04 AC-6  | Gửi `uploadedBy` hoặc `organizationId` ⟹ 422 (DTO chặt); người tải luôn là người đăng nhập; Finance chọn `IMPORT_SOURCE` ⟹ 403; IT Admin chọn `COST_STATEMENT` ⟹ 403; IT Admin chọn `IMPORT_SOURCE` ⟹ 409 chưa dùng được; gắn tệp đã gắn vào `K2` hoặc cùng `K1` ⟹ 409  | policy + HTTP + PostgreSQL | người tải đúng, mục đích đúng vai, một chủ    | chờ chạy                 |
| US-04-04 AC-9  | IT Admin tải báo giá, Finance tải hóa đơn với mục đích chứng từ mua và gắn vào hợp đồng ⟹ lưu được; Employee tải ⟹ 403, không bản ghi                                                                                                                                   | e2e + HTTP                 | hai vai tải được, vai khác không              | chờ chạy                 |
| US-04-04 AC-10 | `.exe`, loại lạ, tên giả đuôi (`a.pdf.exe`), 0 byte, quá `DOCUMENT_MAX_SIZE_MB` ⟹ 422, không bản ghi, không liên kết tải lên; PDF và ảnh hợp lệ được nhận; tham số đổi ⟹ giới hạn đổi; tệp thật lệch khai báo ở bước hoàn tất ⟹ tệp bị xóa khỏi kho, `QUARANTINED`, 422 | policy + HTTP + PostgreSQL | sai loại hoặc kích thước không được lưu       | chờ chạy                 |
| Hợp đồng       | Tạo với tên rỗng ⟹ 422; trưởng phòng đọc hợp đồng ⟹ 403; Finance đọc ⟹ 200; không có route sửa hay xóa                                                                                                                                                                  | e2e + HTTP                 | hợp đồng tối thiểu, quyền đọc                 | chờ chạy                 |
| Trạng thái     | Hoàn tất hai lần ⟹ 409; gắn tệp chưa tải xong ⟹ 409; mở tệp chưa tải xong hay `QUARANTINED` ⟹ 404; CSDL chặn `READY` không chủ, chủ mà không `READY`, sửa cột khai báo, xóa tệp, và gắn mục đích không thuộc hợp đồng                                                   | HTTP + constraints         | vòng đời tệp một chiều                        | chờ chạy                 |
| Cấu hình       | Mount `ObjectStorageModule` đòi endpoint HTTPS, bucket, khóa truy cập ở production, thiếu thì khởi động thất bại; môi trường test có giá trị mặc định                                                                                                                   | unit + spec cấu hình       | kiểm tra production được khôi phục            | chờ chạy                 |
| Hợp đồng API   | `api-inventory`: bảy operation mới có summary, 401/403/404/409/422/503, message riêng; manifest cập nhật                                                                                                                                                                | e2e                        | 140 operation                                 | chờ chạy                 |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: thiết kế `ready`. Quyết định cần Owner xác nhận khi review: tải tệp ba bước vì kho chỉ ký liên kết; chỉ ba loại tệp (PDF, PNG, JPEG) và giới hạn kích thước là tham số `DOCUMENT_MAX_SIZE_MB` mặc định 10; liên kết mở tệp sống 300 giây; tệp chưa gắn như không tồn tại với người khác ngoài người tải; hợp đồng tối thiểu chỉ có tên (theo `OQ-B-17`); sáu mục đích có luật vai nhưng chỉ hai dùng được; Người duyệt chi chưa mở được tệp nào; việc mount kho đối tượng trong API kéo theo biến cấu hình kho bắt buộc ở production; kho S3 thật và hết hạn liên kết thật chưa kiểm chứng ở đây. Chưa code, chưa review, chưa nghiệm thu.
