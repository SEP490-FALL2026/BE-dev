# Bỏ chọn dòng kế hoạch — `QĐ-101m` (05/11/2026)

> **Superseded by `QĐ-101n`** (Owner, cùng ngày 05/11/2026): Request không bao giờ gắn dòng kế hoạch — không tự khớp, không output
> `planLine`/`offPlan`; dòng BM-10 bỏ khoảng mua/kỳ dịch vụ/chu kỳ lặp/ngày hiệu lực bằng chứng giá. Hạng mục `qd96-100-plan-line-auto-match`
> đã xóa, thay bằng [`qd96-100-plan-line-removal-and-bm10-lines`](../../../workspace/items/qd96-100-plan-line-removal-and-bm10-lines/spec.md). Log: [BM10-SIMPLIFICATION](BM10-SIMPLIFICATION.md).
> Nội dung dưới đây giữ làm lịch sử.

Skill đã đọc/dùng: `agent-skills:spec-driven-development` (process — spec/plan trước code), `agent-skills:api-and-interface-design`
(domain — bảng API trước/sau, mã lỗi, field output), `superpowers:verification-before-completion` (chạy checker, đọc output),
`Docs/.claude/skills/docs-sync-check` (checker US + rules). Không sửa source/test; không git, không commit.

## Quyết định (Owner, phiên 05/11/2026, chưa GVHD/mentor xác nhận)

Trưởng phòng không còn gắn Request với dòng kế hoạch, không chọn _ngoài kế hoạch_, không xác nhận _còn nhu cầu_. BE tự khớp
(cùng gói → cùng phần mềm; Cost Center, năm tạm tính; khoảng mua chứa hôm nay trước; `position` nhỏ nhất) khi duyệt nhu cầu,
khi trình lô, khi duyệt chi; không khớp ⟹ _ngoài kế hoạch_. Chỉ là thông tin, không đổi kết quả kiểm tra ngân sách.

## Đã sửa

- Docs (chưa commit): `Decisions/project-decisions.md` — `QĐ-101m` mới (§3.8), `QĐ-82l(5)` sửa tại chỗ, bảng §2 (`QĐ-82` sửa
  bởi `QĐ-101`; `QĐ-101` 13/0/0), §6, §7. BRD **4.2** (header, lịch sử, 4.1, bảng nhánh, `FR-3.3`, `FR-3.20`, `FR-3.21`,
  `FR-5.15`(5), chuỗi MF-1, thực thể, thuật ngữ). US: `US-05-04` AC-12 viết lại, AC-13 bỏ; `US-06-14` AC-5, `US-06-12` AC-10,
  `US-16-02` AC-9 sửa; ghi chú ở `US-01-05`, `US-01-12`, `US-03-06`, `US-05-02`, `US-05-14`, `US-05-17`, `US-05-21`,
  `US-06-01`, `US-06-16`; `00-head`.
- BE: hạng mục `qd96-100-plan-line-auto-match` (đã xóa) (`ready`, Đợt 1);
  đăng ký items index + roadmap (G5: `US-05-04` AC-12, AC-13; `US-06-12` AC-10; `US-06-14` AC-5); ghi chú Changes ở
  `budget-check-three-outcomes`, `reserve-confirmation`, `head-group-request-queue`, `request-year-without-spend-date` (+ bảng Phần A,
  plan); `request-term-limit` plan; [FIELD-CHANGES-DOT-1](FIELD-CHANGES-DOT-1.md) bước 12b.
- Chốt: `GET …/plan-line-suggestions` **gỡ** (chỉ phục vụ chọn tay); output `planLine` + `offPlan`, bỏ `planLineAttached`,
  `planLineRequired`. Không migration.

## Kiểm

`build_us.py --write`/`--check` exit 0 (parity OK); `us_tools.py check-refs` 1056 ref, 0 problem; `check_links.py` 333 link, 0
broken; `pnpm rules:check` 517 file, 0 errors; prettier trên file BE đã chạm.

## Chưa đồng bộ (cố ý, chờ lượt sau)

- `Requiments/Quy trình và chính sách theo main flow.md`: bước 1.2 (tiêu đề "gắn dòng kế hoạch", dòng 177, checklist 182), 1.4
  (dòng 208, checklist 213), 231 (snapshot).
- `Requiments/Định nghĩa phạm vi & nghiệp vụ.md` dòng 432 ("gắn dòng kế hoạch").
- Sơ đồ `Diagrams/specs/MF-1.json`, `CTX.json`; ERD (cột `plan_line_confirmed`); tài liệu API cho FE.

## Superseded by `QĐ-101n` (05/11/2026)

Xem đầu tệp và [BM10-SIMPLIFICATION](BM10-SIMPLIFICATION.md).
