# Prototype remediation G0/1a/1b — cách tái dựng

Tài liệu chính: [research](../research.md), [spec](../spec.md), [plan](../plan.md), [test plan](../test-plan.md).
**Trạng thái (15/10/2026).** Mã sản phẩm đã nằm trong nhánh `fix/g0-g1-remediation-2026-10-15` (PR về `dev`), không cần áp diff
này nữa. Thư mục này giữ **lịch sử** (diff và evidence của lượt 1–3 trên prototype) và **công cụ kiểm chứng** dùng lại
trên nhánh sửa: `mutate-prototype.mjs`, `live-smoke-remediation.mjs`, `reset-live.sh`. Phần 1–4 dưới đây tái dựng
prototype lịch sử trên clone riêng (không áp vào checkout của Owner, không push); phần 5 chạy công cụ trên nhánh sửa.
Test candidates của prototype (`candidates-scale.integration-spec.ts`, tới 50 000) khác test sản phẩm
`test/integration/account-candidates-boundaries.integration-spec.ts` (tới 6 000, không ghi evidence).

## Artifact

| Tệp                                     | Vai trò                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `remediation.prototype.diff`            | Toàn bộ thay đổi prototype so với BE `a8ba88f` (source, test, docs trong clone)                                         |
| `candidates-scale.integration-spec.ts`  | Test quy mô R-03 (tới 50 000), chỉ dùng cho prototype; chép vào `test/integration/rr-candidates-v2.integration-spec.ts` |
| `mutate-prototype.mjs`                  | Runner mutation: control run, phân loại kết quả, khôi phục trong `finally`; từ chối clone có thay đổi chưa commit       |
| `live-smoke-remediation.mjs`            | Live smoke 16 operation cho prototype: chờ worker sẵn sàng và trạng thái outbox cuối có deadline, ghi timeline          |
| `reset-live.sh`                         | Tạo lại DB live và chạy CLI thật qua PTY; tham số `IMAGE`, `ENV_FILE` (env tối thiểu cho R-13)                          |
| `mutate-n1.mjs`                         | Runner lượt đầu — lịch sử, không dùng                                                                                   |
| `probe-notin.cjs`, `probe-contains.cjs` | Probe Prisma 7.9.1 cho R-03/N-6 (chỉ đọc)                                                                               |
| `evidence/`                             | Kết quả đã lọc theo run id; [chỉ mục](evidence/README.md) có SHA-256 của mọi artifact và cây kỳ vọng                    |

## 1. Dựng snapshot trong clone riêng

Git Bash (Windows) hoặc sh (Linux). `<gói>` là thư mục chứa README này; `<BE>` là checkout BE bất kỳ có commit `a8ba88f`.

```sh
git clone --no-local <BE> proto && cd proto
git checkout -b proto-snapshot a8ba88fd81581000ade8b84f1c1d3b4583c3d3e1
sha256sum <gói>/prototype/remediation.prototype.diff   # so với chỉ mục evidence, mục lượt cuối
git apply --check <gói>/prototype/remediation.prototype.diff
git apply <gói>/prototype/remediation.prototype.diff
cp <gói>/prototype/candidates-scale.integration-spec.ts test/integration/rr-candidates-v2.integration-spec.ts
git add -A
git write-tree                                          # phải bằng "cây kỳ vọng" trong chỉ mục evidence
# Snapshot LOCAL, chỉ trong clone này, không push. Runner mutation cần cây sạch để khôi phục và so hash.
git -c user.name=proto -c user.email=proto@local commit -qm "prototype snapshot (local only)"
git status --porcelain                                  # phải rỗng
git rev-parse HEAD HEAD^{tree}                          # ghi lại cùng kết quả chạy
git diff --quiet a8ba88f HEAD -- package.json pnpm-lock.yaml pnpm-workspace.yaml && echo deps_unchanged
git rev-parse HEAD:pnpm-lock.yaml                       # blob lockfile = của a8ba88f (sha256 tệp đổi theo CRLF checkout)
```

Không chép `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml` từ working tree đang có dependency dịch. Không bỏ
kiểm tra cây sạch của runner.

## 2. Gate trong clone

```sh
pnpm install --frozen-lockfile
pnpm check                                              # sinh Prisma client trước lint; exit 0
```

PostgreSQL 17 riêng, role `NOSUPERUSER CREATEDB`, cổng localhost, không dùng database dùng chung:

