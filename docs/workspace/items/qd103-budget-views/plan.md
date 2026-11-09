# Plan: qd103-budget-views

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `d9c46552`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W2, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `verified` (gói 6 MF4-C, 09/11/2026), chờ review. PR: chưa có.

## Before coding

Đọc `budgets/budget-view/*`, `budgets/budget/commitment.repo.ts` (`totals`), `requests/spend/budget-check.service.ts:135-160`
và `budget-check.repo.ts` (`pendingFor`), `src/core/extension/contributions.ts`, ADR-0019, `docs/rules/api-contract.md`.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: hạng mục này có 1 Cao (DA2-26), 4 TB (DA2-27, 28, 29, 31 chéo) ⟹ đã sửa
hết: DA2-26 (`pendingSpend` qua `PendingSpendContributions` do `requests` đăng ký, test khớp kiểm tra ngân sách), DA2-27 (mốc
00:00 01/01 năm sau, một công thức, cả dòng `NO_BUDGET`), DA2-28 (Trần phòng ba thành phần, dùng `status` sẵn có, phụ thuộc
`department-effective-year` cho trưởng phòng phòng mới), DA2-29 (test quyền/âm/null/không thấy số toàn công ty), DA2-31
(Verify đúng file). Finding không sửa: không có.

## Tasks

### Task 1: phần _Request đang chờ duyệt chi_ cho view

- Files: `budgets/public/budgets.extension-points.ts`, `budgets/budget/commitment.repo.ts` (hoặc service tổng gọi đóng góp),
  `requests/spend/{budget-check.repo.ts, pending-spend.listener.ts (mới)}`, `requests/requests.module.ts`.
- Depends on: `qd103-budget-cycle-ceilings`.
- Acceptance: tổng theo lô có `pending`; gate `extension-wiring` xanh; số khớp `pendingFor` hiện có.
- Verify: `pnpm exec jest src/modules/budgets/budget src/modules/requests/spend`; `pnpm test:gates`; `pnpm arch:check`.

### Task 2: `budgetMine` đủ số + Trần phòng + kỳ

- Files: `budgets/budget-view/budget-view.service.ts` (+ spec), `budgets/budget/budget.dto.ts`, `dashboards/manager/*` nếu dùng
  `budgetMine`.
- Depends on: Task 1; `qd103-department-effective-year` Task 4.
- Acceptance: test matrix R-I05, QĐ-82l(1), FR-5.8a, AC-7, R-C02 (phần trưởng phòng).
- Verify: `pnpm exec jest src/modules/budgets/budget-view`;
  `pnpm test:integration -- test/integration/budgets/budget-mine.integration-spec.ts` (mới) `test/integration/budgets/budget-mine-versions.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/budget-mine.http-spec.ts` (mới).

### Task 3: bảng/ô tổng — `NO_BUDGET`, Trần năm, dự phòng kho, điều chỉnh kỳ trước; quyền Người duyệt chi

- Files: `budgets/budget-view/{budgets.controller.ts, budget-view.service.ts}`, `budgets/budget/{commitment.repo.ts,
invoice.repo.ts, budget.dto.ts}`.
- Depends on: Task 2.
- Acceptance: test matrix R-C02 (bảng), quyền, ô tổng, R-C06.
- Verify: `pnpm exec jest src/modules/budgets/budget-view src/modules/budgets/budget`;
  `pnpm test:integration -- test/integration/budgets/budget-summary.integration-spec.ts test/integration/budgets/budget-table.integration-spec.ts` (file sau mới);
  `pnpm test:http -- test/http/budgets/budget-summary.http-spec.ts`.

### Checkpoint

