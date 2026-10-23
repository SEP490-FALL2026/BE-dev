# ADR-0014: API mount lại kho đối tượng cho tệp của hợp đồng

## Trạng thái

**Proposed** — 20/10/2026, do người phụ trách G3/G4 (AI theo giao việc Owner) đề xuất khi làm
[`g3-contract-documents`](../workspace/items/g3-contract-documents/spec.md). Chờ Owner review; Proposed chưa phải Accepted.

## Bối cảnh

Owner đã chọn E2 = A ([audit H4.0](../reviews/be-full-src-architecture-audit-2026-10-19/README.md), H6.4): không đồ thị nào
mount `ObjectStorageModule` hay `QueueInfrastructureModule` khi chưa có Story nào lưu tệp hay dùng hàng đợi; hai module
được giữ nguyên source, và Story nào cần chúng thì mount lại kèm kiểm tra cấu hình production. `US-04-04` (tệp gốc hợp
đồng, chứng từ mua, liên kết mở có thời hạn) là Story đầu tiên lưu tệp, và nó thuộc G3.

## Quyết định

1. **Chỉ API** mount `ObjectStorageModule`, qua `CatalogModule` (nơi `contract/` dùng cổng `OBJECT_STORAGE`); worker, CLI
   khôi phục và CLI khởi tạo không mount nó. `QueueInfrastructureModule` vẫn không đồ thị nào mount.
