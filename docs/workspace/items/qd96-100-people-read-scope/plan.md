# Plan: qd96-100-people-read-scope

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-P).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. **Mức FE-tonight: B.**

## Before coding

Đọc mapper/query/controller ở _Supporting references_ của spec, `test/support/query-count.ts`. Kiểm `qd96-100-personnel-grounds-and-reasons`
đã merge (cùng file). Không migration. Quick set như #1 + `pnpm test:http && pnpm openapi:export`.

## Tasks

### Task 1: thông báo `BM-09` cho IT Admin

- Files: `personnel/notice/notice.controller.ts`, `notice-query.service.ts`, `notice.mapper.ts`, `notice.dto.ts` (nullable), `notice.policy.ts` (+ spec: hàm chiếu theo vai).
- Depends on: `qd96-100-personnel-grounds-and-reasons`.
- Acceptance: ba dòng L-418 và dòng _Query_.
- Verify: quick set; HTTP theo vai; integration query-count.

### Task 2: hồ sơ nghỉ việc, nghỉ dài, giám sát Super Admin

- Files: `offboarding/offboarding.mapper.ts`, `offboarding.dto.ts`; `leave/long-leaves.controller.ts`, `leave-query.service.ts`, `leave.mapper.ts`, `leave.dto.ts`; `role-duties/super-admin-watch.controller.ts`, `role-duties.dto.ts` + mapper/service.
- Depends on: none (song song Task 1).
- Acceptance: dòng L-417, L-419 (nghỉ dài, giám sát).
- Verify: quick set; HTTP theo vai.

### Task 3: thành viên phòng cho trưởng phòng

- Files: `organization/department-management/department.dto.ts`, `department.mapper.ts`, `department-query.service.ts`.
- Depends on: none.
- Acceptance: dòng L-419 thành viên phòng.
- Verify: quick set; HTTP `departmentMemberList` theo vai; `pnpm openapi:export` (diff đúng 9 op đọc).

### Task 4: rà soát điều chuyển cho IT Admin (D7)

- Files: `personnel/transfer-review/transfer-review-view.service.ts` (`scopeOf` dùng `getItAdminScope`), `transfer-review.repo.ts`
  (lọc `departmentId IN`), test HTTP `transfer-reviews.http-spec.ts`.
- Depends on: none.
- Acceptance: IT Admin phòng A không thấy rà soát phòng B (list), get ⟹ 404; IT Admin đứng thay thấy phòng được đứng thay.
- Verify: quick set; HTTP theo vai; số câu lệnh hằng.

### Checkpoint

Sau Task 3: quick set + `test:http` xanh; tự review; gửi FE danh sách trường nullable.

## Verification and handoff

| Lệnh / kiểm tra AC                                                | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ----------------------------------------------------------------- | --------------------- | ----------------- | ----------------------- |
| quick set, `test:http`, `openapi:export`, integration query-count | chưa chạy             | —                 | full suite do Owner     |

- [ ] Mọi dòng test matrix có bằng chứng.
- [ ] README/spec khớp; FE được báo.
- [ ] Giao Owner review trên revision cụ thể.
