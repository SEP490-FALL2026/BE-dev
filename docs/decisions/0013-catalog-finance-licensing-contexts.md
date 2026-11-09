# ADR-0013: Ba ngữ cảnh `catalog`, `finance` và `licensing` thay mẫu catalog cũ

## Trạng thái

**Proposed** — 20/10/2026, do người phụ trách G3/G4 (AI theo giao việc Owner) đề xuất khi lập
[`g3-catalog-foundation`](../workspace/items/g3-catalog-foundation/spec.md). Owner đã chọn hướng "G3 quyết giữ, thay hay
loại" (E1 = A, [audit H4.0](../reviews/be-full-src-architecture-audit-2026-10-19/README.md)). Proposed chưa phải Accepted
và chưa phải đã triển khai: chỉ mẫu cũ được gỡ ở lát này; ba module mới xuất hiện cùng lát Story đầu tiên dùng chúng.

> _Annotation trạng thái triển khai (22/10/2026, `delivery-gate-hardening`, `DB-17`):_ câu _chưa phải đã triển khai_ ở trên
> đã cũ. Ba module `catalog`, `finance`, `licensing` đã merge vào `dev` (PR #14, `4e7097f`) đúng hướng
> `licensing → catalog → finance`: `CatalogModule` chỉ export facade `CatalogService`, `licensing` import nó, `finance`
> không import `catalog`, không `forwardRef` (kiểm ở `0198456`). Trạng thái quyết định **vẫn `Proposed`**: chưa có sự kiện
> Owner review/Accepted; annotation này không đổi nội dung quyết định.

## Bối cảnh

BRD 5.12.1 chia hệ thống thành tám ranh giới ngữ cảnh. G3/G4 chạm ba ranh giới: `C1` danh mục & hợp đồng (ứng dụng,
nhà cung cấp, gói, thuê bao), `C3` cấp phát (Assignment, tác vụ cấp phát, kho khóa) và `C7` tài chính (tỷ giá, hồ sơ
thuế, phân bổ). Mẫu `catalog` cũ (bảng `catalog_applications` với `slug`, `vendor` dạng chuỗi, không loại đối tượng,
không Business Owner, chưa mount) không phục vụ ranh giới nào trong số đó và đã được ghi là không phải mẫu kiến trúc.

## Quyết định

1. **Thay**, không giữ và không chuyển đổi: bảng và source mẫu cũ bị gỡ (migration
   `20261020090000_drop_catalog_sample`); bảng chưa bao giờ chứa dữ liệu nghiệp vụ.
2. Ba module nghiệp vụ, mỗi module một ranh giới (đồng bộ với [module structure](../rules/module-structure.md)):
   - `catalog` (C1): ứng dụng, nhà cung cấp, từ điển nhà cung cấp, gói, thuê bao, bộ công cụ chuẩn, hợp đồng và tệp.
   - `finance` (C7, phần của G3): tỷ giá, hồ sơ thuế nhà cung cấp, phân bổ chi phí gói tính tiền chung.
   - `licensing` (C3): Assignment, tác vụ cấp phát, kho khóa bản quyền.
3. **Hướng phụ thuộc:** `licensing → catalog → finance`, và cả ba đọc `organization` qua facade của nó. `finance` chỉ giữ
   khóa ngoại ở CSDL tới bảng `catalog` (ví dụ nhà cung cấp), không import `catalog`.
4. **Chiều ngược** (ngừng ứng dụng và giảm số seat thuê bao cần biết Assignment đang chiếm chỗ) đi qua **đăng ký chặn**
   mà `licensing` nạp vào `catalog` lúc khởi tạo module, không `forwardRef` và không để `catalog` import `licensing`.
5. Tiền theo [ADR-0007](0007-money-representation.md) ở `src/core/money`; module nghiệp vụ không tự tính tiền.
6. Cảnh báo của G3/G4 là **dẫn xuất khi đọc** như `GET /department-warnings` của G2; hộp thông báo trong ứng dụng và
   danh mục cảnh báo thuộc G5/G8 (`US-05-15`, `US-12-15`).

## Hệ quả

- `PRISMA_MODEL_OWNER`, `PUBLIC_CONTRACT_EXPORTS` và registry nội module chỉ đổi khi từng module thật sự được thêm.
- Mỗi lát phải ghi điều kiện Nest submodule theo rule (ví dụ lớp HTTP riêng khi CLI/worker không cần controller).
- 20/10/2026 (`g4-seat-baseline-import`): module `licensing` xuất hiện cùng Story đầu tiên dùng nó, đọc `catalog` qua facade `CatalogService` (hướng `licensing → catalog`) và `organization` qua facade của nó; `data-import` ghi Assignment qua facade `LicensingService`. Controller của `catalog` và `licensing` vẫn nằm trong chính module vì chưa có worker hay lệnh nào import chúng; khi có thì tách lớp HTTP. Đăng ký chặn chiều ngược (mục 4) dựng ở `g3-subscription-seat-guards`: `catalog` định nghĩa hợp đồng `SeatOccupancyReader` (`catalog.types.ts`) và `SeatOccupancyRegistry`; `licensing` nạp bản hiện thực (`AssignmentSeatOccupancy`) khi `OnModuleInit`, không `forwardRef` và `catalog` không import `licensing`; không có người đọc nào đăng ký thì quy tắc cần số chỗ ném lỗi cấu hình thay vì cho qua. Người dùng đầu tiên là số seat không giảm dưới số đang chiếm, khuyến nghị K2 và (ở `g3-catalog-retire`) danh sách chặn khi ngừng ứng dụng. ADR vẫn `Proposed`.
- Nếu sau này `finance` cần đọc `catalog` (ví dụ báo cáo chi theo ứng dụng), quyết định ở lát đó bằng một facade có chiều
  `finance → catalog` đảo ngược hướng ở mục 3, và cập nhật ADR này.

## Phương án đã cân nhắc

- **Giữ mẫu cũ làm nền**: sai lược đồ ngay từ cột đầu; mỗi Story sẽ phải đổi bảng nền.
- **Một module `catalog` chứa cả C1/C3/C7**: nhanh hơn lúc đầu nhưng vượt ngưỡng kích thước module và trộn quyền của
  IT Admin (danh mục, cấp phát) với Finance (tỷ giá, thuế); khó tách sau.
- **Ba module ngang hàng gọi nhau tự do**: tạo chu trình `catalog ↔ licensing`; đăng ký chặn (mục 4) tránh được.
