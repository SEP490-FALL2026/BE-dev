# Prompt giao Đợt 1 cho Claude Code (Sonnet), thay Cursor (05/11/2026 tối)

Dán nguyên khối dưới vào một chat Claude Code mới, mở tại thư mục `Code/BE-dev-software-license-management`.

```text
Bạn implement Đợt 1 của bó sửa BE theo spec có sẵn. Trả lời bằng tiếng Việt; tên file/hàm/lệnh/lỗi giữ tiếng Anh.

ĐỌC TRƯỚC (chỉ những file này, không quét cả repo):
1. docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/SPEC-PLAN-DOT-1.md — file chính: §2 các bước, §3 luật code, §4 test, §5 bàn giao.
2. docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/FIELD-CHANGES-DOT-1.md — bảng field bỏ/đổi/bắt buộc. Không thêm/bỏ field nào ngoài bảng.
3. Với mỗi bước: chỉ spec.md + plan.md của hạng mục bước đó (link trong §2), và chỉ các task được ghi cho Đợt 1.
Các file V1-*, V2-*, FIELDS-*, DELTAS-*, audit/ là lịch sử phân tích — chỉ mở khi spec thiếu chi tiết.

TRẠNG THÁI HIỆN TẠI (Cursor làm dở, giữ nguyên trừ 2 điểm dưới):
- Bước 1 (đổi fixture shared-demo-v2 → v3) đã làm: src/cli/seed/**, test seed, docs/guides/seed.md, huong-dan-dev-moi.md.
  Việc đầu tiên: chạy `pnpm typecheck` và `pnpm rules:check`; sửa nốt link/tham chiếu v2 còn sót ngoài docs/reviews và
  docs/workspace/items (spec cũ đã đóng thì để nguyên tên v2 trong lịch sử).
- Cursor sa vào điều tra hiệu năng Prisma ngoài phạm vi: đã thêm `previewFeatures = ["relationJoins"]` vào
  prisma/schema.prisma và file nháp `probe.ts` ở gốc repo. Gỡ dòng previewFeatures, xóa probe.ts, chạy
  `pnpm prisma:generate`. Không đụng lại chủ đề này.

THỨ TỰ LÀM (ưu tiên phần FE cần nhất; số bước theo SPEC-PLAN-DOT-1 §2):
  Nhóm A: bước 6, 7, 8, 9, 10, 11, 12, 12b   (dọn field MF-1 + MF-4)
  Nhóm B: bước 3, 4, 5                        (contract MF-2, MF-3)
  Nhóm C: bước 13                             (MF-5 trưởng phòng sở hữu xác nhận)
  Nhóm D: bước 2                              (chặn đăng nhập hết ngày cuối)
  Nhóm E: bước 14, 15, 16, 17                 (G7 API nối tool + tool uploader)
  Nhóm F: bước 18                             (E2E @D1)
Xong mỗi NHÓM: dừng, in báo cáo ngắn theo SPEC-PLAN-DOT-1 §5 (file đổi, migration, lệnh + kết quả, contract đổi,
lệch spec), rồi làm tiếp nhóm sau trừ khi tôi bảo dừng.

CHỐNG SA ĐÀ (bắt buộc):
- Làm đúng phần Đợt 1 của mỗi task. Không refactor, không tối ưu hiệu năng, không đổi cấu hình Prisma/Nest/tsconfig/
  eslint, không nâng dependency, không viết script thăm dò, không tạo file ngoài phạm vi spec.
- Cách tối thiểu cho field bị bỏ: gỡ khỏi Zod `z.strictObject` (gửi lên ⟹ 422) + gỡ chỗ service đọc nó + 1 test 422.
  Chỉ thêm migration khi plan của bước ghi rõ (vd. M15a, M-A13, migration nới NOT NULL của 12b).
- Cùng một lỗi sửa 2 lần chưa qua ⟹ dừng bước đó, ghi vào "Open questions" cuối spec của hạng mục + báo cáo nhóm,
  chuyển bước kế tiếp. Không đào sâu quá ~30 phút một bước.
- Spec mơ hồ ⟹ ghi câu hỏi, chọn cách giữ hành vi cũ, đi tiếp. Không tự chế nghiệp vụ.
- Không dùng subagent, không tạo worktree.

KIỂM TRA (nhanh, không chạy full suite):
- Sau mỗi bước: `pnpm typecheck`, `pnpm lint`, test của các file đã chạm (vitest/jest theo đường dẫn file).
- Cuối mỗi nhóm: `pnpm arch:check`, `pnpm rules:check`; nhóm có đổi HTTP thì `pnpm openapi:export` và cập nhật
  test/support/openapi-example-manifest.ts, api-coverage-manifest.ts.
- KHÔNG chạy `pnpm check`, `pnpm test:full`, test:http toàn bộ hay integration toàn bộ. Integration chỉ chạy file liên
  quan trực tiếp khi bước có migration.
- Nhóm F: script `test:flows` CHƯA có — tạo theo Task 1 của docs/workspace/items/e2e-main-flows-suite/plan.md, rồi chạy
  `pnpm test:flows -- -t "@D1"` theo SPEC-PLAN-DOT-1 §4.

GIỚI HẠN:
- Không commit, push, branch, PR, deploy, reset DB dùng chung. Giữ mọi thay đổi chưa commit đang có trong repo.
- Không sửa migration cũ; migration mới timestamp sau migration cuối trong prisma/migrations.
- Trạng thái ghi vào spec/plan tối đa `verified-local`; không ghi implemented/verified khi chưa chạy kiểm.
- QĐ-100l/QĐ-100ah giữ nguyên hiện trạng (chờ mentor).

Bắt đầu: đọc 2 file đầu, xử lý TRẠNG THÁI HIỆN TẠI, rồi Nhóm A bước 6.
```
