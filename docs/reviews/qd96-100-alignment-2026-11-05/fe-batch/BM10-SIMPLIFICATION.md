# Request không gắn dòng kế hoạch; dòng BM-10 gọn — `QĐ-101n` (05/11/2026)

Skill đã đọc/dùng: `agent-skills:spec-driven-development` (process — spec/plan trước code, ghi giả định), `agent-skills:api-and-interface-design`
(domain — bảng API trước/sau, 422/404, input/output tách), `superpowers:verification-before-completion` (chạy checker, đọc output trước
khi báo), `Docs/.claude/skills/docs-sync-check` (checker US + links + rules). Không sửa source/test; không git, không commit.

## Quyết định (Owner, phiên 05/11/2026, thay toàn bộ `QĐ-101m`; chưa GVHD/mentor xác nhận)

1. Kiểm soát ngân sách **chỉ** ở số tổng ngân sách của phòng (Cost Center `Unit` × năm: số cơ sở + dự phòng, thực chi, cam kết,
   Request chờ duyệt chi). Request trả phí không bao giờ nối với dòng kế hoạch — không chọn, không tự khớp, không output.
2. Dòng `BM-10`/phiên bản: `planId?` hoặc `description` (mô tả luôn ghi được), `seats?`, `amount` (chi phí ước tính của năm, giá gốc),
   `note?`. Bỏ `windowFrom`, `windowTo`, `servicePeriodMonths`, `repeatCycle`, `quoteValidUntil` (gửi ⟹ 422). Loại dòng/ZBB/ưu tiên
   (H1) không đổi. Hạn hiệu lực báo giá của Request/đánh giá IT (`FR-3.20`) giữ.

## Giả định đã chốt khi thiết kế (Owner sửa nếu khác)

- Output dòng đề xuất/phiên bản cũng bỏ 5 trường + `overdue` (BE thôi đọc cột). `description` thành tùy chọn khi có `planId`; BE ghi
  tên gói. Import CSV có cột cũ ⟹ 422 cả file `RETIRED_COLUMNS`. Wire `planLineOverdue`/`PLAN_LINE_OVERDUE` gỡ ở Đợt 1 (trước là Đợt 2
  của `budget-check-three-outcomes`). Enum `stopReason` `PLAN_LINE_REQUIRED` giữ để đọc lô cũ.

## Đã sửa

- Docs (chưa commit): `Decisions/project-decisions.md` — `QĐ-101n` mới (§3.8), `QĐ-101m` → §5 _bị thay toàn bộ_; sửa tại chỗ
  `QĐ-82a`, `QĐ-82d`, `QĐ-82l(5)`, `QĐ-97c`, `QĐ-100p`; §2 (`QĐ-101` 13/0/1), §6, ghi chú, §7. BRD **4.3** (header, lịch sử, 4.1,
  bảng 4.3, `FR-3.3`, bảng nhánh `FR-3.4`, `FR-3.20`, `FR-3.21`, `FR-5.14` (bỏ cảnh báo _quá khoảng mua_, trang tổng quan),
  `FR-5.15`(1)(2)(5)(6), chuỗi MF-1, `BM-01`, `BM-10`, thuật ngữ). US: `US-05-04` AC-12, AC-15; `US-06-10` AC-1, AC-2 (+ dữ liệu,
  luồng, TS); `US-06-12` AC-10 bỏ; `US-06-14` AC-5; `US-16-02` AC-9; `US-01-05` AC-17; `US-01-02` AC-11; `US-12-15` dòng 42 bỏ, AC-22;
  `US-12-14`; `US-06-01`, `US-06-09`; ghi chú trạng thái các Story có ghi chú `QĐ-101m`; `00-head` (BRD v4.3, thuật ngữ); `99-tail` lịch sử.
- BE: hạng mục mới [`qd96-100-plan-line-removal-and-bm10-lines`](../../../workspace/items/qd96-100-plan-line-removal-and-bm10-lines/spec.md)
  (`ready`, Đợt 1, bước 12b; spec 140 dòng, plan 80; có `## Size exception` — 4 Story chính); **xóa** `qd96-100-plan-line-auto-match`. Cập nhật items README, roadmap (dòng
  hạng mục, ghi chú G5, map: `US-05-04` AC-12/13, AC-15; `US-06-10` AC-1, AC-2; `US-06-12` AC-10; `US-06-14` AC-5; `US-16-02` AC-9),
  SPEC-PLAN-DOT-1 (12b), FIELD-CHANGES-DOT-1 (§1.2, §1.4 +3 dòng, §2, §5, §6, §7, §8), MF-INDEX, PLAN-LINE-DECISION (superseded);
  Changes ở `budget-check-three-outcomes`, `reserve-confirmation`, `head-group-request-queue`, `request-year-without-spend-date`
  (+ plan, bảng Phần A), `request-term-limit` (+ plan), `annual-budget-reserve-and-floor` (+ bảng contract), `remove-budget-revision-and-high-value`,
  `seed-demo-v3`, `e2e-main-flows-suite` (+ test-plan F1-01 bước 3, F1-02 +3 dòng).

## Kiểm

- `build_us.py --write` rồi `--check`: parity OK (164 Story, 145 dùng, 1 747 AC).
- `us_tools.py check-refs` (bản dựng + src): 1 056 ref (625 active, 431 legacy), 0 problem.
- `check_links.py` (bản dựng, epics, sổ QĐ, BRD): 376 link, 0 broken.
- `pnpm rules:check` và `check-rules.mjs --workspace`: 517 file, 3 961 link, 0 errors (sau 2 lượt sửa: pin Docs, `- Mode:`,
  `## Size exception`, Task 4 tách `Acceptance`/`Verify`, `US-16-02` AC-9 chuyển sang tham chiếu).
- `prettier --write` trên mọi file BE đã chạm.

## Chưa đồng bộ (cố ý, chờ lượt sau)

- `Requiments/Quy trình và chính sách theo main flow.md` dòng 173, 177, 182, 208, 213, 231 (gắn dòng, khoảng mua, snapshot).
- `Requiments/Định nghĩa phạm vi & nghiệp vụ.md` dòng 432 (D-1 "gắn dòng kế hoạch"); Scope không đổi version.
- Sơ đồ `Diagrams/specs/MF-1.json`, `MF-4.json`, `MF-2.json`, `CTX.json`; ERD (Conceptual entity list, Logical: cột khoảng mua của
  dòng ngân sách, `access_requests.plan_line_*`, `off_plan`); tài liệu FE `Figma UI-UX/API-Integration/api-index.md` (chờ code).
