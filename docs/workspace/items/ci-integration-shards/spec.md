# Spec: ci-integration-shards — integration CI chạy song song 3 shard và bớt phút Actions

- Phụ trách: chưa giao — dev/AI nhận hạng mục sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI theo giao việc của Owner (phiên 03–04/11/2026). Owner yêu cầu shard 03/11 và đồng ý làm ngay
  04/11; các lựa chọn bớt phút ở `## Owner decisions`.
- Thiết kế: `draft` (sửa sau review đối kháng 04/11/2026). Owner review: chưa review toàn spec.
- Nguồn: Docs `0125072` (hạng mục không đổi nghiệp vụ, không dùng Story/AC), BE `d7b8fe8d` (`dev`). Số đo lấy từ GitHub Actions
  của `WDP301-FA26-GR8/BE` (repo deploy) và `SEP490-FALL2026/BE-dev` (repo phát triển, nơi có PR) và billing API (đọc 03–04/11/2026).
- Nhóm roadmap: không thuộc nhóm G — `technical-enabler` (xem `## Sizing decision`).
- Hạng mục cùng đợt (thứ tự làm): **ci-integration-shards** → [`qd95-one-role-per-account`](../qd95-one-role-per-account/spec.md)
  và [`unified-seed-reset`](../unified-seed-reset/spec.md) (cùng một bản phát hành).
