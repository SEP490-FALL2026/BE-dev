# Brief — lượt "FE nối 5 main flow" (05/11/2026, hạn bàn giao FE 20:00)

Mục tiêu Owner: bộ spec/plan sửa API BE theo nghiệp vụ mới để AI khác implement, rồi coordinator review. **Lượt này chỉ
đọc source, viết báo cáo, viết/chỉnh spec/plan.** Không implement, không chạy migration/test/DB, không sửa CI/CD, không
deploy, không lệnh git thay đổi trạng thái (không commit/push/branch/stash/reset/checkout). Giữ mọi thay đổi có sẵn.

## Skill preflight (bắt buộc theo `D:\FPT\FALL2026\CLAUDE.md`)
Đọc đầy đủ SKILL.md: một process skill (`agent-skills:spec-driven-development` hoặc `superpowers:writing-plans`), domain
`agent-skills:api-and-interface-design` (+ `code-review-and-quality` khi kiểm source), và
`superpowers:verification-before-completion`. Đầu báo cáo liệt kê skill đã dùng. Trả lời tiếng Việt.

## Nguồn
- Review mới (Docs): `D:\FPT\FALL2026\Docs\Reviews\main-flows-api-contract-review-2026-11-05\README.md` (bản đồ 53 bước →
  API, finding F01–F27, bảng field nào nhập/BE tự tính) và `CURRENT-API-INPUTS.md` (inventory field body hiện tại).
- Nghiệp vụ: `D:\FPT\FALL2026\Docs\Requiments\Quy trình và chính sách theo main flow.md`, `D:\FPT\FALL2026\Docs\Decisions\project-decisions.md`
  (QĐ-96→QĐ-101; **`QĐ-100l`/`QĐ-100ah` chờ mentor — không tự chốt, giữ hành vi hiện tại**), BRD v4.1, US `Docs\BE-UserStory\src\`.
- Bộ qd96-100 có sẵn (BE): `docs/reviews/qd96-100-alignment-2026-11-05/{README,ITEMS,LEDGER,QUESTIONS,C-REVIEW}.md` —
  QUESTIONS mục D là câu trả lời Owner (đã chốt); C-REVIEW có 30 phát hiện (8 Critical migration) mà 5 agent sửa dở —
  kiểm từng spec đã sửa hay chưa. Spec/plan ở `docs/workspace/items/qd96-100-*`. **Spec có file ≠ đã implement.**
- Thiết kế G7/hợp đồng đã duyệt (MF-5 usage, phần `subscription-renewals` vai mới): `docs/reviews/g7-usage-design-2026-11-05/DESIGN.md`.
- BE HEAD hiện tại `808318a4` (branch `feat/qd96-100-alignment`; khác pin `3e4553b9` chủ yếu ở module `ai-assist` mới).
  Kiểm source thật, trích `file:dòng`.

## Quy tắc chỉnh spec/plan
1. Tận dụng `qd96-100-*` có sẵn; không tạo bộ trùng. Chỉ tạo hạng mục mới khi không có chủ (ghi lý do).
2. Mỗi spec phải đủ để AI khác code không đoán: vấn đề + căn cứ (QĐ/bước MF), phạm vi/ngoài phạm vi, **bảng API hiện tại →
   contract sau sửa** (endpoint, vai/phạm vi dữ liệu, field giữ/bỏ/đổi/BE tự tính, validation, mã lỗi), logic/trạng
   thái/transaction/chống trùng, migration/seed, file/capability và thứ tự, AC + test case cụ thể, tác động FE/OpenAPI/
   `Docs/Figma UI-UX/API-Integration`/CHANGELOG. Viết gọn bằng bảng; không chép BRD.
3. Field: phân biệt **người dùng nhập** vs **BE tự suy ra/tính/kiểm** vs **output**. Không xóa field kỹ thuật cần thiết
   (`id`, `previewVersion`, `idempotencyKey`, `planLine.position`…) — giải thích. Field client gửi mà đã bỏ ⟹ 422 rõ ràng
   (`z.strictObject`), không bỏ qua lặng lẽ.
4. Đánh dấu mỗi hạng mục một **mức FE-tonight**: `A` = phải xong để FE nối flow tối nay (contract-first, logic tối thiểu
   nhưng **thật**, không mock); `B` = sau demo; `BLOCKER` = bước còn thiếu API/thiết kế, ghi rõ ảnh hưởng tới flow nào.
   Nếu cần, tách một spec thành phần A (contract + logic tối thiểu) và phần B (đủ nhánh) — ghi trong spec, không cắt nhánh
   rồi giả là xong.
5. Giữ đúng template BE (`docs/workspace/_template/`), mục `## Changes and acceptance` ghi "chỉnh 05/11 theo review main
   flow: …". Thiết kế giữ `draft` trừ khi đã đủ thì `ready`. Không ghi implemented/verified.
6. Không sửa `docs/roadmap.md`, `docs/workspace/items/README.md` (coordinator làm), không sửa source/test/OpenAPI/Docs.

## Báo cáo (file trong `fe-batch/`, ≤ 1500 từ, bảng)
- Bảng finding: `F | xác nhận ở source (file:dòng) | loại: thiếu API / sai logic / chỉ tài liệu | hạng mục chủ | spec đã đủ? | đã chỉnh gì | mức A/B/BLOCKER`.
- Bảng hạng mục: `slug | mức | phụ thuộc | thay đổi contract (route/field) | migration | trạng thái spec/plan | giờ ước`.
- Field theo vai cho từng API chạm: chỉ ghi chỗ **khác** bảng của review Docs (đồng ý thì ghi "đồng ý").
- Blocker và điểm chờ mentor.
