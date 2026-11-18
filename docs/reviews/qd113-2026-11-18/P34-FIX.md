# P34-FIX — sửa theo review P3 (ảnh phòng, QĐ-113c) và P4 (sửa xếp phòng đầu, QĐ-113e)

Nhánh `feat/qd113-p34`. Migration `20261118120000_first_placement_correction` chưa vào `dev` nên sửa tại chỗ.

| # | Mức | Việc | Cách xử lý |
| --- | --- | --- | --- |
| 1 | Medium | `FirstPlacementUseService` fail-open | Thiếu `requests.requests-of-person` hoặc `personnel.transfers-and-departures` thì ném `FirstPlacementUseReaderMissingError` (không map, 500). Unit spec mới. |
| 2 | Medium | Object R2 mồ côi | **Chấp nhận, giới hạn đã biết D-1.** Không thêm bảng purge. Mồ côi xảy ra khi process chết giữa `putObject` và commit, hoặc xóa object thất bại (chỉ log). Ghi trong `src/modules/organization/README.md`. Dọn tay theo log nếu cần. |
| 3 | Medium | Ghi storage trước khi kiểm phòng | `upload` đọc phòng không khóa (`findById`) trước `putObject`; kiểm có khóa trong giao dịch giữ nguyên. |
| 4 | Medium | Đổi ngày thất bại khi phòng hiện tại đã ngừng | `lockDepartment` không còn kiểm ACTIVE; chỉ phòng MỚI (khi đổi) phải ACTIVE và hiệu lực. |
| 5 | Medium | Test | Integration (chỉ CI): trigger SQL (placement đơn lẻ tương lai đổi được phòng; placement thứ hai, `PLACEMENT_START`, transfer thì không; "hôm nay" theo múi giờ tổ chức; xóa vẫn bị `keep_one`; 409 thay vì 500). Unit: `FirstPlacementUseService`, `FirstPlacementRequestsReader` (người yêu cầu và thụ hưởng, nháp), `FirstPlacementPersonnelReader`, `EmployeeRepo.correctFirstPlacement`. HTTP: `avatarUrl` ở list và detail, 413/415, giới hạn multipart. PATCH 403 cho vai khác Super Admin đã có từ trước (`first-placement.http-spec.ts`). |
| 6 | Low | Trigger từ chối thành 500 | `EmployeeRepo.correctFirstPlacement` map SQLSTATE `55000` thành `FirstPlacementCorrectionError('ALREADY_EFFECTIVE')` (409). |
| 7 | Low | Thiếu dòng organization thì `v_today` NULL | Migration `RAISE EXCEPTION` (`55000`) khi `v_today IS NULL`. |
| 9 | Low | Hai doc comment liền nhau | Gộp trong `picture-image.ts`. |