Kiểm tra nhanh tracker §4.5; `openapi:export` drift đúng 3 operation. Tự review diff.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                         | Revision / môi trường                             | Kết quả thực chạy                                                                                            | Giới hạn / việc còn lại          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `typecheck`, `lint`, `format:check`, `arch:check`, `arch:docs:check`, `rules:check`, `prisma:validate`, `test:discovery`, `openapi:export` | `feat/mf4-g6`, native Windows/PostgreSQL          | Exit 0                                                                                                       | Không chạy full suite            |
| Unit budgets/budget-view, budget, cycle, pending contributions, requests/spend                                                             | Giai đoạn 2, sau khi code/viết test toàn bộ       | 23 suites, 302 tests PASS                                                                                    | Các vùng của gói                 |
| HTTP budgets                                                                                                                               | Giai đoạn 2                                       | 9 suites, 130 tests PASS                                                                                     | Đủ quyền/schema cho API đổi      |
| Integration mine, mine-versions, summary, table, cycle-baseline, spend-reserve-confirmation                                                | PostgreSQL native, database tạm, `--maxWorkers=1` | 53 ca có kết quả xanh; lần đầu 52/53, sửa số hóa đơn fixture vượt CHECK 64 ký tự rồi chạy lại table 6/6 PASS | Không migrate/reset DB dev chung |
| `test:gates --runInBand`                                                                                                                   | Giai đoạn 2                                       | 16 suites, 330 tests PASS                                                                                    | Không nới gate                   |

- [x] AC trong scope có bằng chứng.
- [x] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).

Flow bổ sung: `pnpm.cmd test:flows -- test/flows/mf4-budget.flow-spec.ts`, PostgreSQL native/database seed tạm,
1 suite và 8 tests PASS; không chạy flow ngoài phạm vi.

## Delta áp dụng cho gói 6 (09/11/2026)

- SPEC review §4b RV-10 thắng thiết kế cũ: giữ định nghĩa pending trong `requests/spend`, bổ sung batch vào
  `PendingSpendContributions`; `pendingFor` và batch dùng cùng câu SQL, không sao chép predicate.
- RV-21: giữ nguyên `countedInYear` (M-19); `headStatus`/`baselineAllowed`/`baselineRefusal` đã có từ gói 5, giữ nguyên và kiểm hồi quy.
- C4-05: response số liệu nền thêm `basis: OWNER_DEPARTMENT`; chưa tính chi phí seat-tháng/dòng kho (ngoài phạm vi).
- Task 2/3 dùng `BudgetViewNumbersService` cho mọi số; held chưa attached được tính riêng cho view, không đổi mặc định
  `CommitmentRepo.totals` mà kiểm ngân sách dùng. `BudgetViewRepo` phân trang cả reference và commitment-only trong cùng snapshot.
- TẠM CHỌN: summary cộng khoản của dòng `NO_BUDGET` vào held/spent/pending và đếm Cost Center; ngân sách của dòng đó không
  được cộng (chưa có), không đếm là `overBudget` khi chưa có tổng ngân sách. Bảng và mine giữ số ngân sách/còn lại là null.
- Task 1–3: đã viết code và unit/http/integration; giai đoạn 1 chỉ typecheck/lint, chưa chạy Jest. Bằng chứng giai đoạn 2 sẽ ghi bên dưới.
- Không migration; `pnpm check` và test toàn bộ CHƯA chạy — Owner chạy khi audit.

### Bằng chứng theo AC

- R-I05/AC-7: `budget-mine.integration-spec.ts` và `budget-mine.http-spec.ts`; số của phòng, Trần ba thành phần, hạn kỳ,
  trần null khi chưa phát hành/bỏ phát hành, không thấy số toàn công ty, quyền và validate.
- QĐ-82l(1)/BR-MF1-06f: integration mine kiểm reserve chưa xác nhận, blocked không tính, batch bằng scalar; đúng ngưỡng
  còn lại thì qua, hơn một đơn vị thì chặn.
- FR-5.8a/R-C02: integration mine/table kiểm số âm, khoản chưa attached và `NO_BUDGET`, ngân sách/còn lại null.
- R-C06: integration table kiểm hóa đơn trước/sau 00:00 ngày 01/01 theo timezone tổ chức, cả dòng chưa có ngân sách;
  năm sau không nhận lại khoản chi của năm cũ. Cùng file kiểm page/count, hằng số query giữa một và nhiều dòng.
- Ô tổng/quyền: integration summary/table + HTTP summary/table; người duyệt chi đọc, các vai khác bị từ chối;
  kỳ có/chưa có trả trần/dự phòng hoặc null.
- C4-05/C4-13/M-19: HTTP baseline basis, integration table và cycle-baseline giữ ownership basis, head status,
  điều kiện BASELINE và tập phiên bản đã có. Không thay `countedInYear`.
- Tự review diff và review code nội bộ bởi agent điều phối; chưa thay Owner/peer review chính thức.
