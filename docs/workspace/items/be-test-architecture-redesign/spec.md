# Spec: thiết kế lại các tầng test và pipeline CI của BE

- Phụ trách: chưa phân công (đề xuất: người giữ CI/test harness).
- Thiết kế ban đầu bởi: AI theo yêu cầu Owner (28/10/2026). Phân tích tĩnh + log CI cũ; **không chạy test** (Owner không
  cho chạy) — mọi con số thời gian lấy từ log GitHub Actions, Phase T0 phải đo lại.
- Thiết kế: `draft`. Owner review: chưa review toàn spec. Owner chốt `OD-T1` → `OD-T5` ngày 28/10/2026, cả năm theo đề xuất
  (mục _Owner decisions_). Triển khai local 29/10/2026 trên BE `dee61eb` (Owner cho chạy test), chưa commit: kết quả,
  số đo T0 và sai khác ở [plan](plan.md#kết-quả-triển-khai-29102026).
- Nguồn: Docs `578f442` (BRD v3.57; báo cáo `Docs/CI-CD/Test-Optimization-and-Redesign-Guide.md` được review ở đây),
  BE `c49a7dd`. Log CI: run `39281599561` (19/10), `39885940175` (23/10), `40091710522` (24/10), `40704221067` (28/10).
- Nhóm roadmap: xuyên module — `technical-enabler`, không thuộc nhóm G (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Hạng mục anh em: [tái cấu trúc kiến trúc](../be-architecture-boundaries-restructure/spec.md).

## Business outcome

Sau hạng mục này mỗi push lên `dev`/`main` lại chứng minh được hành vi HTTP và ràng buộc PostgreSQL trước khi deploy, trong
thời gian chờ chấp nhận được: HTTP contract ≤ 3 phút, integration bị ảnh hưởng ≤ 8 phút trên `dev`, đầy đủ ≤ 15 phút trên
`main`. Kiểm bằng thời gian job trên GitHub Actions và job `deploy` phụ thuộc các job đó.

## Sizing decision

- Container: yêu cầu trực tiếp của Owner ngày 28/10/2026 (test BE chậm, integration và HTTP đang tắt trong CI).
- Mode: `technical-enabler`.
- Outcome and owner: harness test, cấu hình Jest, workflow CI và tài liệu test; sở hữu bởi `test/`, `.github/workflows/`,
  `test/README.md`.
- Boundaries: không đổi code sản phẩm trừ provider override chỉ dùng trong test; không xóa assertion nào mà không ghi lý do
  trong PR; không đổi migration hay schema.
- Not larger: không viết test mới cho tính năng chưa có; không đổi kiến trúc module (hạng mục anh em).
- Not smaller: sửa harness mà không bật lại CI thì không ai hưởng lợi; bật CI mà không sửa harness thì lại timeout như 21–24/10.
- Siblings: `be-architecture-boundaries-restructure`.
- Scope map: n/a

## Primary Story/AC

| Story | AC        | Coverage | Phần còn lại thuộc                                                                                   |
| ----- | --------- | -------- | ---------------------------------------------------------------------------------------------------- |
| —     | `TEST-R1` | n/a      | gỡ chặn `be-architecture-boundaries-restructure` Phase 2 (lưới an toàn)                              |
| —     | `TEST-R2` | n/a      | gỡ chặn bật lại job HTTP/integration cho mọi hạng mục sau (`be-architecture-boundaries-restructure`) |

`TEST-R1` = harness HTTP contract và integration mới; `TEST-R2` = pipeline CI phân tầng và tài liệu.

## Supporting references

- `test/README.md`, `test/config/*.cjs`, `test/support/http-test-app.ts`, `test/support/disposable-database.ts`,
  `.github/workflows/ci.yml` (hai bước `HTTP-E2E-DEFERRED-BY-OWNER`, `INTEGRATION-DEFERRED-BY-OWNER`).
- Jest docs, `globalSetup`: _"Any global variables that are defined through globalSetup can only be read in globalTeardown.
  You cannot retrieve globals defined here in your test suites."_ (jestjs.io/docs/configuration#globalsetup-string).
- ADR-0005 (ràng buộc ở PostgreSQL) — lý do integration với DB thật là bắt buộc, không thay bằng mock.

## Explicit out of scope

- Thay Jest bằng Vitest, thay PostgreSQL bằng SQLite/pg-mem hay Testcontainers: không cần, rủi ro lệch hành vi DB.
- Viết lại assertion nghiệp vụ; tăng coverage cho tính năng mới.
- Mutation test (`pnpm test:mutation`) giữ nguyên, chỉ chuyển sang lịch nightly.

## Dependencies and blockers

- Không phụ thuộc hạng mục nào. `OD-T2` đã chốt 28/10/2026: `dev` chạy integration của module bị đổi, `main` chạy đầy đủ
  trên một runner, thêm lượt đầy đủ ban đêm.
- Repo `SEP490-FALL2026/BE-dev` là **private**: runner chuẩn 2 vCPU / 7 GB và phút Actions có hạn mức theo gói của tổ chức
  (ngân sách trả phí của dự án = 0). Mọi đề xuất song song/shard phải tính phút bị trừ.

## Ownership: module, data, API

`test/**`, `package.json` (script test), `.github/workflows/ci.yml` và workflow nightly mới, `test/README.md`. Code sản phẩm
không đổi; override provider chỉ nằm ở `test/support`.

## Audit hiện trạng

### Số lượng

| Tầng                           | File                                                                  | Test case                            | Chạy thế nào                                     | CI hiện nay         |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------ | ------------------- |
| Unit `src/**/*.spec.ts`        | 260 (37 410 dòng; 7 371 dòng là gate kiến trúc/API ở `src/*.spec.ts`) | 2 177 (24/10)                        | `jest --runInBand` trong `pnpm check`            | bật — 26 s (24/10)  |
| "E2E" `test/e2e`               | 45                                                                    | 812 ở 32 file (23/10), nay nhiều hơn | `--runInBand`, **không có DB**                   | **tắt** từ 27–28/10 |
| Integration `test/integration` | 269                                                                   | ~2 800 (`it(` đếm tĩnh)              | `--runInBand`, mỗi file một DB clone từ template | **tắt**             |

CI hiện tại (run 28/10, 6 phút 25 giây) chỉ chạy `pnpm check`, drift Prisma, OpenAPI export và audit. **Không có bằng chứng
nào về HTTP pipeline hay ràng buộc DB** trước khi `main` deploy lên VPS.

### Tiến triển thời gian (log GitHub Actions)

| Run                 | HTTP "e2e"                                                   | Integration                             |
| ------------------- | ------------------------------------------------------------ | --------------------------------------- |
| 19/10 `39281599561` | 14 file, 274 test, 89 s (0,32 s/test; trung vị 7,5 s/file)   | 46 file, 629 test, 221 s (4,8 s/file)   |
| 23/10 `39885940175` | 32 file, 812 test, 836 s (1,03 s/test; trung vị 27,6 s/file) | 98 file, 1 313 test, 386 s (3,9 s/file) |
| 24/10 `40091710522` | 24 file chạy 1 296 s (trung vị 59,9 s/file) rồi job bị hủy   | không tới lượt                          |

Cùng một file `approval-roles.e2e-spec.ts`: 9,0 s (19/10) → 40,6 s (23/10). Bộ HTTP **không chạm DB** mà vẫn chậm dần theo
kích thước app ⇒ chi phí nằm ở việc dựng app, không ở DB.

### Nguyên nhân gốc (đã kiểm trong code)

| Mã  | Nguyên nhân                                                   | Bằng chứng                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **HTTP test dựng lại toàn bộ `AppModule` cho từng test case** | 40/45 file gọi `Test.createTestingModule({ imports: [AppModule] })…init()` bên trong `it`/`it.each` (qua hàm `appFor(identity)`) và `app.close()` ở `afterEach`; 181 bảng `it.each`. Lý do: danh tính được "nướng" vào verifier giả lúc dựng app (`verify: jest.fn().mockResolvedValue(identity)`). Số lần compile DI ≈ số test case (hàng trăm–nghìn), mỗi lần tốn hơn khi app lớn lên |
| C2  | Integration đi qua HTTP để dựng fixture                       | 219/269 file dùng harness gọi `createHttpTestApp` (boot `AppModule` + HTTP) rồi tạo phòng, người, gói, thuê bao **qua API**; mật khẩu băm Argon2 tham số production (`memoryCost 19 456`, `timeCost 2`); 220 file đặt timeout `beforeAll` 240 000 ms                                                                                                                                    |
| C3  | Chạy tuần tự dù đã cô lập                                     | Mọi runner `--runInBand`; nhưng integration **đã** cô lập DB theo file (clone từ template đã migrate một lần — H7-RUN-01), nên song song được cho đa số file                                                                                                                                                                                                                            |
| C4  | Một số file thật sự cần chạy riêng                            | 8 file tạo role cấp cluster (`role-separated-database`), 11 file ghi `process.env`, 20 file chạy CLI con, 59 file kiểm khóa/đồng thời qua nhiều kết nối                                                                                                                                                                                                                                 |
| C5  | Tên tầng gây hiểu nhầm                                        | "e2e" thực chất là **HTTP contract test** (pipeline Nest thật, verifier giả, không DB); chưa có test hành trình thật đầu-cuối                                                                                                                                                                                                                                                           |
| C6  | CI một job, timeout cố định                                   | Job `quality` gộp mọi thứ; khi bật lại integration thì 269 file tuần tự vượt timeout (các run 21–24/10 bị hủy ở ~25 phút)                                                                                                                                                                                                                                                               |

Unit **không** có vấn đề hiệu năng (2 177 test trong 26 s). Cả 80 file `*.policy.ts` có spec; service điều phối được
integration với DB thật phủ — đúng hướng, không cần mock Prisma/transaction.

## Đánh giá báo cáo `Test-Optimization-and-Redesign-Guide.md`

| Phát biểu của báo cáo                                              | Đánh giá               | Căn cứ                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 224 integration / 46 e2e                                           | Lỗi thời               | Hiện 269 / 45                                                                                                                                                                                                                                                                                                                     |
| Nguyên nhân 1: mỗi file boot `AppModule` (270 lần)                 | Đúng một nửa           | Integration: một lần mỗi file (219 file). HTTP: **mỗi test case** — nặng hơn nhiều và là nguyên nhân chính (C1), báo cáo bỏ sót                                                                                                                                                                                                   |
| Nguyên nhân 2: `CREATE/DROP DATABASE` 270 lần gây nghẽn I/O        | Không đứng             | HTTP không dùng DB; integration clone từ template đã migrate; log cho 3,9–4,8 s/file gồm cả boot app; không có số đo I/O nào                                                                                                                                                                                                      |
| Nguyên nhân 3: `--runInBand`                                       | Đúng                   | Nhưng integration đã cô lập DB theo file nên mở song song được ngay, trừ nhóm C4                                                                                                                                                                                                                                                  |
| Nguyên nhân 4: integration làm việc của e2e                        | Đúng một phần          | Đi qua HTTP để **dựng fixture** là phí (C2); nhưng không được chuyển phần kiểm ràng buộc DB xuống unit                                                                                                                                                                                                                            |
| Trụ cột 2: một app dùng chung qua `globalSetup`                    | **Không làm được**     | `globalSetup` chạy ở process cha; worker là process khác; Jest docs nói rõ test suite không đọc được global của `globalSetup`                                                                                                                                                                                                     |
| Trụ cột 3A: `BEGIN`/`ROLLBACK` qua `$executeRawUnsafe`             | **Sai**                | Prisma + pool `pg` gửi câu lệnh trên kết nối bất kỳ; code được test tự mở transaction qua `TransactionRunner` (`BEGIN` lồng), dùng advisory lock, `lock_timeout`; 59 file kiểm đồng thời qua **nhiều kết nối** — không thể nằm trong một transaction bị rollback; `RetireOnTimeoutClient` còn loại kết nối đang trong transaction |
| Trụ cột 3C: `TRUNCATE` giữa test                                   | **Sai với schema này** | Bảng chỉ ghi thêm chặn `TRUNCATE` — chính integration khẳng định điều đó (13 assertion `TRUNCATE … → RESTRICT`, ví dụ `group-request-constraints`)                                                                                                                                                                                |
| Trụ cột 3B: schema mỗi worker                                      | Không cần              | Clone DB mỗi file đã cho cùng mức cô lập, đã chạy ổn                                                                                                                                                                                                                                                                              |
| Trụ cột 4: song song + `--shard`                                   | Đúng                   | Jest hỗ trợ `--shard`; phải tính phút Actions vì repo private                                                                                                                                                                                                                                                                     |
| Trụ cột 5: integration chỉ chạy nightly, gate nhanh PASS là deploy | **Nguy hiểm**          | Bất biến nghiệp vụ nằm ở PostgreSQL (ADR-0005); deploy không qua integration là deploy chưa chứng minh dữ liệu đúng                                                                                                                                                                                                               |
| Giai đoạn 1: chỉ giữ 30–50 file integration                        | Không đồng ý           | Phân loại theo **điều test chứng minh**, không theo số file; gom file nhỏ cùng fixture thì được                                                                                                                                                                                                                                   |
| KPI gate 3–5 phút                                                  | Hợp lý                 | Gate hiện đã ~6 phút; giữ, thêm job song song                                                                                                                                                                                                                                                                                     |

Kết luận: **cần thiết kế lại harness và pipeline của HTTP + integration**, nhưng **không** theo các trụ cột 2, 3A, 3C, 5 của
báo cáo. **Unit không cần setup lại**, chỉ chỉnh nhỏ.

## Behavior and design

### Năm tầng test, mỗi tầng một mục đích

| Tầng          | Thư mục / hậu tố                                      | Chứng minh                                                                      | Không làm                                                             | Ngân sách           |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------- |
| Unit          | `src/**/*.spec.ts`                                    | Policy thuần, mapper, schema DTO, guard/pipe riêng lẻ                           | Không Nest app, không DB                                              | toàn bộ ≤ 30 s      |
| Static gate   | `src/**/*.gate.spec.ts` (tách project)                | Kiến trúc, OpenAPI, catalog lỗi                                                 | Không runtime                                                         | ≤ 30 s              |
| HTTP contract | `test/http/**/*.http-spec.ts` (đổi tên từ `test/e2e`) | Guard, khai báo quyền, validate, filter lỗi, serializer, envelope, mã HTTP      | Không DB (repo/port giả)                                              | toàn bộ ≤ 3 phút    |
| Integration   | `test/integration/<module>/**/*.integration-spec.ts`  | Ràng buộc DB, SQL của repo, transaction/khóa/đồng thời, migration, role H7, CLI | Không đi qua HTTP trừ khi chính ánh xạ HTTP↔DB là điều cần chứng minh | file trung vị ≤ 4 s |
| E2E smoke     | `test/e2e/*.e2e-spec.ts` (mới)                        | 8–12 hành trình D-1…D-4 qua HTTP thật + DB thật + vòng worker                   | Không kiểm từng nhánh lỗi                                             | ≤ 5 phút            |

### HTTP contract: một app mỗi file (sửa C1)

Danh tính lấy từ chính token, không nướng vào app:

```ts
// test/support/http-contract-app.ts
const PREFIX = 'test-principal.';
export const bearer = (principal: AuthenticatedPrincipal): string =>
  `Bearer ${PREFIX}${Buffer.from(JSON.stringify(principal)).toString('base64url')}`;

class TokenAsPrincipalVerifier implements AccessTokenVerifierPort {
  async verify(token: string): Promise<AuthenticatedPrincipal> {
    if (token === 'unavailable') throw new TokenVerificationUnavailableError();
    if (!token.startsWith(PREFIX)) throw new InvalidAccessTokenError();
    return JSON.parse(Buffer.from(token.slice(PREFIX.length), 'base64url').toString());
  }
}

export async function createHttpContractApp(overrides: ProviderOverride[] = []): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ACCESS_TOKEN_VERIFIER)
    .useValue(new TokenAsPrincipalVerifier());
  for (const o of overrides) builder = builder.overrideProvider(o.token).useValue(o.useValue);
  const app = (await builder.compile()).createNestApplication();
  configureApplication(app, { mountDocs: false });
  await app.init();
  return app;
}
```

```ts
// test/http/organization/departments.http-spec.ts
let app: INestApplication;
beforeAll(async () => (app = await createHttpContractApp()));
afterAll(() => app.close());

it.each(SUPER_ADMIN_ONLY)('%s as an employee is 403', async (_name, call) => {
  const res = await call(app.getHttpServer()).set('Authorization', bearer(principal(['EMPLOYEE'])));
  expect(res.status).toBe(403);
});
```

- File cần override khác (ví dụ verifier ném lỗi khi DB không sẵn sàng) dùng `describe` riêng với `beforeAll` riêng.
- Gate trong `test:discovery`: cấm `createTestingModule`/`createHttpContractApp` trong `it`, `test`, `beforeEach` ở `test/http`.
- Chạy song song: `--maxWorkers=50%` (không DB, không cổng cố định).

### Integration: dựng fixture không qua HTTP, chạy song song (sửa C2–C4)

1. **Đo trước khi sửa** (Phase T0): harness đã có `recordTimings`/`recordCopy`; thêm reporter ghi thời gian từng file và
   từng pha (clone DB, boot app, dựng fixture, test) ra JSON để chọn 20 file chậm nhất sửa trước.
2. **Context không HTTP** khi không kiểm HTTP: `createIntegrationContext()` = `NestFactory.createApplicationContext` của
   `AppModule` trên DB clone (không mở server, không middleware HTTP), trả `{ moduleRef, sql, runner, close }`.
3. **Fixture builder ở tầng dữ liệu**: `test/support/builders/*.builder.ts` ghi qua facade/repo hoặc SQL đúng ràng buộc
   (`aDepartment().withUnitCostCenter().build(ctx)`, `anEmployee().inDepartment(d)`…). HTTP chỉ dùng khi chính route là đối
   tượng test. Builder thay dần các harness lớn (`request-harness`, `seat-baseline-harness`…), file chậm nhất trước.
4. **Hasher rẻ ngoài suite xác thực**: override `PasswordHasher` bằng Argon2 tham số thấp trong test (`OD-T3`); suite
   `identity-access` và unit của hasher giữ tham số production.
5. **Hai project Jest**:
   - `integration` (song song, `--maxWorkers=2` trên CI 2 vCPU, `50%` ở máy dev) — mọi file chỉ dùng DB riêng của nó.
   - `integration-serial` (`--runInBand`) — thư mục `test/integration/_serial/`: file tạo role cluster, ghi `process.env`,
     chạy CLI con cần tài nguyên dùng chung. Danh sách ban đầu lấy từ C4, rà từng file.
6. **Tổ chức theo module**: `test/integration/<module>/…` (khớp layout của hạng mục anh em) để CI chọn test bị ảnh hưởng theo
   đường dẫn thay đổi.
7. Giữ nguyên: DB clone từ template mỗi file, kiểm role thường không superuser, chẩn đoán teardown — các phần này đúng.

### E2E smoke (mới, nhỏ)

8–12 hành trình, mỗi hành trình một file, chạy tuần tự trên DB thật qua `createHttpTestApp` hiện có:
đăng nhập/refresh/đăng xuất; D-1 Request trả phí → trình lô → duyệt chi → cấp seat; Request nội bộ không phí; D-3 nghỉ việc
→ thu hồi; điều chuyển phòng → rà soát quyền; D-2 import seat baseline; lập và duyệt phiên bản ngân sách; báo lỗi SaaS.

### Unit (chỉnh nhỏ, không setup lại)

- Bỏ `--runInBand` ở `pnpm test`.
- Tách gate kiến trúc/API (`src/*.spec.ts` ở gốc, 7 371 dòng) thành project `gates` để thời gian unit đo đúng; vẫn chạy trong
  `pnpm check`.
- Không thêm unit mock Prisma/transaction cho service điều phối — đã có integration với DB thật, mock sẽ chỉ kiểm lại mock.
- Tùy chọn (`OD-T4`): thử `@swc/jest` thay `ts-jest` (ts-jest 29.4 đã transpile-only nhờ `isolatedModules: true`, nên lợi ích
  chỉ ở tốc độ transform); chỉ đổi nếu T0 đo được giảm ≥ 30 %.

### Pipeline CI

```text
push/PR dev ─┬─ quality (hiện có ~6')  : rules, format, prisma, lint, typecheck, unit, gates, build, drift, openapi, audit
             ├─ http-contract (≤ 3')   : test/http, song song
             └─ integration-affected   : test/integration/<module> của module đổi + module phụ thuộc theo bảng tầng,
                                         cộng integration-serial nếu chạm thư mục đó (≤ 8')
push main ───┬─ quality, http-contract
             ├─ integration (đầy đủ)   : 1 runner --maxWorkers=2 (≤ 15') hoặc 3 shard nếu OD-T2 cho phép
             ├─ e2e-smoke
             └─ deploy  needs: [quality, http-contract, integration, e2e-smoke]
nightly (dev) ─ toàn bộ integration + e2e-smoke + test:mutation + báo cáo thời gian từng file
```

- `timeout-minutes` đặt theo ngân sách của từng job (gấp đôi mục tiêu), không còn một timeout chung.
- Không `continue-on-error`, không `|| true` (giữ nguyên tắc hiện có của ci.yml).
- Ước phút Actions mỗi lần push `dev`: ~6 + 3 + ≤ 8 ≈ 17 phút; push `main` ≈ 6 + 3 + 15 + 5 ≈ 29 phút (một runner).

### Owner decisions

| Mã      | Câu hỏi                                                                                                                      | Đề xuất                                                                     | Owner chọn 28/10/2026 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------- |
| `OD-T1` | Đổi tên `test/e2e` → `test/http` và tạo `test/e2e` mới cho smoke?                                                            | Đồng ý — tên đúng điều test chứng minh                                      | theo đề xuất          |
| `OD-T2` | Ngân sách phút Actions: integration theo module bị ảnh hưởng trên `dev`, đầy đủ trên `main` + nightly; shard hay một runner? | Một runner `--maxWorkers=2`; shard chỉ khi gói tổ chức đủ phút              | theo đề xuất          |
| `OD-T3` | Cho phép Argon2 tham số thấp trong test ngoài suite xác thực?                                                                | Đồng ý; tham số production vẫn được kiểm ở `identity-access` và unit hasher | theo đề xuất          |
| `OD-T4` | Thêm devDependency `@swc/jest`, `@swc/core`?                                                                                 | Chỉ khi T0 đo được lợi ≥ 30 %                                               | theo đề xuất          |
| `OD-T5` | `deploy` chặn khi integration/HTTP đỏ?                                                                                       | Đồng ý — hiện `main` deploy mà không có bằng chứng DB/HTTP                  | theo đề xuất          |

## Test matrix

| AC / rủi ro           | Tình huống (gồm từ chối, edge case)                            | Cấp test                | Kết quả mong đợi                                           | Bằng chứng sau implement                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEST-R1` C1          | HTTP spec dựng app trong `it`/`beforeEach`                     | gate `test:discovery`   | đỏ, chỉ ra file                                            | `scripts/verify/http-app-placement.mjs` trong `pnpm test:discovery` (node:test; thử vi phạm → đỏ)                                                                          |
| `TEST-R1` C1          | Token không có tiền tố test / `unavailable`                    | HTTP contract           | 401 `INVALID_ACCESS_TOKEN` / 503 như hiện nay              | `test/http/platform/app.http-spec.ts`: 401 `INVALID_ACCESS_TOKEN`, 503 khi dịch vụ xác thực không tới được                                                                 |
| `TEST-R1` giữ phạm vi | So số test và tên test trước/sau đổi harness                   | script so sánh `--json` | không mất test; khác biệt có lý do trong PR                | `--json` trước/sau: HTTP 1 238 → 1 240, integration 3 465 → 3 466, T2.2 289 → 289 ([nghiệm thu §3](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md)) |
| `TEST-R1` C2          | Builder tạo phòng không có Cost Center rồi tạo Request trả phí | integration             | lỗi _cấu hình tài chính chưa hoàn tất_ như qua HTTP        | `test/integration/requests/finance-setup-gate.integration-spec.ts`: phòng và người dựng qua builder của harness, 409 `FINANCE.SETUP_INCOMPLETE`, không ghi gì              |
| `TEST-R1` C3          | Hai worker chạy song song hai file cùng bảng                   | integration             | không ảnh hưởng nhau (DB riêng)                            | lượt đầy đủ 6 worker lặp lại ([nghiệm thu §5 P4](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md))                                                   |
| `TEST-R1` C4          | File tạo role cluster nằm ngoài `_serial`                      | gate `test:discovery`   | đỏ                                                         | gate `parallel-safety` (`pnpm test:gates`, không phải `test:discovery`): `clusterActionsOutsideSerial`, self-test + thử đỏ                                                 |
| `TEST-R2`             | Integration đỏ trên `main`                                     | CI                      | `deploy` không chạy                                        | chờ CI của Owner ([nghiệm thu §8 bước 2](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md))                                                           |
| `TEST-R2`             | Push chỉ đổi `src/modules/finance`                             | CI                      | chạy integration của finance và module phụ thuộc theo tầng | `scripts/verify/affected-modules.test.mjs`: finance → `budgets`, `finance`, `requests`; trên GitHub chờ CI của Owner                                                       |

## Definition of Done

- Không HTTP spec nào dựng app trong `it`/`beforeEach`; job `http-contract` ≤ 3 phút trên CI.
- Integration song song có project `serial` rõ ràng; trung vị ≤ 4 s/file, không `beforeAll` timeout > 60 s; job đầy đủ ≤ 15 phút.
- `test/e2e` smoke 8–12 hành trình xanh trên `main`.
- `deploy` phụ thuộc `quality`, `http-contract`, `integration`, `e2e-smoke`; nightly chạy đủ + mutation.
- Số test không giảm, trừ test trùng đã ghi lý do; `test/README.md` ≤ 200 dòng mô tả năm tầng, lệnh và khi nào dùng tầng nào.
- Báo cáo thời gian trước/sau (Phase T0 và sau T3) ghi trong plan.
