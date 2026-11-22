# FIX-TEST — Đợt 1 thiết kế lại, làn `biz`

Các test http / integration / flow cũ khẳng định hành vi trước Wave 1, không chạy ở máy (CI GitHub sẽ chạy và đối chiếu lại ở bước chốt). Không xóa, không skip.

| Gói | File test | Ca | Lý do |
| --- | --------- | -- | ----- |
| P1 | `test/integration/personnel/offboarding-departure.integration-spec.ts` | `lockAgain` (~lines 187-189, gọi `revokeRights(wire.id, { accountLock: LOCK })` khi đã khóa & đã mở thu hồi) | Trước W1-01 `revocationSelection` lọc bỏ seat `hasTask: true` nên trả `NOTHING_TO_REVOKE` trước khi kiểm tra `lockRecorded && lockGiven`; sau W1-01 seat `hasTask: true` vẫn vào `selected` nên trả `409 OFFBOARDING_CASE.ALREADY_RECORDED`. |
| P11 | `test/integration/optimization/ghost-seat-g2-reclaim.integration-spec.ts` | `KPI-5 (DA6-39)` (lines 242-290, seed `G4 ACTION SUPERSEDED` và khẳng định 3 of 8 = 37.5 %) | Trước W1-18 `SUPERSEDED` nằm trong tử & mẫu KPI-5; sau W1-18 `SUPERSEDED` và `LEFT_TO_EXPIRE` bị loại khỏi cả tử lẫn mẫu, kết quả thành 2 of 7 (28.6 %). |
| P7 | `test/integration/requests/year-start-commitments-kept.integration-spec.ts` | `T-RQ2 (K2, no end)` (lines 160-172, duyệt 375.000/tháng không thời hạn, giá 01/01 là 400.000 -> kỳ vọng 4.800.000 và `seat_monthly_minor` 400.000) | Theo W1-11, quyền không ngày kết thúc có số năm sau đã lưu lấy đúng số đã lưu (4.500.000) và `seat_monthly_minor` = 375.000 (giá lúc duyệt), không lấy giá 01/01. |
