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
   `OBJECT_STORAGE_SECRET_ACCESS_KEY`; ngoài production có giá trị mặc định cho MinIO cục bộ. `env-schema.ts` vẫn không đọc
   các biến này, nên worker và các lệnh không cần chúng.
3. Hệ thống không nhận byte của tệp: cổng chỉ ký liên kết tải lên và tải xuống, kiểm tra tệp đã lưu (`head` cho cỡ và
   loại khai báo, `readPrefix` đọc vài byte đầu để chắc tệp bắt đầu đúng như loại PDF/PNG/JPEG đã khai) và xóa. Liên kết
   mở tệp sống 300 giây, không lưu ở CSDL, Audit Trail hay log. Kho không trả lời được (mạng, quá hạn, từ chối của dịch
   vụ) là `ObjectStorageUnavailableError` và API trả 503; "không có đối tượng" đi qua nguyên vẹn để service đọc.
4. Test không dùng kho thật: cổng được thay bằng kho trong bộ nhớ (`test/support/fake-object-storage.ts`); việc kho S3
   thật từ chối liên kết quá hạn và việc ký liên kết với cấu hình thật chưa được kiểm chứng ở môi trường phát triển này.

## Hệ quả

- `module-graph.spec.ts` (H6.4) đổi từ "không đồ thị nào mount kho" thành "chỉ `AppModule` mount kho, không đồ thị nào
  mount hàng đợi".
- Deploy production của API phải đặt bốn biến kho (xem `.env.example`, `docs/guides/containers.md`) hoặc khởi động thất bại;
  đây là thay đổi vận hành cần báo trước khi triển khai.
- Tệp không có đường xóa trong lát này; vòng đời xóa, quét mã độc và lưu 24 tháng của sao kê thuộc các lát sau. Còn mở
  (hỏi Owner): liên kết tải lên dùng lại được trong 15 phút nên một tệp đã xác minh có thể bị thay trước khi gắn; chưa có
  dọn tệp chờ tải lên hay chờ gắn mà không bao giờ hoàn tất.

## Phương án đã cân nhắc

- **Không mount, chỉ lưu tên tệp**: không đạt AC (`US-04-04` đòi lưu riêng tư và liên kết có thời hạn).
- **API nhận byte rồi tự đẩy lên kho**: cổng hiện có không có thao tác ghi; thêm sẽ làm API xử lý tệp lớn và mở rộng bề
  mặt tấn công; liên kết ký có hạn để client tải trực tiếp an toàn hơn.
- **Mount ở cả worker**: worker không có Story nào dùng kho.
