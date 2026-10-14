# Spec: lát G2 đầu — danh mục chức vụ và nhập tay một nhân viên

- Phụ trách: chưa phân công; reviewer: một dev khác, ngang quyền.
- Thiết kế: **draft — đầu vào refinement** (14/10/2026, trợ lý AI từ review US). Review: chưa review. `T-11`→`T-15` là
  **đề xuất chờ dev review**.
- Nguồn: **snapshot `S-2026-10-14b`** ([sources](../../sources.md) — working tree Docs chưa commit, có hash; người nhận cần
  đúng các tệp đó, cùng máy hoặc gói snapshot, và kiểm hash) — `FR-2.1`, `FR-2.2`, `FR-2.13`, `FR-9.7`, `FR-9.8`; `US-02-07` AC-1→AC-11, `US-02-02` AC-14, AC-15,
  `US-02-03` AC-1, AC-4, AC-5; `QĐ-66ak`, `QĐ-67c`, `QĐ-67d`, `QĐ-68a`→`QĐ-68f`, `QĐ-70a`→`QĐ-70c`, `QĐ-73b`.
  Snapshot `S-2026-10-12b` **không** đủ: thiếu `US-02-07` và `QĐ-68`→`QĐ-73`.
- Thiết kế kế thừa: [G0](../foundation-org-identity-boundary/spec.md) (module tổ chức tối thiểu, facade
  `createEmployeeWithPlacement`), finding R-10/R-11 ở [review G0/G1](../../../reviews/g0-g1-remediation-2026-10-15/README.md).
- [Kế hoạch](plan.md).

## Vấn đề và phạm vi

Theo thứ tự `QĐ-67c`, bước đầu sau khởi tạo là hồ sơ Employee của Finance trong phòng/chức vụ khởi tạo để Super Admin
tạo tài khoản Finance (lát 1b). Owner cho phép bước này bằng **nhập tay** (`QĐ-73b`), nên lát G2 đầu là lát nhỏ nhất
tạo được kết quả quan sát: **IT Admin duy trì danh mục chức vụ và nhập tay một nhân viên**.

| Trong lát                                                                                 | Ngoài lát (nơi làm)                                                                                |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `US-02-07` AC-1→AC-11 (thêm, khớp tên, sửa tên, ngừng/dùng lại, không xóa, chỉ IT Admin)  | `US-02-07` AC-12 (preview import cũ) — lát import                                                  |
| `US-02-02` AC-14 (nhập tay), AC-15 vế nhập tay (thành viên từ lúc ghi, quyền từ ngày vào) | `US-02-01` khung import, `US-02-02` phần import — lát G2-4                                         |
| `US-02-03` AC-1, AC-4, AC-5 áp cho biểu mẫu                                               | `US-04-09` (G2-2), `US-03-06` + `US-01-02` + `US-01-11` (G2-3)                                     |
| Enabler R-10 (JobTitle trạng thái, chuẩn hóa tên), R-11 (mốc thành viên phòng)            | `US-02-07` AC-7 vế import (lát import) và vế điều chuyển/đổi chức vụ (G6); lát này làm vế nhập tay |
| Kiểm chuỗi: IT nhập F → Super Admin tạo tài khoản `FINANCE` (1b) → F kích hoạt → `/me`    |                                                                                                    |

Không claim hoàn thành `US-02-02` hay `US-02-03`.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                                               | Kết luận hoặc blocker                                                                                                | Nguồn                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Q-3 Finance đầu tiên nhập tay được không?                         | **Được** — nhập tay hoặc import; thứ tự `QĐ-67c` không đổi                                                           | Owner `QĐ-73b`                                |
| G0 I-2: giai đoạn đầu `validFrom = hireDate`                      | Lệch `QĐ-66ak`/`QĐ-68f`/`QĐ-70c`: thành viên phòng **từ lúc ghi**, quyền từ ngày vào; ngoại lệ khởi tạo giữ ngày vào | R-11 — sửa spec G0 + test coverage trước code |
| JobTitle chưa có trạng thái; chuẩn hóa chưa gộp khoảng trắng giữa | Thêm trạng thái `ACTIVE`/`INACTIVE`, chuẩn hóa theo `QĐ-68b` (T-12), migration tính lại + kiểm trùng                 | R-10                                          |
| Thứ tự khóa G0 chưa có CostCenter/Department/JobTitle             | T-11                                                                                                                 | đề xuất                                       |
| `US-02-02` Preconditions bỏ qua phòng khởi tạo                    | Đã sửa ở Docs nguồn (`QĐ-73b`)                                                                                       | Docs 14/10/2026                               |
| Manager chưa suy ra được (chưa có giai đoạn trưởng phòng)         | Ca từ chối Manager kiểm bằng probe/fixture                                                                           | —                                             |

## Hành vi và thiết kế

**Danh mục chức vụ.** Một danh mục chung toàn tổ chức; tên khớp bỏ qua hoa/thường và khoảng trắng thừa, **giữ dấu**
(`Kế toán` ≠ `Ke toan`); trùng so cả bản đã ngừng → từ chối, nêu bản trùng. Sửa tên tại chỗ (một bản ghi, không mở giai
đoạn mới, không đổi quyền). Ngừng dùng được cả khi đang có người giữ; người đang giữ không đổi; giá trị đã ngừng bị từ
chối với **dòng mới** (nhập tay, import, đổi chức vụ). Dùng lại được. **Không xóa.** Không lý do, không thông báo; Audit
Trail luôn ghi trước → sau (`QĐ-70a`). Chỉ IT Admin (bất kỳ, không theo phòng).

