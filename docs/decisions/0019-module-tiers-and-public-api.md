# ADR-0019: Tầng module, cửa `public/` và extension point thống nhất

## Trạng thái

**Proposed, chấp nhận một phần** — Owner chốt `OD-A1` → `OD-A8` của
[be-architecture-boundaries-restructure](../workspace/items/be-architecture-boundaries-restructure/spec.md) theo đề xuất
ngày 28/10/2026; triển khai 29/10/2026. Ngày 29/10/2026 Owner chấp nhận hai sai khác của lượt triển khai
([nghiệm thu](../reviews/be-architecture-test-acceptance-2026-10-29/README.md)): capability trong cùng module được import
nhau (S5, mục 3) và `Dockerfile` chép `scripts/build` ở stage build để sinh alias lệnh (S12, mục 6). Chưa có sự kiện Owner
review cho: quy tắc nhóm chức năng và điểm vào nhóm (mục 3, sửa trong lượt checkpoint 29/10/2026) và chi tiết extension
point (mục 5). Thay một phần
[ADR-0003](0003-flat-feature-module-layout.md) (layout phẳng, độ sâu ≤ 2, allowlist file gốc).
[ADR-0001](0001-modular-monolith.md) giữ nguyên: vẫn một modular monolith.

## Bối cảnh

Audit 28/10/2026 (BE `c49a7dd`): 1 028 file production trong 9 ngày, 54 loại hậu tố file, thư mục 91 file một cấp, một
cặp module import hai chiều (`organization` ↔ `identity-access`), ~20 lớp `Registered*`/`Refusing*` gắn bằng
`register*()` lúc chạy, và bộ gate tự viết 7 371 dòng cùng các ledger ngoại lệ. Gate "độ sâu ≤ 2" và "> 400 dòng" ép
code thành thư mục phẳng và file cắt theo chữ cái. Người đọc không lần được luồng của một route nếu không có AI.

## Quyết định

1. **Tầng module cố định** (bảng ở [module structure](../rules/module-structure.md#tầng-module), nguồn
   `scripts/arch/tiers.cjs`): module chỉ import tầng thấp hơn hoặc cạnh cùng tầng có ghi. Gỡ cặp hai chiều bằng
   `EmployeeAccountsHook` do `organization` mở, `identity-access` bind.
2. **Một cửa công khai mỗi module:** `public/` (facade `<M>Api` trong `<m>.api.ts`, type, lỗi, extension point) cộng các
   `*.module.ts`. Import thẳng file trong `public/`, không barrel (`OD-A4`). Facade đổi tên `XService` → `XApi`
   (`OD-A6`).
3. **Tổ chức theo capability, nhóm chức năng khi cần:** tối đa 2 cấp thư mục dưới module, 25 file mỗi thư mục
   (`OD-A2`). Capability trong cùng module được import nhau (S5). Thư mục con của capability là một nhóm chức năng — một
   use case hoặc một phần chung như bảng luật — gọi qua điểm vào `<…>-<nhóm>.service|policy|types.ts` từ bất kỳ file nào
   của capability; phần còn lại của nhóm riêng tư; ngoài capability chỉ Nest module và `public/` thấy nhóm. Bản đầu (chỉ
   Nest module và `public/` được import thư mục use case) chặn controller của capability điều phối sang các nhóm, nên
   được thay ngày 29/10/2026; gate: `group-is-private`, `group-entry-from-capability`, `group-entry-from-sibling`.
4. **Từ vựng 14 hậu tố** thay 54 loại; vai trò đọc được từ tên file.
5. **Ba kiểu extension point** ở `src/core/extension/`: `Hook` (một hiện thực, fail fast, `whenUnbound` khai tại chỗ khi
   graph CLI hợp lệ thiếu bên đăng ký), `Listeners` (0..n, trong transaction của bên phát), `Contributions` (0..n trả
   giá trị). Mỗi điểm là một provider Nest — một instance mỗi app — thay lớp chuyển tiếp tự viết.
6. **Gate bằng công cụ chuẩn:** dependency-cruiser (`OD-A3`) cho import, ESLint cho kích thước/độ phức tạp, một gate
   layout ngắn; bỏ ledger. Gốc `src/` chỉ còn ba điểm vào và `app/`, `worker/`, `cli/`; lệnh CLI có một điểm vào
   `dist/cli.js` và alias `dist/<tên>-cli.js` sinh lúc build (`OD-A7`); gate tĩnh ở `test/gates/` (`OD-A8`).

## Hệ quả

- Thứ tự đọc của một route: [routes](../generated/routes.md) → controller → service → repo; luồng ngược đọc trong module
  card.
- Thêm cạnh module ngược tầng phải sửa `tiers.cjs` và ADR này, không thể lách bằng ledger.
- `requests` có ~23 capability ngang hàng vì các use case của nó dùng chéo nhau; tách module `spend` vẫn để sau
  (`OD-A5`).
- Ngưỡng ESLint đang ở mức cảnh báo cho tới khi các hàm vượt ngưỡng được tách; số liệu ở plan của hạng mục.
