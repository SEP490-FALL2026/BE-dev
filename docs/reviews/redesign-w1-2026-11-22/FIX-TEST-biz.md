# FIX-TEST — Đợt 1 thiết kế lại, làn `biz`

Các test http / integration / flow cũ khẳng định hành vi trước Wave 1, không chạy ở máy (CI GitHub sẽ chạy và đối chiếu lại ở bước chốt). Không xóa, không skip.

| Gói | File test | Ca | Lý do |
| --- | --------- | -- | ----- |
| P1 | `test/integration/personnel/offboarding-departure.integration-spec.ts` | `lockAgain` (~lines 187-189, gọi `revokeRights(wire.id, { accountLock: LOCK })` khi đã khóa & đã mở thu hồi) | Trước W1-01 `revocationSelection` lọc bỏ seat `hasTask: true` nên trả `NOTHING_TO_REVOKE` trước khi kiểm tra `lockRecorded && lockGiven`; sau W1-01 seat `hasTask: true` vẫn vào `selected` nên trả `409 OFFBOARDING_CASE.ALREADY_RECORDED`. |