**Nhập tay nhân viên.** IT Admin tạo **một** Employee: phòng đã có (gồm phòng khởi tạo), chức vụ **đang dùng**, email công
việc duy nhất sau chuẩn hóa, mã mới; **không** tạo tài khoản, vai, lời mời; lý do từ chối trùng mã lỗi của dòng import.
Thành viên phòng từ lúc ghi (ngày nghiệp vụ theo múi giờ tổ chức, T-14), quyền từ ngày vào. Audit `EMPLOYEE.CREATED`.

**Đề xuất kỹ thuật (chờ dev review):**

| Mã   | Đề xuất                                                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-11 | Thứ tự khóa thêm CostCenter → Department → JobTitle trước Employee (`FOR SHARE` khi đọc, `FOR UPDATE` khi ghi)                                                          |
| T-12 | Chuẩn hóa: NFC → chữ thường không phụ thuộc locale → trim → gộp khoảng trắng Unicode; không bỏ dấu; tối đa 100 ký tự; sửa tên chỉ đổi hoa/thường của chính nó được phép |
| T-13 | Ngừng bản đã ngừng / dùng lại bản đang dùng → 200 trạng thái hiện tại, không audit                                                                                      |
| T-14 | _Ngày ghi_ = ngày nghiệp vụ của commit theo múi giờ tổ chức, tính trong giao dịch                                                                                       |
| T-15 | Lát này chỉ kiểm phòng tồn tại; khi `US-03-06` thêm _ngừng phòng_, cùng validator từ chối phòng đã ngừng                                                                |

**API/Logical:** chưa thiết kế — cần cập nhật Logical vùng tổ chức (JobTitle trạng thái, quy tắc giai đoạn, thứ tự khóa)
trong bước 1 của [plan](plan.md). Không dựng Logical toàn hệ thống ở lát này.

## Acceptance và kiểm chứng

| US/AC                   | Tình huống                                                                                                                         | Cấp test, kết quả mong đợi | Bằng chứng |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------- |
| `US-02-07` AC-1→AC-3    | `senior designer␠` vs _Senior Designer_ → từ chối nêu bản trùng; rỗng; giữ dấu                                                     | e2e                        | chưa có    |
| AC-4, AC-5              | Sửa tên: số người giữ không đổi; trùng tên khác → từ chối                                                                          | e2e + integration          | chưa có    |
| AC-6→AC-9               | Ngừng khi đang dùng; nhập tay với chức vụ đã ngừng bị từ chối; dùng lại; không có xóa                                              | e2e                        | chưa có    |
| AC-10, AC-11            | Ma trận vai: chỉ IT Admin; AC-11: Super Admin thêm/sửa tên chức vụ khởi tạo → từ chối, IT Admin sửa tên → thành công, audit ghi IT | e2e                        | chưa có    |
| `US-02-02` AC-14        | Đúng một Employee, 0 tài khoản/vai/token/outbox; mọi lý do từ chối = mã dòng import; mã đã có → từ chối                            | e2e + integration          | chưa có    |
| AC-15 (nhập tay)        | Hôm nay 20/09, ngày vào 01/10 → thành viên từ 20/09; ngày vào 2020 → thành viên từ hôm nay                                         | integration                | chưa có    |
| `US-02-03` AC-1/4/5     | Thiếu chức vụ/phòng; mã phòng lạ không tự tạo                                                                                      | e2e                        | chưa có    |
| Chuỗi `QĐ-67c`/`QĐ-73b` | IT nhập F → Super Admin cấp `FINANCE` → F kích hoạt → `/me`                                                                        | e2e                        | chưa có    |
| Đồng thời               | ngừng↔nhập tay; hai lần nhập cùng mã/email; hai lần sửa cùng tên                                                                   | integration                | chưa có    |

## Sẵn sàng bàn giao

- [ ] **Bắt đầu thiết kế:** người nhận có đúng tệp của `S-2026-10-14b` (cùng máy hoặc gói snapshot) và hash khớp — điều kiện duy nhất của bước thiết kế (đánh dấu khi người nhận đã kiểm hash).
- [ ] **Giao implementation:** nguồn được cố định và truy cập được cho người làm/review (cách ưu tiên khi dùng Git: commit
      Docs rồi pin snapshot bằng commit — quy ước ưu tiên, không phải quyết định Owner).
- [ ] R-10/R-11 và Logical vùng tổ chức cập nhật; T-11→T-15 được dev khác review.
- [ ] Nhánh remediation `a0cf5f1` được dev review và merge; spec/plan/migration/test plan được review.

**Mức sẵn sàng:** _ready for refinement/design_ từ `S-2026-10-14b`. **Chưa** ready for implementation: còn đề xuất
T-11→T-15, Logical/API vùng tổ chức, review spec/plan, remediation đã merge và nguồn cố định.

## Thay đổi và nghiệm thu

14/10/2026: tạo từ review US theo lát; phạm vi theo `QĐ-73b`. Cùng ngày (delta): bỏ điều kiện commit trước thiết kế —
commit/pin chuyển về bước giao implementation; nguồn đổi sang `S-2026-10-14b` (`WF-01` có đường nhập tay Finance
`d_fpath`→`a_fman`). Chưa implement, chưa nghiệm thu.