- Thay một phần quyết định `OD-T2` của [be-test-architecture-redesign](../be-test-architecture-redesign/spec.md) ("một runner,
  shard chỉ khi đủ phút") theo yêu cầu shard của Owner 03/11/2026 (OD-CI1).
- [Kế hoạch](plan.md).

## Business outcome

Một lượt CI trên `main` xong mọi job test trong ≤ 20 phút (đo từ lúc run bắt đầu tới khi job test cuối xong, **trước** `deploy`;
thời gian deploy ghi riêng), thay vì ~46–50 phút hiện nay: integration chạy 3 shard song song cùng một job in-band riêng, chỉ khởi
động khi có suite cần chạy; deploy vẫn chỉ chạy khi mọi job test xanh. Kèm các thay đổi bớt phút Actions mà Owner chọn ở
`## Owner decisions`. Kiểm bằng run thật trên hai repo.

## Sizing decision

- Container: yêu cầu trực tiếp của Owner 03/11/2026 (việc 2 trong ba việc của đợt).
- Mode: `technical-enabler`.
- Outcome and owner: pipeline CI của repo (`.github/workflows/ci.yml`, `nightly.yml`) và test bảo vệ cấu trúc của nó.
- Boundaries: workflow YAML, test script đọc workflow, tài liệu mô tả tầng test; không đổi test, cấu hình Jest, mã nguồn hay
  `deploy.yml`.
- Not larger: tối ưu test chậm, sửa job `mutation` nightly đang đỏ, cân bằng shard theo thời gian chạy là việc riêng.
- Not smaller: shard mà không bớt phút làm hết hạn mức Actions sớm hơn (mục Supporting references), nên hai phần đi cùng nhau.
- Siblings: [`qd95-one-role-per-account`](../qd95-one-role-per-account/spec.md), [`unified-seed-reset`](../unified-seed-reset/spec.md).
- Scope map: n/a

## Primary Story/AC

| Story | AC         | Coverage | Phần còn lại thuộc                                                                      |
| ----- | ---------- | -------- | --------------------------------------------------------------------------------------- |
| —     | CI-SHARD.1 | n/a      | gỡ chặn `qd95-one-role-per-account`, `unified-seed-reset` (CI nhanh hơn cho hai PR sau) |

## Owner decisions

| Mã     | Câu hỏi                                   | Trạng thái / mặc định của spec                                                                                  |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| OD-CI1 | Shard integration?                        | **Owner yêu cầu 03/11/2026**: 3 shard + job in-band riêng                                                       |
| OD-CI2 | Hủy run cũ khi có run mới?                | **Owner chọn 04/11**: chỉ hủy run `pull_request`; không hủy push/`workflow_dispatch`                            |
| OD-CI3 | Bỏ CI riêng cho PR vào `main`?            | **Owner chọn 04/11**: `pull_request.branches: [dev]` — push `main` sau merge vẫn chạy toàn bộ rồi mới deploy    |
| OD-CI4 | Nightly mỗi đêm → hằng tuần?              | **Owner chọn 04/11**: Chủ nhật 02:00 giờ VN + chạy tay; thay vế "once a night" của `OD-T2`                      |
| OD-CI5 | Bỏ CI của `push: dev` ở repo deploy?      | **Owner chọn 04/11**: job `select` trả `run=false` khi `github.repository == 'WDP301-FA26-GR8/BE'` và ref `dev` |
| OD-CI6 | Nhánh `hien-dev` ở repo deploy tự chạy CI | **Owner chọn 04/11**: không xử lý (ngoài repo này)                                                              |

Implementer làm OD-CI1 → OD-CI5; OD-CI6 không làm.

## Supporting references

- **Thời gian (run thật).** `main` mới nhất `41671701165` (03/11): job integration 46,2 phút (bước song song 42,2), cả run 50 phút;
  deploy thêm 4–9 phút (`41671701165`: 16:58:19→17:02:14; `41293571298`: 10:09:42→10:18:50). 01/11 (`41293571298`): integration 37,2
  (song song 33,4, timing ~1, serial ~1,5). Quality 9–11, http 3–4, e2e ~2. Setup + provision + build mỗi job ~1,5–1,8 phút.
- **Số file:** 322 `*.integration-spec.ts` ngoài `_serial` ở `d7b8fe8d` (artifact `41671701165`: 322 file, 3 885 test). Jest 30.4.2
  chia shard theo sha1 đường dẫn: 108/107/107 file, thời gian file 27,2 / 25,7 / 31,2 phút-file (lệch max/min 1,21; shard 3 giữ
  các file 175 s, 92 s, 65 s) ⟹ shard chậm nhất ~15,6 phút test + ~1,6 phút setup.
- **Phút Actions.**
  - `WDP301-FA26-GR8` (Free, private): tháng 10 dùng 2 000,2 phút (đúng hạn mức). Cộng thời lượng job tới tối 03/11 ≈ 763 phút
    (billing API dừng ở 586 lúc 03/11 01:24) ⟹ với nhịp hiện tại hết hạn mức khoảng **08–10/11**; sau đó Actions — cả CD — dừng
    tới 01/12.
  - Một lần phát hành (push `dev` + PR `dev→main` + push `main`) tốn ~173 phút tính tiền (52+55+66 ở `41293526275`/`41293558638`/
    `41293571298`; 60+45+69 ở `41671643972`/`41671676203`/`41671701165`).
  - Nightly 28–41 phút mỗi đêm (`41559299396`: 28, `41357327777`: 37, `41245975409`: 41); job `mutation` đỏ 5/5 đêm gần nhất.
  - `SEP490-FALL2026` (nơi có PR vào `dev`): tháng 10 dùng 1 089, 01–03/11 dùng 562.
- **Không có luật bảo vệ nhánh:** `protected: false` ở `main`/`dev`; API rulesets/branch protection trả 403 "Upgrade to GitHub Pro"
  ở cả hai repo. Thứ đọc tên job/artifact: `deploy.needs` (ci.yml), `test/gates/deployment-roles.gate-spec.ts:265` (chỉ khớp chuỗi
  `uses: deploy.yml` / `mode: deploy`), `scripts/verify/check-script-order.test.mjs` (lấy văn bản từ `\n  integration:` tới cuối
  file), tài liệu `test/README.md:132–158`, `docs/reviews/be-architecture-test-acceptance-2026-10-29/README.md:283–286`
  (`test-timings-integration`). `scripts/verify/affected-modules.test.mjs` chỉ liệt kê đường dẫn, không đọc tên job.
- **Hai repo:** PR vào `dev` chỉ có ở `SEP490-FALL2026/BE-dev`; deploy và nightly chỉ chạy ở `WDP301-FA26-GR8/BE` (nhánh mặc định
  `main` của BE-dev không có `nightly.yml`). ci/nightly/deploy.yml trên `main` của repo deploy giống hệt `d7b8fe8d`.

## Explicit out of scope

- Sửa nguyên nhân job `mutation` nightly đỏ.
- Cân bằng shard theo thời gian chạy (custom `testSequencer`) — chỉ làm khi độ lệch (max − min) / min của thời gian bước test
  giữa các shard > 30 % trên 2 run `main` liên tiếp.
- Runner lớn hơn, cache build, chia nhỏ job quality.

## Dependencies and blockers

- Không phụ thuộc hạng mục nào; merge **trước** hai hạng mục cùng đợt.
- Hạn mức phút của `WDP301-FA26-GR8` có thể hết trước khi hạng mục này kịp giúp (08–10/11): Owner cân nhắc OD-CI3/4/5/6 sớm.

## Ownership: module, data, API

Không áp dụng cho module/dữ liệu/API. File: `.github/workflows/ci.yml`, `.github/workflows/nightly.yml` (nếu OD-CI4),
`scripts/verify/check-script-order.test.mjs`, `test/README.md`, `docs/workspace/items/be-test-architecture-redesign/spec.md`
(đánh dấu `OD-T2` bị thay một phần). Bằng chứng lịch sử ở `docs/reviews/**` không sửa.

## Behavior and design

**Job `select` (mới, rẻ).** Checkout `fetch-depth: 0` + `actions/setup-node` (không `pnpm install`: `scripts/ci/affected-modules.mjs`
và `module-edges.mjs` chỉ dùng built-in `node:`), chạy đúng biểu thức `BASE` và script chọn suite đang ở `ci.yml` (dòng 184–195),
xuất `paths`, `serial` và `run` (OD-CI5) làm output của job.

**Shard (ci.yml).**

- Job `integration` thành matrix `strategy: { fail-fast: false, matrix: { shard: [1, 2, 3] } }`, `needs: select`,
  `if: needs.select.outputs.paths != 'NONE'` ở **cấp job** (không khởi động runner khi không có gì để chạy). Giữ tên job,
  `services`, các bước checkout, setup, provision role, build (suite CLI dùng `TEST_CLI_RUNTIME=dist`).
- Lệnh: `pnpm test:integration --maxWorkers=2 --shard=${{ matrix.shard }}/3 --passWithNoTests` (+ `$PATHS` khi không phải `ALL`).
  `--passWithNoTests` cần vì trên `dev`/PR chỉ chạy module bị ảnh hưởng và một shard có thể rỗng (Jest bỏ `globalSetup` khi rỗng).
- Job mới `integration-inband`, `needs: select`,
  `if: needs.select.outputs.paths != 'NONE' || needs.select.outputs.serial == 'SERIAL'`, cùng service PostgreSQL, provision role,
  build: bước timing (`paths != 'NONE'`) và serial (`serial == 'SERIAL'`, cần `TEST_CLI_RUNTIME=dist` và
  `TEST_DATABASE_BOOTSTRAP_URL`) giữ nguyên lệnh và env hiện có.
- Artifact: `test-timings-integration-${{ matrix.shard }}`, `test-timings-integration-inband` (upload-artifact v4 từ chối tên trùng;
  không gì tải/gộp các artifact này).
- `deploy.needs: [quality, http-contract, integration, integration-inband, e2e-smoke]`. `needs: integration` chờ đủ 3 shard và
  đỏ nếu một shard đỏ; `deploy` có `if` không gọi hàm trạng thái nên GitHub thêm `success()` ngầm — job cần bị đỏ, hủy hoặc bỏ qua
  ⟹ `deploy` bỏ qua. Trên `main` `paths` luôn là `ALL` nên không job test nào bị bỏ qua.
- `timeout-minutes`: giữ 70 cho lượt đầu; sau ≥ 2 run `main` đặt `ceil(job shard lâu nhất × 1,5)` theo quy tắc của `test/README.md`
  và bỏ đoạn "Ngoại lệ Owner … 40 phút" đã cũ.

**Bớt phút (Owner chọn cả OD-CI2 → OD-CI5).**

- OD-CI2:
  `concurrency: { group: ci-${{ github.event_name }}-${{ github.ref }}, cancel-in-progress: ${{ github.event_name == 'pull_request' }} }`.
  Không hủy push vì push `dev` chọn suite bằng diff `github.event.before…sha` — hủy run trước sẽ làm commit của nó không bao giờ được
  test (ví dụ BE-dev `41239895204` paths=ALL rồi `41240057304` paths=NONE hai phút sau). Hệ quả cần biết: hai push liên tiếp lên
  `main` sẽ xếp hàng cả run (kể cả deploy), không chỉ job deploy như hôm nay.
- OD-CI3: `pull_request.branches: [dev]` (giữ `paths: *watched`).
- OD-CI4: `nightly.yml` `cron: '0 19 * * 6'` + `workflow_dispatch`; sửa comment đầu `nightly.yml`, `ci.yml` (dòng 9) và
  `test/README.md:132–136` cho khớp.
- OD-CI5: mọi job (quality, http-contract, integration, integration-inband, e2e-smoke) thêm `needs: select` và
  `if: needs.select.outputs.run == 'true'` (giữ điều kiện hiện có bằng `&&`).

**Ước lượng sau thay đổi (OD-CI1 + OD-CI2/3):** run `main` ≈ max(quality 10–11, shard ~17) ≈ 17–19 phút trước deploy; phút tính tiền
một lần phát hành ~173 → ~140; bỏ PR `dev→main` (OD-CI3) bớt thêm ~45–55 phút/lần; nightly hằng tuần (OD-CI4) bớt ~700–1 000
phút/tháng. Mục tiêu đo sau 1 tuần: dự phóng ≤ 1 800 phút/tháng mỗi tổ chức với nhịp phát hành thực tế.

Migration, transaction, jobs/storage, collection API: không áp dụng.

## Test matrix

| AC / rủi ro                    | Tình huống                                                                                                                                                                                                       | Cấp test                                                                        | Kết quả mong đợi                                                                                                             | Bằng chứng sau implement |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| CI-SHARD.1 đủ file             | PR vào `dev` ở BE-dev (đổi `.github/workflows/**` ⟹ `ALL`)                                                                                                                                                       | Run Actions thật                                                                | 3 shard xanh; tổng `files` trong `test-timings-integration-*` = `jest --listTests` của config integration (322 ở `d7b8fe8d`) | planned                  |
| CI-SHARD.1 shard rỗng          | Sau merge, push lên `dev` của BE-dev chỉ chạm 1 file `src/modules/<m>/`                                                                                                                                          | Run Actions thật                                                                | Shard không có file xanh (`--passWithNoTests`); tổng file vẫn đúng tập module bị ảnh hưởng                                   | planned                  |
| CI-SHARD.1 không có gì để chạy | Push chỉ đổi `docs/**`                                                                                                                                                                                           | Run Actions thật                                                                | `select` chạy; `integration`/`integration-inband` bị bỏ qua ở cấp job, không khởi động runner                                | planned                  |
| CI-SHARD.1 in-band             | Push `main` ở repo deploy                                                                                                                                                                                        | Run Actions thật                                                                | `integration-inband` chạy timing + serial xanh, song song với shard                                                          | planned                  |
| CI-SHARD.1 chặn deploy         | Nhánh thử `ci-trial/deploy-gate` (như acceptance README:237–286): thêm tạm job `deploy-gate-probe` với `needs` như `deploy`, `if: github.ref != 'refs/heads/main'`; chạy với một test cố ý đỏ, rồi xanh          | Run Actions thật (nhánh thử, không merge)                                       | đỏ ⟹ probe bị bỏ qua, các shard khác vẫn chạy hết; xanh ⟹ probe chạy; xóa job probe trước khi merge                          | planned                  |
| CI-SHARD.1 thời gian           | Push `main` ở repo deploy                                                                                                                                                                                        | Run Actions thật                                                                | Từ đầu run tới job test cuối ≤ 20 phút; ghi thời gian từng shard và độ lệch; deploy ghi riêng                                | planned                  |
| OD-CI2                         | Hai push liên tiếp lên một PR; một `workflow_dispatch` trên `dev` rồi một push                                                                                                                                   | Run Actions thật                                                                | Run PR cũ bị hủy; push và chạy tay không bị hủy                                                                              | planned                  |
| OD-CI3                         | Mở PR `dev → main` ở repo deploy                                                                                                                                                                                 | Run Actions thật                                                                | Không có run `pull_request`; push `main` sau merge chạy đủ và deploy                                                         | planned                  |
| OD-CI5                         | Push `dev` ở repo deploy; push `dev` ở BE-dev                                                                                                                                                                    | Run Actions thật                                                                | repo deploy: mọi job test bỏ qua (`select.run=false`); BE-dev: chạy bình thường                                              | planned                  |
| Cấu trúc workflow              | `check-script-order.test.mjs` sửa: mỗi job có `pnpm test:integration` phải có `uses: ./.github/actions/test-database` trước đó; danh sách `matrix.shard` = `[1..N]` với N lấy từ `--shard=${{ matrix.shard }}/N` | `pnpm test:scripts`                                                             | xanh; đổi N mà không đổi danh sách ⟹ đỏ (thử đột biến tay một lần)                                                           | planned                  |
| Định dạng                      | ci.yml, nightly.yml                                                                                                                                                                                              | `pnpm rules:format`, `pnpm exec prettier --check .github/workflows/nightly.yml` | xanh                                                                                                                         | planned                  |

## Definition of Done

- [ ] Run thật theo thứ tự của plan (BE-dev PR → BE-dev push một module → repo deploy push `main`): mọi dòng test matrix có run id.
- [ ] `pnpm test:scripts`, `pnpm rules:format`, `pnpm test:gates`, `pnpm rules:check` xanh.
- [ ] `test/README.md`, comment đầu workflow, `OD-T2` của be-test-architecture-redesign cập nhật; roadmap/plan cập nhật.
- [ ] Sau 1 tuần: bảng phút Actions mỗi tổ chức (billing API) ghi vào plan; `timeout-minutes` đặt theo số đo.

## Changes and acceptance

Chưa implement.
