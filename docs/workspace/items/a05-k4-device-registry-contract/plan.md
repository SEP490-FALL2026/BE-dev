# Plan: contract sổ thiết bị cho K4 — port licensing cần từ G7 và phân rã `g4-device-dependent-features`

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc A-05. Thiết kế ban đầu bởi: AI theo giao việc A-05.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `in-progress` (port + contract test với mock xong local, chưa commit; chờ Owner chốt contract G7). PR: chưa có.

## Before coding

Đọc DEV-A A-05, README audit 31/10, khung `g4-device-dependent-features`, `g4-request-and-transfer-integration`, scope map
G3/G4/G6, US EP-02/03/04/07/09 (Docs `726219a`), source `licensing/{license-key,provisioning,assignment}`,
`personnel/{offboarding,transfer-review}`, `catalog/plan-terms`. Không có sổ thiết bị trong BE: chỉ thêm type, luật thuần và
test double; không đăng ký vào Nest.

## Tasks

### Task 1: port và luật thuần

- Files: `src/modules/licensing/device-binding/device-binding.types.ts`, `device-binding.policy.ts`.
- Depends on: none.
- Acceptance: port `DeviceRegistryPort` (4 method, lỗi là giá trị, reject chỉ khi không trả lời được); luật cấp/giới hạn/gỡ/
  đối chiếu theo thứ tự cố định; không import Nest/Prisma/module khác.
- Verify: `pnpm exec tsc --noEmit`, `pnpm exec eslint src/modules/licensing/device-binding` → exit 0.

### Task 2: test double và contract test với mock

- Files: `test/support/device-registry-contract-double.ts`, `src/modules/licensing/device-binding/device-binding.policy.spec.ts`.
- Depends on: Task 1.
- Acceptance: các ca thiết bị hợp lệ, chưa đăng ký/cá nhân, người khác giữ, bàn giao, chưa xác nhận, giới hạn, lặp thao tác,
  lỗi sổ, quyền; contract của port trên stand-in; tên describe ghi "contract test with mock, NOT integration".
- Verify: `pnpm exec jest src/modules/licensing/device-binding` → xanh; đột biến bỏ luật người giữ hoặc luật lặp ⟹ đỏ.

### Task 3: phân rã, re-pin và bàn giao Owner

- Files: năm thư mục `docs/workspace/items/a05-*` phía sau, `g4-device-dependent-features/{spec,plan}.md` (`superseded`),
  `docs/workspace/items/README.md`, `src/modules/licensing/README.md`, `docs/roadmap.md`.
- Depends on: Task 1.
- Acceptance: mỗi Story/AC/vế của khung cũ có đúng một chủ mới; câu hỏi Q1→Q8 có mặc định; scope map ở `docs/roadmap.md`.
- Verify: `pnpm rules:check`, `pnpm rules:format` trên cây tích hợp (roadmap đã có dòng A-05) → xanh.

## Verification and handoff

| Lệnh / kiểm tra AC                                    | Revision / môi trường                                                  | Kết quả thực chạy                                                                                   | Giới hạn / việc còn lại                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm exec jest src/modules/licensing/device-binding` | BE `6eb12d1` + cây làm việc chưa commit, worktree cô lập tại `6eb12d1` | 1 suite, 27 test xanh; hai đột biến (luật người giữ, luật lặp) làm đỏ 2 và 1 test                   | contract test với mock, **không phải integration** |
| `pnpm exec tsc --noEmit`, `pnpm exec eslint` file mới | như trên                                                               | exit 0                                                                                              | —                                                  |
| Gate đầy đủ                                           | như trên                                                               | kết quả ghi trong phiên làm việc, không có file báo cáo trong repo; phải chạy lại trên cây tích hợp | roadmap đã tích hợp; chạy lại trên cây tích hợp    |

- [x] Phần trong scope (port, luật, contract test) có bằng chứng; blocker G7 ghi rõ.
- [ ] Owner trả lời Q1→Q8; adapter thật + integration PostgreSQL ở hạng mục phía sau.
- [ ] Giao Owner review trên revision cụ thể; không ghi `accepted`.
