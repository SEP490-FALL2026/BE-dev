# onboarding

Mục đích: checklist khởi tạo tổ chức (5 bước) cho Super Admin và IT Admin, tính từ dữ liệu đang có ở các module khác.
Chỉ đọc, không ghi gì. Story chính: US-02-04.

Tầng: T6 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: catalog, data-import, identity-access, licensing,
organization ([module-graph](../../../docs/generated/module-graph.md)). Được dùng bởi: không module nào; chỉ
`app/app.module.ts` mount `OnboardingModule`.

## Public API (`public/`)

- Không có `public/`: không module hay lệnh nào gọi onboarding. Kiểu trả về (`OnboardingChecklist`, `StepStatus`, …)
  khai báo trong `onboarding.service.ts`.

## Bảng sở hữu

- Không có ("It owns no table", comment trong `onboarding.module.ts`).

## Extension point

- Mở: không có.
- Đăng ký vào: không có.

## Capability → file chính

Module nhỏ, chưa chia capability; mọi file ở gốc module.

- `onboarding.controller.ts` — `GET /onboarding-checklist` (`SUPER_ADMIN`, `IT_ADMIN`) → `onboarding.service.ts`.
- `onboarding.service.ts` — đọc `OrganizationApi.getOnboardingFacts`, `DataImportApi.latestEmployeeImport`,
  `CatalogApi.getOnboardingFacts`, `LicensingSeatBaselineApi.getBaselineProgress`, `IdentityAccessApi.findUsableItAdminEmployeeIds`.
- `onboarding.policy.ts` — ai được đọc; `onboarding.errors.ts` — `OnboardingForbiddenError`.
- Nest: `onboarding.module.ts` (controller + service, chỉ API mount).

## Bất biến quan trọng

- Chỉ Super Admin và IT Admin đọc; service kiểm lại bằng `assertMayReadChecklist`, không chỉ dựa vào role của route
  (`F13`).
- Mỗi bước tính từ dữ liệu đang có, không từ cách dữ liệu được nhập.
- Bước 1 xong khi có phòng ban, có nhân viên và file nhân sự mới nhất không có dòng lỗi; thiếu trưởng phòng, IT Admin
  hoặc Cost Center chỉ là cảnh báo, không chặn (US-02-04 AC-6, `QĐ-87f(2)`).
- Bước 2 xong khi catalog có ứng dụng, bước 3 khi có subscription; bước 4 (seat baseline) bị chặn tới khi bước 1 và 3
  xong (`BR-01.1`), xong khi IT Admin đóng nó; bước 5 (usage) luôn `NOT_AVAILABLE`.

## Test

- Unit: `src/modules/onboarding/**/*.spec.ts`; HTTP: `test/http/onboarding/`; integration:
  `test/integration/onboarding/`.