```sh
docker network create --label review=<run> <net>
docker run -d --name <pg-test> --label review=<run> --network <net> -e POSTGRES_PASSWORD=<ngẫu nhiên> \
  -p 127.0.0.1::5432 postgres:17-alpine
docker exec <pg-test> psql -U postgres -c "CREATE ROLE <role> LOGIN NOSUPERUSER CREATEDB PASSWORD '<ngẫu nhiên>';"
export TEST_DATABASE_ADMIN_URL=postgresql://<role>:<mật khẩu>@127.0.0.1:<cổng host>/postgres
pnpm test:integration
pnpm test:e2e
```

## 3. Mutation

Trên chính snapshot đã commit (hoặc một clone khác của nó), không chạy song song với test khác dùng cùng server:

```sh
node <gói>/prototype/mutate-prototype.mjs --clone <proto> --list        # mọi mutation "applies once"
node <gói>/prototype/mutate-prototype.mjs --clone <proto> --admin-url "$TEST_DATABASE_ADMIN_URL" \
  --out <thư mục kết quả> --run-id <id>
git -C <proto> status --porcelain                                         # vẫn rỗng
```

Mã thoát: 0 khi control xanh và mọi mutation `KILLED`; 1 khi có mutation khác `KILLED`; 2 khi clone bẩn;
3 khi control fail; 4 khi khôi phục fail.

## 4. Live (API/worker build thật, SMTP sink, CLI qua PTY)

Thư mục làm việc `<work>` (ngoài repo) có:

- `secrets.env`: `RUN`, `ADPW`, `SAPW`, `LIVEDB=slm_live_rr_<RUN>`, `PGPORT`;
- `live.env`: biến của `env-schema.ts`, secret sinh ngẫu nhiên, `PORT=54201`, `SMTP_HOST=127.0.0.1`,
  `SMTP_PORT=52525`, `OUTBOX_POLL_INTERVAL_MS=1000`, `AUTH_LOGIN_BLOCK_SECONDS=30`, `RATE_LIMIT_LIMIT=10000`;
- `cli-min.env`: chỉ có comment (CLI nhận `DATABASE_URL` qua `-e`, `NODE_ENV=production` từ image);
- `pty/` chép từ [runner re-review](../../../../reviews/backend-g0-g1-rereview-after-fix-2026-10-14/pty/);
  `pty-secret/pw` (= `SAPW`), `pty-secret/other`, `pty-secret/weak`.

Container PostgreSQL live tên `slm-rr-pg-<RUN>`, nhãn `review=slm-g0g1-<RUN>`, network `slm-rr-net-<RUN>` với alias
`rrpg`, role `rr_admin` như trên. Image build từ snapshot: `docker build --label review=slm-g0g1-<RUN> -t <image> .`.

Mỗi lượt smoke reset DB mới, chạy tuần tự:

```sh
IMAGE=<image> ENV_FILE="$(cygpath -w <work>)\\cli-min.env" sh <gói>/prototype/reset-live.sh <work> <proto>
node <gói>/prototype/live-smoke-remediation.mjs <proto> <work>   # in PASS/FAIL, JSON tổng và đường dẫn timeline
mv <work>/live-run <work>/live-run-<n>                            # giữ log + timeline của từng lượt
```

Runner sự cố CSDL (`docker pause/stop` chỉ container có đúng nhãn):
`R02_PORT=54202 node <re-review>/r02-db-outage.mjs <proto> <work> P A A2 B C D D4 E M`. Phase `C` stop/start container
nên cổng host đổi: cập nhật `PGPORT` trước lệnh kế tiếp.

## Kỳ vọng

Số đếm và hash của lượt cuối ở [chỉ mục evidence](evidence/README.md). Một lượt tái dựng đúng: cây và hash khớp chỉ mục;
`pnpm check`, integration, e2e exit 0; mutation control xanh và mọi mutation `KILLED` (0 survived, unapplied,
infra-error, restore failed); live smoke 0 FAIL ở cả ba lượt; R-02 0 FAIL. Một kết quả khác phải điều tra trước khi dùng.

## 5. Chạy công cụ trên nhánh sửa

Clone **cây sạch** của nhánh (runner mutation từ chối cây có thay đổi chưa commit), `pnpm install --frozen-lockfile`,
`pnpm check`, rồi dùng đúng các lệnh ở phần 3 và 4 với `<proto>` là clone đó (không cần bước snapshot vì nhánh đã có
commit). `--list` phải báo mọi mutation áp đúng một lần. Kết quả của lượt kiểm chứng trên nhánh sửa:
[báo cáo tích hợp](../../../../reviews/backend-g0-g1-integration-2026-10-15.md) và
[chỉ mục evidence](evidence/README.md).
