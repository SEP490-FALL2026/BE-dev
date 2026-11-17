# A2 — MF-2/MF-3, tổ chức, tài khoản, hồ sơ cá nhân (xong 16/11)

Files: annotations auth-session, accounts-and-roles (bảng loginEmail vs workEmail `#login-email-va-work-email`), organization, personnel-offboarding-notices, personnel-transfers-leaves; flows offboarding, department-transfer, account-activation, account-roles; pending mf23.fields.json (24 khóa), mf23.enums.json (định dạng `{values:{…}}` như enums.json).
--check nhóm: 0 thiếu chú thích, 0 link hỏng; 9 dòng field chỉ chờ gộp pending (thử gộp ⟹ 0).

## Lệch code ↔ BRD/QĐ
- BR-MF2-06 đóng hồ sơ: BRD chỉ mục 1b; code đòi LEFT + mọi ghế có tác vụ thu hồi COMPLETED + 1a + 1b + lượt quét mốc chặn.
- BR-MF3-03/QĐ-103c: xin lại trong ân hạn vẫn 409 OPEN_REQUEST_EXISTS khi có Request mở cùng gói (D-95 đã biết).
- QĐ-54c: workEmail/loginEmail không kiểm tên miền khi nhập; chỉ kiểm lúc cấp trả phí (PROVISIONING.PERSONAL_ACCOUNT).
- loginEmail = workEmail (Owner 16/11) chưa có trong code — prompt 5.
- onboardingChecklistGet bước 5 usage luôn NOT_AVAILABLE dù MF-5 đã có route.

## Nghi lỗi BE
- meDepartureNoticeGet: mô tả OpenAPI sai từ QĐ-100q; level OVERDUE_HANDOVER thực tế không đọc được (người đã bị chặn).
- PERSONNEL_EVENT_RECORDED eventKind DEPARTURE_MARKED_LEFT khai báo nhưng không gửi: ghi "đã nghỉ việc" không báo ai.
- Chặn còn sót sau hủy hồ sơ muộn không hiện ở appUserGet/hồ sơ CANCELLED ⟹ Super Admin không biết gọi appUserUnlock.

## Breaking / CHANGELOG FE
- Chỉ thêm: 5 route profile; meGet + avatar, workPhone, pendingPolicyAcknowledgements; employee + contractEndDate.
- Sửa tài liệu cũ sai: điều chuyển người chưa xếp phòng = 409 DEPARTMENT_TRANSFER.PLACEMENT_OVERLAP details.reason=UNPLACED; link kích hoạt `/activate#token=`; nghĩa mới appUserUnlock; không có thông báo khi ghi "đã nghỉ việc".

## Lỗi chung chung (prompt 5)
- PLACEMENT_OVERLAP dùng chung UNPLACED và "không có bố trí hiệu lực" (không details) ⟹ tách mã.
- OFFBOARDING_CASE.LAST_WORKING_DAY_INVALID với WITH_LAST_DAY không details.
- SELF_CHANGE_FORBIDDEN: APP_USER 409 vs EMPLOYEE/PERSONNEL 403.
- reactions.mjs: PROFILE.AVATAR_TYPE_UNSUPPORTED (415)/AVATAR_TOO_LARGE (413) cần phản ứng riêng (người dùng chọn sai ảnh).
- Tài khoản thiếu cờ "đang bị chặn do nghỉ việc".

## Việc cho điều phối
- roles/super-admin.md:78 còn DEPARTMENT_TRANSFER.EMPLOYEE_UNPLACED; flows/README.md revision cũ; tools/lib/reactions.mjs thêm PROFILE.*.