2. Kiểm tra cấu hình của kho chạy khi module được mount (factory gọi `object-storage.config.ts`): production bắt buộc
   `OBJECT_STORAGE_ENDPOINT` HTTPS, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`,
   `OBJECT_STORAGE_SECRET_ACCESS_KEY`; **chỉ `NODE_ENV=test`** có giá trị mặc định (MinIO cục bộ); mọi môi trường khác phải
   đặt thông tin xác thực của riêng mình, và `minioadmin` hay access key trùng secret key bị từ chối (`SEC-04`, 23/10/2026).
   `env-schema.ts` vẫn không đọc các biến này, nên worker và các lệnh không cần chúng.
3. Hệ thống không nhận byte của tệp: cổng chỉ ký liên kết tải lên và tải xuống, kiểm tra tệp đã lưu (`head` cho cỡ và
   loại khai báo, `readPrefix` đọc vài byte đầu để chắc tệp bắt đầu đúng như loại PDF/PNG/JPEG đã khai) và xóa. Liên kết
   mở tệp sống 300 giây, không lưu ở CSDL, Audit Trail hay log. Kho không trả lời được (mạng, quá hạn, từ chối của dịch
   vụ) là `ObjectStorageUnavailableError` và API trả 503; "không có đối tượng" đi qua nguyên vẹn để service đọc.
4. Test của HTTP không dùng kho thật: cổng được thay bằng kho trong bộ nhớ (`test/support/fake-object-storage.ts`).

### Bổ sung 23/10/2026 — toàn vẹn của tệp đã kiểm (`SEC-01`, `SEC-07`, `DB-13`; phương án A, do người phụ trách chọn)

Owner chưa chọn phương án; phương án **A** (sao sang khóa cuối) được áp dụng theo thứ tự ưu tiên của spec
[`contract-document-upload-integrity`](../workspace/items/contract-document-upload-integrity/spec.md) vì không đòi bật
versioning của bucket. Không phải Owner review hay chấp nhận; đổi sang B vẫn là một quyết định mở.

5. Liên kết tải lên **ký cả `Content-Type` lẫn `Content-Length`** (`X-Amz-SignedHeaders=content-length;content-type;host`) và
   sống **120 giây** (trước đây 900). SDK không tự thêm checksum vào liên kết ký (`requestChecksumCalculation: WHEN_REQUIRED`),
   vì một checksum mà trình duyệt không tính được làm hỏng chính lần tải lên.
6. Tệp tải lên nằm ở khóa tạm `pending-documents/…`. `complete` đọc `head` (có `ETag`), đọc vài byte đầu **kèm `IfMatch`
   ETag đó**, rồi `CopyObject` sang khóa cuối `documents/…` **kèm `CopySourceIfMatch`**; chỉ sau đó mới xóa khóa tạm. Liên
   kết tải lên cũ dùng lại sau khi kiểm chỉ ghi được vào khóa tạm, không bao giờ vào bản đã kiểm; đối tượng bị ghi lại giữa lúc
   nhìn và lúc sao là `PreconditionFailed` ⟹ cách ly. Khóa cuối nằm ở cột mới `final_object_key` (đặt một lần, trigger cấm đổi;
   `CHECK` chỉ `PENDING_ATTACH`/`READY` mới có). Liên kết tải về trỏ khóa cuối.
7. Liên kết tải về buộc `Content-Disposition: attachment; filename="…"; filename*=UTF-8''…` và `Content-Type` đã khai
   (`response-content-*`); phản hồi tạo liên kết (tải lên, tải về) có `Cache-Control: no-store`.
8. `complete` khi đối tượng **chưa tới kho** trả 409 `DOCUMENT.UPLOAD_PENDING` (thử lại được), không cách ly. Tệp `AWAITING_UPLOAD`
   quá 24 giờ chuyển `EXPIRED` (trạng thái cuối, sự kiện Audit `DOCUMENT.EXPIRED`, xóa đối tượng nếu có): ngay khi gọi
   `complete` quá hạn (409 `DOCUMENT.UPLOAD_EXPIRED`) hoặc theo `DocumentExpirySweeper` mỗi giờ của API (lần đầu sau 5 phút).
9. **Kiểm chứng trên kho giao thức S3 thật:** `test/integration/object-storage-real.integration-spec.ts` chạy adapter thật với
   `TEST_OBJECT_STORAGE_ENDPOINT` (không có thì bị bỏ qua và nói lý do). Đã chạy 23/10/2026 trên **LocalStack 3.8.1** (kiểm chữ
   ký) — không phải MinIO hay AWS S3: ký đúng thì nhận, sai `Content-Type`/lớn hơn/nhỏ hơn thì 403, `If-Match` sai thì
   `PreconditionFailed` và không sao chép, tải về trả đúng `Content-Disposition`/`Content-Type`. Chưa kiểm chứng: trình duyệt PUT
   bằng liên kết ký sẵn qua CORS tới MinIO/S3 thật (`SEC-09` — việc thủ công), lifecycle rule của bucket.

## Hệ quả

- `module-graph.spec.ts` (H6.4) đổi từ "không đồ thị nào mount kho" thành "chỉ `AppModule` mount kho, không đồ thị nào
  mount hàng đợi".
- Deploy production của API phải đặt bốn biến kho (xem `.env.example`, `docs/guides/containers.md`) hoặc khởi động thất bại;
  đây là thay đổi vận hành cần báo trước khi triển khai.
- Tệp không có đường xóa trong lát này; vòng đời xóa, quét mã độc và lưu 24 tháng của sao kê thuộc các lát sau. Đã đóng ở bổ
  sung 23/10/2026: việc tệp đã xác minh bị thay bằng liên kết tải lên cũ, và tệp chờ tải lên bỏ dở (chuyển `EXPIRED`). Còn mở:
  tệp `PENDING_ATTACH` không bao giờ được gắn (chưa có hạn); đối tượng mồ côi nếu sao chép xong mà ghi CSDL lỗi, và khóa tạm mà
  xóa thất bại — dọn bằng **lifecycle rule của bucket** cho tiền tố `pending-documents/` (đề xuất 2 ngày; cấu hình vận hành,
  chưa kiểm chứng), kèm CORS cho `PUT` từ miền của FE (`SEC-09`).

## Phương án đã cân nhắc

- **Không mount, chỉ lưu tên tệp**: không đạt AC (`US-04-04` đòi lưu riêng tư và liên kết có thời hạn).
- **API nhận byte rồi tự đẩy lên kho**: cổng hiện có không có thao tác ghi; thêm sẽ làm API xử lý tệp lớn và mở rộng bề
  mặt tấn công; liên kết ký có hạn để client tải trực tiếp an toàn hơn.
- **Mount ở cả worker**: worker không có Story nào dùng kho.
