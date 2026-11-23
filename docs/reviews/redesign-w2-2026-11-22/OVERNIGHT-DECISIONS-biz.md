# OVERNIGHT-DECISIONS — Đợt 2 thiết kế lại, làn `biz`

| D-n | Gói | file:line | Câu hỏi | Phương án A/B/C | Chọn + căn cứ | Cách đảo lại | Mức (tự chốt / cần Owner) |
| --- | --- | --------- | ------- | --------------- | ------------- | ------------ | ------------------------- |
| D-1 | B0 | `src/modules/organization/department-it-substitute/department-it-substitute.policy.ts:39` | Tên verdict phòng không tồn tại / ngừng hoạt động trong `judgeAppoint` trùng literal `PLACEMENT_REASON_CODES` của gate `policy-ownership` | A: thêm ngoại lệ vào `OTHER_DECISIONS` của gate; B: đổi verdict nội bộ của policy sang `MISSING_DEPARTMENT` / `INACTIVE_DEPARTMENT` | Chọn B (luật cấm sửa gate; B10a vẫn ánh xạ ra mã HTTP `DEPARTMENT.NOT_FOUND` và `DEPARTMENT_IT_SUBSTITUTE.DEPARTMENT_INACTIVE`) | Đổi 2 chuỗi verdict khi B10a nối service nếu cần | tự chốt |
