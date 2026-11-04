# Plan: ci-integration-shards

- [Spec](spec.md); revision đầu vào: BE `d7b8fe8d`.
- Phụ trách: chưa giao. Thiết kế ban đầu bởi: AI theo giao việc của Owner (04/11/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `.github/workflows/ci.yml`, `nightly.yml`, `deploy.yml`, `.github/actions/setup`, `.github/actions/test-database`,
`scripts/ci/affected-modules.mjs`, `scripts/verify/check-script-order.test.mjs`, `test/gates/deployment-roles.gate-spec.ts` (phần
đọc ci.yml), `test/README.md:130–160`, mục _Owner decisions_ của spec. Làm OD-CI1 → OD-CI5 (Owner chọn
04/11/2026); OD-CI6 không làm. Không chạy integration local: bằng chứng là run Actions thật.

## Tasks

### Task 1: job `select`, shard, job in-band, test cấu trúc

- Files: `.github/workflows/ci.yml`, `scripts/verify/check-script-order.test.mjs`.
- Depends on: none.
- Acceptance: `select` xuất `paths`/`serial`; `integration` matrix 3 shard với `if` cấp job, `--shard=i/3 --passWithNoTests`, artifact
  tên riêng; `integration-inband` chứa timing + serial; `deploy.needs` thêm `integration-inband`; comment đầu ci.yml mô tả tầng mới;
  test cấu trúc kiểm theo từng job (provision trước `test:integration`) và danh sách shard khớp N.
- Verify: `pnpm test:scripts` → xanh; đổi tạm `[1, 2, 3]` thành `[1, 2]` → test đỏ, rồi hoàn lại; `pnpm rules:format`;
  `pnpm test:gates -- deployment-roles` → xanh.

### Task 2: các lựa chọn bớt phút Owner đã chọn

- Files: `.github/workflows/ci.yml` (OD-CI2/3/5), `.github/workflows/nightly.yml` (OD-CI4), `test/README.md:132–158`,
  `docs/workspace/items/be-test-architecture-redesign/spec.md` (ghi `OD-T2` bị thay một phần, link hạng mục này).
- Depends on: Task 1.
- Acceptance: đúng các mục Owner chọn ở spec; tài liệu tầng test khớp YAML.
- Verify: `pnpm test:scripts`, `pnpm rules:format`, `pnpm exec prettier --check .github/workflows/nightly.yml`, `pnpm rules:check`.

### Task 3: thử chặn deploy trên nhánh thử (không merge)

- Files: nhánh `ci-trial/deploy-gate` từ tip của Task 2: tạm thêm `push.branches: 'ci-trial/**'`, job `deploy-gate-probe` (spec),
  một test cố ý đỏ.
- Depends on: Task 2.
- Acceptance: run đỏ ⟹ probe bỏ qua, shard khác chạy hết; bỏ test đỏ ⟹ probe chạy. Nhánh thử xóa sau khi ghi run id.
- Verify: run id hai lượt ghi ở bảng dưới.

### Checkpoint (run thật, theo đúng repo)

1. PR vào `dev` ở `SEP490-FALL2026/BE-dev`: vì đổi `.github/workflows/**` nên `ALL` — kiểm 3 shard + in-band, tổng file = `--listTests`.
2. Sau merge, một push lên `dev` của BE-dev chỉ chạm một file `src/modules/<m>/`: shard rỗng xanh; push chỉ đổi `docs/**`: shard/in-band bỏ qua.
3. Repo deploy `WDP301-FA26-GR8/BE`: push `dev`, mở PR `dev → main` (OD-CI3: không có run `pull_request`), merge → shard + in-band + deploy; ghi thời gian.
4. OD-CI4 chỉ có hiệu lực khi đã ở `main` của repo deploy: kiểm lượt chạy Chủ nhật kế tiếp.

### Task 4: đặt timeout theo số đo

- Files: `.github/workflows/ci.yml`, `test/README.md:139–146`.
- Depends on: ≥ 2 run `main` sau Checkpoint.
- Acceptance: `timeout-minutes` của shard = `ceil(job shard lâu nhất × 1,5)`; bỏ "Ngoại lệ Owner … 40 phút".
- Verify: `pnpm rules:format`, `pnpm test:scripts`.

## Verification and handoff

| Lệnh / kiểm tra AC                             | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ---------------------------------------------- | --------------------- | ----------------- | ----------------------- |
| `pnpm test:scripts`, `pnpm rules:format`       | —                     | chưa chạy         | —                       |
| Checkpoint 1–4 (run id)                        | —                     | chưa chạy         | —                       |
| Task 3 chặn deploy (run id đỏ/xanh)            | —                     | chưa chạy         | —                       |
| Phút Actions sau 1 tuần (billing, hai tổ chức) | —                     | chưa đo           | —                       |

- [ ] AC trong scope có bằng chứng (run id).
- [ ] Spec/plan phản ánh đúng YAML cuối; lựa chọn Owner ghi ở spec.
- [ ] Giao Owner review; cập nhật roadmap.

### B?ng ch?ng tri?n khai local ? Task 1 (04/11/2026)

- Test c?u tr?c `node --test scripts/verify/check-script-order.test.mjs`: 4 pass, 0 fail.
- ??t bi?n th? c?ng matrix `[1, 2]`: exit 1, expected `[1, 2, 3]`; ?? ho?n l?i bytes g?c.
- `pnpm rules:format`: pass. `pnpm exec prettier --check .github/workflows/*.yml`: pass.
- Kh?ng ch?y Actions, integration, timing, serial hay e2e theo ph?m vi giao vi?c.
