# Brief chung cho người viết spec/plan các lát G7 + C1 (05/11/2026)

Người implement là Cursor/dev khác, không có ngữ cảnh phiên thiết kế. Spec/plan phải tự đủ để code nhanh và đúng.

## Đọc trước (bắt buộc)
- `D:\FPT\FALL2026\CLAUDE.md` (skill preflight, trả lời tiếng Việt), BE `AGENTS.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`.
- BE `docs/workspace/README.md`, `docs/workspace/_template/{spec,plan,test-plan}.md`, `docs/rules/work-item-sizing.md`,
  `docs/rules/api-contract.md` (envelope, lỗi, API-LIST-DETAIL.1, OpenAPI), `docs/rules/module-structure.md`,
  `docs/rules/security-jobs.md`, `scripts/arch/tiers.cjs`, `src/infrastructure/database/database-role-judgement.ts` (H7).
- Thiết kế đã duyệt: `docs/reviews/g7-usage-design-2026-11-05/DESIGN.md` (nguồn chính; mục 0 luật F-1…F-6).
- Nghiệp vụ (Docs, có thay đổi chưa commit 05/11): `D:\FPT\FALL2026\Docs\Decisions\project-decisions.md` (`QĐ-101a`→`l`,
  `QĐ-32c`, `QĐ-35b`, `QĐ-62q`, `QĐ-66ad/ae`, `QĐ-77e`, `QĐ-96j`, `QĐ-100z`), BRD
  `D:\FPT\FALL2026\Docs\Requiments\BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md` (v4.1),
  User Stories nguồn `D:\FPT\FALL2026\Docs\BE-UserStory\src\EP-xx.md` (Story/AC dùng đúng mã và nội dung hiện tại).
- Code BE liên quan tới lát của bạn (đọc thật, trích file:dòng; không đoán tên hàm/bảng).

## Viết gì, ở đâu
- Mỗi lát một thư mục `docs/workspace/items/<slug>/` gồm `spec.md`, `plan.md`, `test-plan.md` theo đúng mẫu (giữ tên
  heading `##` và tên trường để `pnpm rules:check` qua). Tool: thư mục `be-integration/` trong workstream tool tương ứng.
- Header spec: Phụ trách `Cursor/dev được Owner giao`; Thiết kế ban đầu bởi `Owner + Claude (phiên 05/11/2026)`;
  Thiết kế `ready`; Owner review: `thiết kế đã duyệt 05/11/2026 (DESIGN.md); spec chưa review`; Nguồn: Docs `3d73a7f`
  + thay đổi chưa commit 05/11/2026 (`QĐ-101`, BRD v4.1, US đã sửa), BE `3e4553b9`.
- `## Sizing decision` đủ trường; Scope map: `../../../roadmap.md#work-item-decomposition-g7` (C1:
  `…-g3`). Bảng Primary Story/AC phải chính xác theo US hiện tại: chỉ claim AC lát này thật sự làm; phần còn lại ghi
  tên lát sibling (danh sách lát ở DESIGN.md mục 12: `c1-contract-list-and-fields`, `g7-device-registry-acknowledgement`,
  `g7-device-credential-enrollment`, `g7-ai-usage-intake`, `g7-browser-usage-intake`, `g7-vendor-usage-import-identity`,
  `g7-vendor-usage-csv-template`, `g7-g1-g2-recommendations`, `g7-g3-g4-decisions`, `g7-usage-downstream-retention`).
- **Không** sửa `docs/roadmap.md`, `docs/workspace/items/README.md`, code, Docs, hay thư mục item của người khác
  (thư mục `qd96-100-*` đang là việc của phiên khác). Coordinator sẽ đăng ký và lập scope map G7.

## Yêu cầu nội dung (chống "field ma")
1. **Bảng field cho mọi request** (body/query/header) của mọi route mới/đổi: `field | kiểu & ràng buộc | bắt buộc? (ca
   vắng nếu tùy chọn) | nguồn (ai biết) | dùng ở đâu (AC/màn/rule)`. Field nào không điền đủ cột ⟹ bỏ. Không nhận các
   giá trị BE suy ra được (luật F-2). Mọi body là `z.strictObject`.
2. **Bảng field cho mọi response**: field → AC/màn tiêu thụ.
3. Zod schema dự kiến cho từng DTO (code thật, ngắn), Prisma model/enum mới (code thật), SQL cho trigger/CHECK/partial
   unique, route + decorator truy cập + `operationId` + `message` key + mã lỗi (`DOMAIN.REASON`, một mã ↔ một status).
4. Collection mới theo API-LIST-DETAIL.1: summary riêng, `pageSize ≤ 100`, thứ tự ổn định có `id`, đếm + trang cùng
   RepeatableRead, không N+1, `maxItems` cho mảng lồng.
5. Migration là task riêng đi trước; ghi H7 (bảng append-only vào `RUNTIME_TABLE_EXCEPTIONS`), tiers mới, table-owner
   map của gate kiến trúc, `openapi-example-manifest`, `api-coverage-manifest`.
6. `test-plan.md`: ca test cụ thể (tên test, cấp unit/integration/http, input, kết quả mong đợi) cho từng AC, ca từ chối,
   race, quyền, và **test chống field ma** (DESIGN.md mục 11).
7. `plan.md`: task nhỏ có `Files`, `Depends on`, `Acceptance`, `Verify` (lệnh cụ thể — theo bộ kiểm nhanh:
   `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, gate/test theo file; full suite để Owner chạy
   lúc audit), checkpoint sau 2–3 task. Không TDD từng dòng; đủ để Cursor code thẳng.
8. Ngắn gọn: spec ≲ 300 dòng, plan ≲ 250 dòng mỗi lát. Không chép lại DESIGN.md — dẫn link mục.
9. Điểm chưa rõ: ghi mục "Câu hỏi mở" trong spec kèm đề xuất mặc định; không tự đổi nghiệp vụ.

## Báo cáo cuối (≤ 800 từ)
Skill đã đọc; đường dẫn các file đã tạo; bảng Primary Story/AC của từng lát (để coordinator lập scope map); điểm lệch so
với DESIGN.md (kèm lý do, file:dòng); câu hỏi mở; những gì chưa kiểm chứng.
