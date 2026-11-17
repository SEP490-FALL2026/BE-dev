# AUDIT — prompt 3 (SPEC feedback FE v2.1), nhánh `feat/fe-feedback`

Tổng kết các đợt review/verify của chat điều phối (Opus) cho prompt 3, 14–16/11/2026. Điểm Owner cần quyết: phần đầu
[OVERNIGHT-DECISIONS.md](OVERNIGHT-DECISIONS.md). Biên bản chi tiết: các tệp `AUDIT-*.md` trong thư mục này và [audit-p3/](audit-p3/).

## 1. Cách làm

- Code: chat Sonnet "SEP-Start 81" (lane A) và "SEP-Start 82" (lane B), mỗi gói một lượt; review theo đợt bằng 1–3 agent Opus chỉ đọc
  (5 trục: nghiệp vụ/luồng/BR theo QĐ mới nhất, đúng đắn, kiến trúc, phân quyền/SoD, migration) + tự đọc migration/SQL/phân quyền +
  test thật trên bản sạch DB riêng (file chạm, thư mục module, `test:http` toàn bộ) + mutation ở chỗ chính ⟹ gửi FIX ⟹ verify FIX.
- Lỗi logic sửa ngay; nợ test thuần gom về một gói FIX-TEST cuối (chat "SEP-Start 83").
- Gói Z2 (seed, flows, dữ liệu demo) do agent Opus làm ở nhánh `feat/z2-seed`, merge `0940aa5b`.

## 2. Các đợt review và FIX

| Đợt | Gói | Biên bản | FIX gửi | Kết quả verify |
| --- | --- | --- | --- | --- |
| B1 | FX-1…CT-1 | AUDIT-P3-B1-A/B/C | FIX-B1, FIX-B1c | PASS (unit 353 + int 216; mutation bị bắt) |
| B2 | IN-1, AUDIT-MF23, IA-1/2, K1-GR, CO-1 | AUDIT-P3-B2-A…D | FIX-B2, FIX-B2d | PASS (8/8 mutation bị bắt) |
| B3 | US-1/2, PI-1/1c/2, RC-1/2 | audit-p3/AUDIT-P3-B3-A/B/C, AUDIT-FIXB3 | FIX-B3 (16 Required), FIX-B3b | PASS (13/16 + FIX-B3b) |
| Merge | lane A ↔ lane B | audit-p3/AUDIT-MERGE1, AUDIT-MERGE2 | FIX-LB4 (MG-01…05) | không lỗi merge |
| Lane B | PL-1, PL-3, PF-1, BG-1, BG-2 | AUDIT-LB-PL1, LB-PL3, LB-FIX1-PF1, audit-p3/AUDIT-LB-BG | FIX-LB1…LB4 | PASS |
| B4 | SM-1, RV-1, AD-1, RV-2, RV-3 | audit-p3/AUDIT-SM1, RV1, AD1, RV23 | FIX-SM1, FIX-RV1, FIX-AD1, FIX-RV23 | PASS |
| B5 | PL-2 | audit-p3/AUDIT-PL2 | FIX-PL2 | PASS (`1f7ffa19`) |
| Cuối | nợ test | audit-p3/FIX-TEST-LIST, FIX-TEST-PROMPT, FIX-TEST-DONE | FIX-TEST T1–T10 | PASS (7 commit test, không lỗi logic) |
| Cuối | Z2 | `Z2-NOTES.md`, audit-p3/Z2-PROMPT | — | seed/flows/serial xanh; DEMO 10/15 đạt đủ |

Finding đáng nhớ đã sửa: SM1-01 (Critical, ghế gia hạn mất liên kết Request), B3B-01 (hóa đơn `K2` vào chi tiêu phòng ⟹ dòng kho),
B3C-01 (thu hồi/hợp thức ngoài quy trình theo QĐ-104j), B3C-03 (chi tiêu tính hai lần), B3A-01 (quét tuần không tạo `G4 MONITOR`),
bom ngày (năm/tháng) ở FIX-B3b, drift index `purchase_invoices` (FIX-A2), PL2-01 checklist ở trình lô.

## 3. Kiểm chứng cuối

| Kiểm | Nơi | Commit | Kết quả |
| --- | --- | --- | --- |
| CI GitHub đầy đủ (quality + drift Prisma + compose + openapi + audit, http, integration 1–3, inband, e2e) | run `43856062372` | `0940aa5b` | **xanh toàn bộ** |
| CI GitHub trước Z2 | run `43849737226` | `befdb295` | xanh trừ 5 suite seed (chờ Z2) |
| CI GitHub đầu tiên | run `43831861007` | `732a2b2d` | đỏ: seed (Z2), T8, T9 ⟹ FIX-TEST đợt 2 |
| `pnpm test:flows` | local DB 35432 | `0940aa5b` | 11/11 suite, 64 pass, 9 `it.skip` có sẵn |
| `pnpm seed:local` từ DB trống + chạy lại | local (Z2) | `ebfe0076` | exit 0; chạy lại không ghi gì |

Commit sau `0940aa5b` chỉ là tài liệu (merge `feat/mf2-mf3` docs, biên bản review).

## 4. Tài liệu API FE

Docs `main` `94f8b68` + `a643633` (chưa push): 423 operation có chú thích, 5931/5931 field có nghĩa, `--check` 0 vấn đề; 6 agent viết +
2 agent review độc lập (R1: 39 lỗi tài liệu sửa; R2: 32 lỗi sửa); catalogue 118 mã thông báo + 743 mã lỗi (câu tiếng Việt đề xuất);
changelog phá hợp đồng `changes/2026-11-16-prompt3-fe-feedback.md`; demo theo seed Z2; file mẫu import thật. Báo cáo agent:
[audit-p3/apidocs/](audit-p3/apidocs/) (REPORT-A1…A6, REVIEW-R1/R2, GENERIC-ERRORS — đầu vào prompt 5).

## 5. Còn mở (đầu vào prompt 4a/5)

Xem phần đầu OVERNIGHT-DECISIONS §2 (20 dòng lệch BRD/nghi lỗi BE, 4 mức Cao: SBF-20 điều chỉnh thuê bao theo luật cũ và kho
`K2`/`K4` không có route điều chỉnh; duyệt chi 500 thay 409; thông báo thiếu ở MF-1/SBF-09/SBF-07a; QĐ-111ax) và GENERIC-ERRORS.md.
