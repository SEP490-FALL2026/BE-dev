# Quyết định sau review đợt 1 (23/11/2026)

Nguồn finding: `REVIEW-A-tech.md` (RA-n), `REVIEW-B-biz-money.md` (RB-n), `REVIEW-C-biz-flows-merge.md` (RC-n), CI run
45106926670 trên commit gộp `45ee61f4`.

## Owner trả lời

| Mã | Quyết định |
| --- | --- |
| D-1 / RB-1 | Seed: kỳ ngân sách năm sau **khóa thật** sau seed (khớp phiên bản đã có); cảnh "BM-10 chờ Finance" chuyển sang kỳ của năm kế tiếp đang mở. Bỏ cách dời hạn nộp tạm rồi khôi phục (seed, `demo-accounts.api.ts`, fixture `finance.ts`, các bản "dời hạn tạm" trong test). |
| D-2 / RC-2 | Duyệt D-2 (gửi lại khi đã là trưởng phòng ⟹ một bước), **thêm audit `ACCESS_REQUEST.RESUBMITTED`** như D-2 đã ghi. |
| D-3 / RC-13 | Duyệt D-3 nhưng **thu hẹp**: khi kiểm "không tự duyệt Request của mình" chỉ bỏ qua dòng `WITHDRAWN`; dòng của chính trưởng phòng đã được quyết vẫn chặn `OWN_REQUEST`. |
| D-4 / RB-2 / RC-4 / RA-6 | `resubmittedAs(ids, tx?)` nhận `tx`, lời gọi `purchase-invoice-submission.service.ts:53` truyền `tx`. |
| RA-2 | **Sửa**: đường IT nhận tác vụ cấp khóa employee trước tác vụ (đúng bảng thứ tự khóa); thêm test đồng thời có barrier DB. |
| RC-3 | **Trả về hành vi cũ**: Request nhóm nội bộ miễn phí có dòng của người vừa thành trưởng phòng ⟹ bước nhu cầu kết thúc `NOT_REQUIRED` (cờ audit như trước); thêm ca vào spec policy. |

## Coordinator tự chốt (theo SPEC/QĐ, không cần Owner)

| Mã | Quyết định |
| --- | --- |
| RB-3 | Giữ: KPI-5 loại mọi `SUPERSEDED` (tránh đếm một seat hai lần); sửa comment cho đúng nghĩa. |
| RB-4 | Khôi phục thông báo cho IT phụ trách khi người khác ghi thay (SPEC không cho bỏ). |
| RB-5 | Khoản 01/01 có số lưu thì **không** đòi giá 01/01 hợp lệ (`QĐ-114w`, `QĐ-117h`: luôn 12 × giá lúc duyệt). |
| RA W1-09 | `outcomes` trả theo **thứ tự `ids` người gọi gửi**, dù xử lý theo id đã sắp. |
| SBF-01 | Chấp nhận: năm đầu Finance gửi phiên bản từ ngày sau hạn nộp (đúng W1-20). |

## Phải sửa (toàn bộ, trừ chỗ ghi "để sau")

- **High:** RA-1 (giờ trong mail tự dựng chuỗi lệch giờ, không phụ thuộc ICU), RA-17 (`ALREADY_DECIDED` bắt đúng `SpendDecisionRefusedError('NO_SPEND_STEP')`, mock đúng lỗi thật), RA-2, RA-3, RA-4 (I-test W1-05/W1-06 dựng đúng ca), RB-1.
- **Medium:** RC-1 (đọc lại `hasLiveRevocation` sau khóa thuê bao ⟹ 422 `OVERLAP`), RC-2, RC-3, RC-4, RC-5 (gom bốn đường "người xin thành trưởng phòng ⟹ một bước" về một service), RA-5, RA-6, RA-7 (test unique index số hóa đơn), RA-18 (hai test password-change/reset).
- **Low/Nit:** RA-8…RA-16, RB-6…RB-9, RC-6…RC-12 — sửa hết nếu không đổi hành vi ngoài SPEC; mục nào đổi hành vi thì ghi "để sau" kèm lý do.
- **CI đỏ:** mọi suite đỏ của run 45106926670 và các mục `FIX-TEST-biz.md`, `FIX-TEST-tech.md`.
