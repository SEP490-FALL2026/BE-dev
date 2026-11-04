# Prompt cho Codex — implement 4 hạng mục BE (CI shard, self-service, một vai, seed hợp nhất)

Bạn là AI **chỉ implement**. Một phiên khác (Claude) sẽ review, chạy full test và verify sau. Làm đúng thiết kế đã duyệt,
không tự đổi nghiệp vụ, không tự mở rộng phạm vi.

## 0. Bối cảnh và ranh giới

- Repo làm việc: `D:\FPT\FALL2026\Code\BE-dev-software-license-management` (NestJS + Prisma 7 + PostgreSQL, pnpm). Nhánh gốc:
  `dev`. Repo tài liệu nghiệp vụ (chỉ đọc): `D:\FPT\FALL2026\Docs`.
- Làm **lần lượt từng hạng mục**, mỗi hạng mục một nhánh tách từ tip của hạng mục trước:
  1. `feat/ci-integration-shards` (từ `dev`)
  2. `feat/qd95-self-service-every-role` (từ nhánh 1)
  3. `feat/qd95-one-role-per-account` (từ nhánh 2)
  4. `feat/unified-seed-reset` (từ nhánh 3)
- Commit cục bộ sau mỗi **task** của plan (message: `<slug>: Task N — <tóm tắt>`). **Không push, không merge, không mở PR,
  không deploy, không SSH, không chạy lệnh nào chạm VPS hay database dùng chung.**
- Không sửa file ngoài phạm vi task. Không sửa `docs/workspace/items/*/spec.md` trừ mục _Changes and acceptance_ và bảng bằng
  chứng của `plan.md` (ghi lệnh đã chạy, lệch so với spec).
- Gặp chỗ spec mâu thuẫn với code hoặc thiếu quyết định nghiệp vụ: **dừng task đó**, ghi vào báo cáo (mục 5), làm tiếp task độc
  lập nếu có. Không tự quyết.
- **Không chạy** `prisma migrate reset` (Prisma chặn AI; lượt reset thật do Owner chạy) và không đặt biến
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.

## 1. Đọc trước khi code (theo thứ tự, đọc hết rồi mới bắt đầu)

**Quy tắc chung của repo BE**

1. `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `src/README.md`
2. `docs/rules/module-structure.md`, `docs/rules/api-contract.md`, `docs/rules/database-business.md`,
   `docs/rules/security-jobs.md`, `docs/rules/operational-commands.md`, `docs/rules/documentation.md`
3. `docs/decisions/0019-module-tiers-and-public-api.md`
4. `test/README.md`, `test/support/README.md`, `scripts/README.md`
5. `docs/generated/routes.md` (route → controller → service hiện có)

**Nghiệp vụ (repo Docs, bản đang có trong thư mục — chưa commit cũng là bản hiện hành)**

6. `Decisions/project-decisions.md`: mục `QĐ-95` (tìm `QĐ-95a`), `QĐ-93a`→`QĐ-93e`
7. BRD `Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md`: §4.1–4.3, ADR-08, FR-8.x
8. User Stories `BE-UserStory/src/EP-01.md` (US-01-01, US-01-03, US-01-09), `EP-12.md` (US-12-15), `EP-16.md` (US-16-04) —
   chỉ các AC mà spec của hạng mục đang làm nêu.

**Thiết kế của từng hạng mục (đọc lại khi bắt đầu hạng mục đó)** — spec là hợp đồng, plan là thứ tự task:

9. `docs/workspace/items/ci-integration-shards/spec.md` + `plan.md`
10. `docs/workspace/items/qd95-self-service-every-role/spec.md` + `plan.md`
11. `docs/workspace/items/qd95-one-role-per-account/spec.md` + `plan.md`
12. `docs/workspace/items/unified-seed-reset/spec.md` + `plan.md`

Trước mỗi task: đọc mọi file mà task nêu ở `Files:` và code/test lân cận (implementation gần nhất cùng kiểu) để code theo đúng
idiom của repo. Mục _Owner decisions_ của mỗi spec đều đã **đóng** — làm đúng như ghi.

## 2. Cách làm mỗi task

- Làm đúng `Files`, `Depends on`, `Acceptance` của task; test đi cùng task (viết test cho các dòng test matrix mà task phủ).
- Giữ thứ tự task: plan được sắp để build/test được sau mỗi task (ví dụ ở hạng mục một vai, chỉ mục DB là task cuối).
- Contract HTTP đổi ⟹ chạy `pnpm openapi:export` và sửa manifest/registry/ví dụ mà gate yêu cầu ngay trong task đó; route đổi ⟹
  `pnpm arch:routes`.
- Không thêm dependency, không tắt lint/gate, không xóa test để cho xanh; test của tính năng bị bỏ được thay theo bảng _test cũ →
  test mới_ trong plan (ghi lại bảng đó).

## 3. Kiểm tra được phép chạy (chỉ bộ nhanh)

Sau mỗi task:

```bash
pnpm typecheck
pnpm lint
pnpm arch:check
pnpm rules:check
pnpm test:gates
pnpm test -- <đường dẫn các file unit .spec.ts vừa đổi>
pnpm test:http -- <đường dẫn các file http-spec vừa đổi>     # chỉ khi task chạm HTTP
pnpm test:scripts                                            # chỉ khi task chạm scripts/ hoặc workflow
```

**Không chạy**: `pnpm check`, `pnpm test:integration` (toàn bộ hay theo file), `pnpm test:e2e`, timing/serial, `test:mutation`.
Integration/e2e: **viết** đúng như test matrix nhưng **không chạy** — phiên review sẽ chạy. Hạng mục CI: không có cách chạy
Actions từ máy; chỉ chạy `pnpm test:scripts`, `pnpm rules:format`, `pnpm exec prettier --check .github/workflows/*.yml`.

Nếu một lệnh nhanh đỏ vì lỗi có sẵn trước thay đổi của bạn: ghi lại (lệnh + dòng lỗi), không sửa ngoài phạm vi.

## 4. Thứ tự tổng

1. `ci-integration-shards` — Task 1 → 4 (Task 3 là nhánh thử, chỉ chuẩn bị nội dung, không push; Task 4 cần số đo thật ⟹ ghi
   "chờ số đo", bỏ qua).
2. `qd95-self-service-every-role` — Task 1 → 2.
3. `qd95-one-role-per-account` — Task 1 → 7.
4. `unified-seed-reset` — Task 1 → 8 (Task 9 là tài liệu ở repo Docs: chỉ làm khi đã xong 1–8; không commit repo Docs). Mọi bước
   "Owner chạy thật" (seed local có reset, runbook VPS) chỉ ghi lại là _chờ Owner_.

## 5. Báo cáo cuối (một file)

Ghi vào `D:\FPT\FALL2026\NOTE MD\codex-qd95-seed-ci-report.md`, mỗi hạng mục một mục:

- Nhánh và danh sách commit (hash + message).
- Task đã xong / chưa xong / dừng vì sao (kèm file:line của chỗ spec mâu thuẫn code).
- Lệnh kiểm tra nhanh đã chạy và kết quả thật (pass/fail, số test), lỗi có sẵn nếu có.
- Test integration/e2e đã **viết** nhưng chưa chạy (đường dẫn file).
- Mọi lệch so với spec/plan và lý do; bảng test cũ → test mới.
- Câu cuối mỗi hạng mục: "Chưa chạy `pnpm check`, integration, e2e — chờ phiên review."
