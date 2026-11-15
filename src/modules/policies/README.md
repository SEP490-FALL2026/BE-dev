# policies

Mục đích: thư viện chính sách của tổ chức — bộ chính sách cố định (không có route tạo hay xóa), phiên bản đã xuất bản không sửa,
xác nhận đã đọc của người dùng, checklist khi quyết định và file mẫu import (`QĐ-111ao`, `QĐ-111ap`, `QĐ-111ar`, `QĐ-111as`,
`QĐ-111bi`, `QĐ-112b`). Story chính: US-01-13, US-01-14.

Tầng: T3 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: audit, notifications, organization, identity-access (đều tầng
thấp hơn). Được dùng bởi: `src/app/app.module.ts`; module trên gọi qua `public/`.

## Trạng thái

Module mới của gói PL-1. Mỗi capability được thêm cùng gói của nó; mục dưới cập nhật theo.

## Public API (`public/`)

- Chưa có.

## Bảng sở hữu

- Chưa có.

## Extension point

- Mở: chưa có.
- Đăng ký vào: chưa có.
