# Tests

Thư mục này nằm ở root repo, cùng cấp src. Unit test nằm cạnh source;
test/ chứa các suite qua nhiều lớp và helper dùng riêng cho test.

| Loại        | Vị trí                                 | Lệnh                                 | Chứng minh                                                                   |
| ----------- | -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| Unit        | src/**/*.spec.ts                       | pnpm test                            | Logic, mapper, config, guard, boundary                                       |
| HTTP E2E    | test/e2e/*.e2e-spec.ts                 | pnpm test:e2e                        | Nest pipeline, DTO, status/envelope, OpenAPI; repo/verifier thay thế khi cần |
| Integration | test/integration/*.integration-spec.ts | pnpm test:integration                | PostgreSQL thật, migration, constraint, repository, concurrency harness      |
| Script      | scripts/**/*.test.mjs                  | pnpm rules:test và pnpm test:scripts | Công cụ kiểm tra tài liệu/test discovery                                     |

Chưa có browser suite. [Review/remediation G0/G1](../docs/reviews/g0-g1-remediation-2026-10-15/README.md)
ghi kết quả chạy HTTP/SMTP thật; runner review riêng không được giữ trong repo hoặc tích hợp vào CI.
Không tạo lệnh giả pass cho suite chưa triển khai.

## Quy tắc viết test

Đọc [AGENTS](../AGENTS.md), [API rules](../docs/rules/api-contract.md),
[database rules](../docs/rules/database-business.md) theo phần thay đổi.
AI không tự biết mọi guide chỉ vì file nằm trong docs; AGENTS dẫn tới guide này.
Developer viết tay cũng dùng cùng quy tắc.

- Test hành vi và failure case có ý nghĩa, không sao chép implementation.
- Test HTTP giữ pipeline thật; override ở boundary và nêu rõ điều đã mock.
- Mock không chứng minh JWT, DB constraint, storage access hoặc worker retry thật.
- Helper ở support/, runner config ở config/. Không đặt spec vào hai thư mục đó.
- Khi thêm API, cập nhật support/api-coverage-manifest.ts và HTTP tests.
  Inventory chỉ bảo đảm danh sách operation, không chứng minh coverage mọi nhánh.
- Chạy pnpm test:discovery để phát hiện test sai tên/vị trí hoặc runner bỏ sót.
- `openapi-export.e2e-spec.ts` so **đúng byte** bản export với `openapi.json` và từ chối ký tự CR; không chuẩn hóa xuống
  dòng trong assertion. `.gitattributes` ghim riêng `openapi.json` về LF (xem [CONTRIBUTING](../CONTRIBUTING.md)).

### Kích thước unit spec của module

- Mỗi unit spec trong `src/modules/**` (`*.spec.ts`) tối đa **400 dòng vật lý**, đếm như gate kích thước source; gate
  `H8-RV-01` của [architecture-structure.spec.ts](../src/architecture-structure.spec.ts) báo đúng đường dẫn và số dòng,
  không có ledger, ngoại lệ hay cap cao hơn. Gate không áp cho spec gate ở `src/` gốc hay suite trong `test/**`.
- Vượt ngưỡng thì tách theo **use case hoặc chuyển trạng thái quan sát được**, không theo tầng kỹ thuật. Fixture/harness
  dùng chung đặt ở `test/support/` (có kiểu, tất định, chỉ dựng đối tượng); assertion và mạch use case ở lại spec sở
  hữu. `support/` không chứa spec.
- **Đúng:** `employee-import-upload.spec.ts`, `employee-import-preview-lifecycle.spec.ts` và
  `employee-import-confirm.spec.ts` dùng chung harness có kiểu `test/support/employee-import-service-harness.ts`.
- **Sai:** một `employee-import.service.spec.ts` chứa mọi route/use case chỉ vì chúng gọi cùng một service.
- **Lách sai:** đổi tên một ma trận test 1.000 dòng hoặc dời assertion sang script không đăng ký để né Jest/test
  discovery. Suite phải được tìm thấy qua lệnh unit test thông thường.

### Tệp trong test/support (TEST-HARDEN.1)

- Mỗi `test/support/**/*.ts` là fixture, builder, fake hoặc harness: tối đa **400 dòng vật lý**, không ledger, ngoại lệ
  hay cap cao hơn; không đăng ký test và không assertion. Gate
  [test-support-structure.spec.ts](../src/test-support-structure.spec.ts) đọc bằng parser TypeScript (không tìm chuỗi):
  từ chối gọi hay tham chiếu tự do `describe`/`it`/`test`/`expect`/hook (kể cả `.only`/`.skip`/`.each`, `fit`/`xit`/…),
  qua `globalThis`/`global` hay bí danh, import `@jest/globals`/`vitest`/`chai`/`assert`/`node:assert`/`node:test`, và tên
  tệp giống spec hay khớp pattern runner.
- **Đúng:** `request(app).post(...).expect(200)` (SuperTest), `/^[A-Z]+$/.test(code)`, method/property tên `it` hay `test`,
  `jest.fn()` cho fake, tên trong chuỗi/chú thích; một harness có kiểu trả fake để spec tự `expect`.
- **Sai:** `describe(...)`, `it(...)`, `expect(...)` hay `afterAll(...)` trong support; `import { expect } from '@jest/globals'`.
- **Lách sai:** `const register = it`, `export const api = { it }`, `globalThis.describe(...)`, `global['it'](...)`, đặt tên
  `helper.spec.ts` trong `support/`, hoặc dời assertion vào một hàm support rồi gọi từ spec.

### Import file private của src

- Ưu tiên kiểm qua HTTP, facade hoặc contract công khai khi mục tiêu của test cho phép.
- Unit/integration test được import repo, token hay type private khi cần chứng minh boundary nội bộ (ràng buộc, khóa
  dòng, provider DI). Import đó phụ thuộc layout: lát move/refactor phải cập nhật nó trong cùng thay đổi.
- Architecture gate có chủ đích không quét `test/**`. Điều đó không biến file private thành contract công khai; code
  trong `src` vẫn theo [module structure](../docs/rules/module-structure.md).

## PostgreSQL dùng riêng cho test

Tất cả integration suite dùng support/disposable-database.ts. Cấu hình
TEST_DATABASE_ADMIN_URL một cách rõ ràng; helper không fallback sang DATABASE_URL.
Server phải ở localhost/127.0.0.1; integration dùng role LOGIN NOSUPERUSER CREATEDB NOCREATEROLE
NOREPLICATION NOBYPASSRLS. Helper assert thuộc tính bằng SQL trước CREATE DATABASE và từ chối bootstrap
superuser. Không trỏ đến shared server. Helper chỉ đọc env được truyền vào, không tự load `.env`.

Ví dụ tạo server test tách khỏi Compose/dev DB:

```powershell
docker run --name slm-foundation-test-db -d -p 127.0.0.1:55432:5432 -e POSTGRES_USER=ci_bootstrap -e POSTGRES_PASSWORD=ci-bootstrap-only -e POSTGRES_DB=postgres postgres:17-alpine
try {
  # Chờ pg_isready trả exit 0 trước khi provision role và chạy suite.
  docker exec slm-foundation-test-db pg_isready -U ci_bootstrap -d postgres
  if ($LASTEXITCODE -ne 0) { throw 'Test PostgreSQL is not ready.' }
  docker exec slm-foundation-test-db psql -X -U ci_bootstrap -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE ci_integration LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'ci-integration-only';"
  if ($LASTEXITCODE -ne 0) { throw 'Integration role provisioning failed.' }
  $env:TEST_DATABASE_ADMIN_URL = 'postgresql://ci_integration:ci-integration-only@127.0.0.1:55432/postgres'
  $env:TEST_DATABASE_BOOTSTRAP_URL = 'postgresql://ci_bootstrap:ci-bootstrap-only@127.0.0.1:55432/postgres'
  pnpm test:integration
} finally {
  docker rm -f slm-foundation-test-db
  Remove-Item Env:TEST_DATABASE_ADMIN_URL, Env:TEST_DATABASE_BOOTSTRAP_URL -ErrorAction SilentlyContinue
}
```

Bốn suite vai PostgreSQL của H7 (`database-roles-*`, `database-runtime-*`) đóng vai quản trị cluster: chúng tạo/xóa vai
`slm_<hex>_deploy`/`slm_<hex>_runtime` và database `slm_<hex>_test` qua `support/role-separated-database.ts`, nên cần thêm
`TEST_DATABASE_BOOTSTRAP_URL` = **superuser** của đúng server test cô lập đó (ví dụ trên:
`postgresql://ci_bootstrap:ci-bootstrap-only@127.0.0.1:55432/postgres`; CI đặt cùng giá trị cho service container). Thiếu
biến thì các suite đó đỏ với lời nhắc, không skip. Đây là quyền của harness test, không bao giờ là cấu hình của API/worker;
helper chỉ nhận `localhost`/`127.0.0.1`, URL không query, và xóa đúng tên đã ghi (database trước, vai sau).

Chờ pg_isready thành công trước khi chạy test. Dùng tên/port khác nếu đã có container.
Không mount volume dữ liệu thật vào container test.

**Môi trường của lượt test (H7-VRF-01).** Với `NODE_ENV=test`, `ConfigModule` (cả hai bộ option ở
`src/infrastructure/config/env-config.ts`) và `prisma.config.ts` **không đọc `.env`**: kết quả không phụ thuộc file `.env`
nào của máy dev, và không key nào của nó lọt vào `process.env` nơi harness đọc URL test-admin. Mọi giá trị test cần
(`TEST_DATABASE_ADMIN_URL`, `TEST_DATABASE_BOOTSTRAP_URL`) phải có trong môi trường tiến trình; thiếu thì harness từ chối
bằng lời nhắc của nó (`test-environment-isolation.integration-spec.ts`). Suite dựng SMTP giả đặt **đủ** cấu hình SMTP qua
`support/fake-smtp.ts` (`fakeSmtpEnvironment`) và khôi phục `process.env` sau đó. Một tiến trình con chạy CLI production
không có `DATABASE_URL` phải chạy từ thư mục rỗng (`--config` tuyệt đối) và đặt `DOTENV_CONFIG_PATH` không trỏ file nào.

**Database mẫu đã migrate (H7-RUN-01).** `globalSetup` của runner integration (`config/integration-global-setup.ts`)
chạy **một** `prisma migrate deploy` cho cả lượt vào một database mẫu `slm_<random>_test`; `globalTeardown` xóa nó theo
đúng tên và marker. `migrateDisposableDatabase` thay database vừa provision bằng bản sao phía server
(`CREATE DATABASE … TEMPLATE`, giữ tên và marker riêng) **chỉ khi** database vẫn đúng như lúc provision — không đối tượng
nào ngoài marker, không session nào còn lại (chờ tối đa 2 s) — nên kết quả trùng một lần deploy
(`migration-setup.integration-spec.ts` so lịch sử migration và catalog). Còn lại — database suite đã dùng trước khi
migrate, handle không do harness provision (deploy role, superuser của suite vai PostgreSQL, relay) và chính database mẫu
— đi Prisma CLI trong `support/migration-deploy.ts`: tiến trình riêng, giới hạn 60 s, lỗi nêu thời điểm từng pha (kết nối,
CLI khởi động, đọc lịch sử, thoát, đóng pipe), không bao giờ còn tiến trình hay session sau một lần dừng. Đặt
`TEST_MIGRATION_TIMINGS_FILE=<file ngoài repo>` để ghi một dòng JSON mỗi lần migrate/sao (chỉ thời gian, không URL).

Mỗi suite tạo slm_<random>_test với ownership marker riêng. Mọi suite áp dụng
migration đã commit. Cleanup chỉ drop đúng URL/name/runId; query parameters bị từ chối
để tránh chuyển hướng target. afterAll phải đóng kết nối và dọn DB cả khi assertion lỗi:
dừng relay, đóng ứng dụng/pool rồi mới `dropDisposableDatabase`. Sau một lượt chạy sạch không còn database
`slm_<random>_test` hay backend treo nào của lượt đó; suite thêm vào mà để lại DB là lỗi của suite.

Nếu DROP hoặc đóng client thất bại, helper chỉ giữ SQLSTATE và metadata database/application name,
pid/state/wait event của đúng database. Truy vấn diagnostics có timeout 5 giây; lỗi diagnostics/đóng client
không thay thế lỗi gốc. Không in SQL text, URL, credential hay dữ liệu nghiệp vụ; không retry DROP, trừ đúng một ca
(GATE-02): `DROP DATABASE ... WITH (FORCE)` trả `42501` vì có tiến trình role thường không được dừng — autovacuum worker
(PostgreSQL 17; role thường không đọc được `backend_type` của nó) — thì chạy **một** `DROP DATABASE` không FORCE: lệnh này tự báo
autovacuum dừng, không dừng tiến trình nào khác và vẫn lỗi `55006` nếu một session thật còn giữ database (ghi
`plainDropSqlState`).
CI provision role qua bootstrap riêng rồi assert SQL trước integration; helper lặp lại role assertion
cho mỗi database local. Chạy local không thay thế kết quả GitHub Actions: remote CI vẫn `UNVERIFIED`
khi chưa có run của revision đang review.

Nếu process bị kill trước cleanup, DB tạm (kể cả database mẫu của lượt) có thể còn lại. Kiểm tra tên, marker và
connection trước khi dọn thủ công; không xóa theo wildcard.

## HTTP trên PostgreSQL thật

`support/http-test-app.ts` dựng **toàn bộ** ứng dụng Nest (pipe, guard, filter) trên một
database dùng riêng đã áp migration, cho các ca mà stub repo không chứng minh được: ràng buộc, khóa dòng.
`createHttpTestApp()` trả `{ app, sql, close }`; `seedInstallation(app)` tạo bộ dữ liệu tối thiểu
của lệnh khởi tạo qua service thật; `insertAccountFixture` tạo trạng thái tài khoản bằng SQL để cô lập
ca kiểm thử. Lát 1b đã có API tạo/mời/kích hoạt: test workflow đó phải đi qua API thật;
fixture SQL không chứng minh workflow tạo tài khoản. Dùng `bodyOf(response)`
(`support/api-body.ts`) thay cho `response.body` (kiểu `any`).

- `ConfigModule` kiểm tra env **lúc import** `AppModule`, nên helper đặt biến môi trường rồi mới `import()` động.
- `support/status-harness.ts`: the spend harness with the inbox and the projection of the audit events of requests: `project()` runs
  one pass at the clock of the database (the audit events carry the clock of the database, and a pass only reads events older than
  the delay it keeps), `projectUpTo(moment)` a pass made at an earlier moment, `noticesOf` and `noticesAbout` read the notices,
  `writeAudit` writes an audit event the way a service does for what no route can yet do, `openClient` gives a connection of its
  own for a transaction a test holds open. Mechanics (late commit, a held cursor, a failing pass) are in
  `request-status-projection.integration-spec.ts`, the flows in `request-status-notifications.integration-spec.ts`.
- `support/group-harness.ts`: the status harness with the requests for a group: `colleague(s)` make people of a department with a work email who
  start today, `groupBody` the body of a group, `groupWaiting` a group the head sent on so that its spend step waits for the approver,
  `groupApproved` the same with every person approved, the calls of the routes of a group, and reads of the lines, their decisions, their
  shares, the commitments and the audit trail as the database keeps them. The flows are in `group-request-submit.integration-spec.ts`,
  `group-request-need-decision.integration-spec.ts`, `group-request-spend.integration-spec.ts`, `group-request-grant.integration-spec.ts`,
  `group-request-withdrawal.integration-spec.ts`, `group-request-supplement.integration-spec.ts`,
  `group-request-notifications.integration-spec.ts` and `group-request-edge.integration-spec.ts`; what the database refuses is in
  `group-request-constraints.integration-spec.ts`.
- `support/sla-harness.ts`: the status harness with the reminders of late steps: `sweepAt(now)` runs one pass of the worker at a moment the
  test chooses, `beganAt` makes the open step of a request begin at a moment (the clock of the SLA runs from its creation),
  `queuedAt` does the same for the queue of the head, `dayOff` writes a day nobody works the way a past day is written (no route adds
  one), `parameterFrom` gives a parameter a value from a moment, `remindersOf`, `decisionState` and `emailRows` read back what a
  pass must or must not write, and `board`, `recordIncident` and `incidents` call the board of the Super Admin. A suite counts
  its days from a Friday three weeks ahead of the day it runs, because the data of the organization (who heads a department, where
  a person is placed) takes effect from the day it was written and a reminder asks who is who on the day of the pass. The flows are in
  `step-sla.integration-spec.ts`, the queue of the head in `step-sla-queue.integration-spec.ts`, Finance and the Super Admin lookup in
  `step-sla-finance-question.integration-spec.ts`, the backlog alert, the board and the incidents in `step-congestion.integration-spec.ts`,
  what the database refuses in `step-sla-constraints.integration-spec.ts`.
- `support/handover-harness.ts`: the transfer harness with what the handover confirmation needs: `seatOf` (a seat of a person the harness
  made, a person who joined long ago), `describePlan` (data loss and the notice of a plan), `open` (what a source module does to open
  a revocation), `openDuties`, `reconcileDuties` and `cancelDuties` (what the record of a departure does), `noticeOverdue` (the hourly
  reminder by hand), the three routes (`duties`, `duty`, `confirmDuty`), `makeHeadFrom` (a head named for a day to come, which is
  who follows a head who leaves) and `dutyRows`, `auditActions`, `liveTaskOf`, `assignmentRow` for what the database keeps. Deadlines
  are given as days from the real today (`h.day(n)`), never by moving the clock: a duty whose deadline has passed is one opened with a
  past `dueOn`. The flows are in `handover-duty-departure.integration-spec.ts`, who confirms when the head is missing or leaves in
  `handover-duty-successor.integration-spec.ts`, every source of a revocation in `handover-duty-sources.integration-spec.ts`, the
  lists with the statement count in `handover-duty-read.integration-spec.ts`; what the database refuses is in
  `handover-duty-constraints.integration-spec.ts`.
- `support/transfer-review-harness.ts`: the handover harness with what the review after a transfer needs: `movedWith` (a person of a
  department who holds tools and is moved to another from today; returns the seats in the order of the tools and the review the move
  opened), `moveToday`, the four routes (`reviews`, `review`, `reviewItems`, `decide`), `noticeLateReviews` (the hourly reminder by
  hand), `backdate` (moves the deadline of a review into the past with the guard trigger off for that one update) and `reviewRows`,
  `itemRows`, `taskRow`, `reasonRows` for what the database keeps. The opening is in `transfer-review-open.integration-spec.ts`, the
  decisions and the late review in `transfer-review-decide.integration-spec.ts`, the reads with the statement count in
  `transfer-review-read.integration-spec.ts`; what the database refuses is in `transfer-review-constraints.integration-spec.ts`.
- `support/leave-harness.ts`: the transfer harness with what a long leave needs: `worker` (a person who joined long ago, so a leave may
  begin on any recent day), the six routes (`startLeave`, `changeReturnDate`, `confirmReturn`, `readLeave`, `listLeaves`, `leaveChanges`),
  `started` (a leave expected to begin), `noticeOverdueAt(day)` (the hourly reminder by hand, as of a day), `departure()` and `personnel()`
  (the two functions for the leaving of a person and the read of the days of leave), `inTransaction`, and `workState`, `leavesOf`,
  `changeRows` for what the database keeps. The start is in `long-leave-start.integration-spec.ts`, the return, the new day and the late
  return in `long-leave-return.integration-spec.ts`, what the database refuses, the list with the statement count, the leaving functions
  and `getLeaveIntervals` in `long-leave-integrity.integration-spec.ts`.
- `support/offboarding-harness.ts`: the handover harness with what the record of a departure needs: `worker` (a person who joined long ago),
  the eleven routes (`recordCase`, `readCase`, `listCases`, `rightsOf`, `caseChanges`, `changeLastDay`, `cancelCase`, `markLeft`, `lockAccount`,
  `revokeRights`, `closeCase`), `body` and `recordedCase` (a departure expected to be recorded), `dueBefore(day)` (a working day before a day,
  no day off), and `caseRow`, `caseCount`, `changeKinds`, `workState`, `employeeLeftOn`, `taskCount` for what the database keeps. The record
  is in `offboarding-record.integration-spec.ts`, moving and cancelling in `offboarding-change.integration-spec.ts`, the departure, the
  revocations and the closing in `offboarding-departure.integration-spec.ts`, an IT Admin who leaves in `offboarding-self.integration-spec.ts`,
  what the database refuses and the reads with the statement count in `offboarding-integrity.integration-spec.ts`, and the routes without a
  database in `test/e2e/offboarding-cases.e2e-spec.ts`.
- `support/offboarding-harness.ts` also has the routes of the requests of a person who left: `openRequestsOf`, `openGrantTasksOf` and
  `cancelForDeparture`. They are in `leaver-request-closure.integration-spec.ts` (what is open and warned of, the closing of each kind of
  request and task, the batch and the question to Finance, the refusals, the grant that is not started for a person who left, what the
  database refuses and the statement count of the lists), `leaver-request-closure-group.integration-spec.ts` (a request for a group is listed as
  closable for the person who left, and the whole is refused while two people are live), `group-line-closure.integration-spec.ts` (removing one person who
  left from a request for a group: the line, the task, the share, the end of the request, the notices, what the database refuses) and
  `test/e2e/group-line-closure.e2e-spec.ts` (the route without a database) and `test/e2e/access-request-cancellation.e2e-spec.ts` (the route without a database).
- The roles of a person who leaves are in `role-duties.integration-spec.ts` (the flags and the audit of each role, the snapshot that moves with the
  last working day, the four states of the Super Admin role and their reasons, the notice of the person themselves, a workspace whose owner left
  and the closing that waits for it, Finance and the spending approver who leave with nothing taken over, the statement count of the list by
  role) on the offboarding harness; the Super Admin of the harness leaves in the last case of the file, after which no account can be made or
  given a role in that database, so keep a case that needs the Super Admin before it. `test/e2e/role-duties.e2e-spec.ts` is the two routes without
  a database.
- `support/service-account-handover-harness.ts`: the offboarding harness with what the handover of service accounts needs: `botOf` (a
  service account written through the baseline import), the routes (`changeResponsibleOf`, `proposeMove`, `confirmMove`, `cancelMove`,
  `listMoves`, `listServiceDuties`, `closeTransfer`), `chainOf` (the chain of an assignment as the database keeps it), `seatsTaken(day)`,
  `unitOf`, `moveRow`, `noticeCount`, `sweepOverdue(now)` (the hourly reminder by hand) and `pretendToday(day)` (the organization says
  it is another day). The duties, the change of the person responsible, the departure and the reminder are in
  `service-account-duty.integration-spec.ts`, the move and its confirmation in `service-account-move.integration-spec.ts`, what the
  database refuses in `service-account-integrity.integration-spec.ts`, and the routes without a database in
  `test/e2e/service-account-handover.e2e-spec.ts`.
- `support/expiry-harness.ts`: the return harness with what the rights that end on a day need: the three routes (`queue`,
  `startRevocation`, `reminders`), `noticeDue(now)` (the hourly reminder by hand), `queueRows`, `reminderRows`, `dutyRows` (the handover
  of a seat), `giveEndDate` (the database refuses to change an end date that was set) and `waitingRenewals(map)` (a stand-in for the
  renewals that wait, which returns the real reader when called back). The reminders and what the database refuses are in
  `assignment-expiry-reminders.integration-spec.ts`, the queue, the start of the revocation, the handover and the failure in
  `assignment-expiry-queue.integration-spec.ts`, and the routes without a database in `test/e2e/assignment-expiry.e2e-spec.ts`.
- `support/saas-issue-harness.ts`: the expiry harness with what the reports of errors in SaaS rights need: the nine calls (`issueOptions`,
  `submitIssue`, `listIssues`, `readIssue`, `issueEntries`, `addIssueMessage`, `reopenIssue`, `moveIssue`, `duplicateIssue`), `reported`
  (201 or fail), `reporterIn(code, inCharge, target)` (a department, a member with a seat), `openGrantTask` (a grant that is not finished,
  written by SQL), `issueRow`, `issueEvents`, `entriesOf`, `sweepIssues(now)` (the hourly pass by hand) and `pretendToday(day)` (the
  organization says what day it is; `MONDAY` is a Monday with no holiday near it, so the working days are the same on any run day). The
  report, who it goes to, who reads it and the count of statements are in `saas-issue-submit.integration-spec.ts`, the handling, the
  duplicates, the reopening and the two days in `saas-issue-handling.integration-spec.ts`, what the database refuses in
  `saas-issue-integrity.integration-spec.ts`, and the routes without a database (and the OpenAPI check that no route is for mobile) in
  `test/e2e/saas-issues.e2e-spec.ts`.
- `support/notice-harness.ts`: the offboarding harness with what the notices of the department heads need: the seven calls (`sendNotice`,
  `listNotices`, `readNotice`, `withdrawNotice`, `rejectNotice`, `recordNotice`, `linkNotice`), `sentNotice` (201 or fail), `head`, the body
  of a recording (`recording(event)` with the check and the basis), the notices and verifications as the database keeps them
  (`noticeRows`, `verificationRows`, `eventsOfNotice`, `eventCounts`, `runningLeaveOf`) and `noticeOverdueAt(day)` (the hourly telling by
  hand). The sending, the queue, the late notices and the count of statements are in `personnel-notice-send.integration-spec.ts`, the
  rejection, the recording through the three events, the link and the basis in `personnel-notice-record.integration-spec.ts`, what the
  database refuses in `personnel-notice-integrity.integration-spec.ts`, and the routes without a database in
  `test/e2e/personnel-notices.e2e-spec.ts`.
- `support/cli-process.ts` starts a child with `--no-experimental-strip-types` where Node strips types by itself (Node 24): beside ts-node it
  fails to find files that exist once the module graph is large. To run `pnpm openapi:export` by hand on such a Node, set
  `NODE_OPTIONS=--no-experimental-strip-types`.
- `support/placement-coverage.ts`: truy vấn kiểm coverage của placement (bắt khoảng trống mà exclusion
  constraint cho phép). Chạy ở cuối test ghi dữ liệu tổ chức.
- `support/test-config.ts`: `ConfigService` có kiểu cho test tự dựng service.
- `support/pg-relay.ts`: `PgRelay`, relay TCP trước PostgreSQL trên `127.0.0.1` (cổng ngẫu nhiên) để mô phỏng
  database ngừng trả lời mà không cần pause container. `pause()`/`resume()` dừng và nối lại mọi byte hai chiều (không
  lỗi, không phản hồi). `holdWhen(regex)` cho lưu lượng đi qua tới khi một kết nối gửi câu lệnh có **văn bản SQL**
  khớp (chỉ đọc message Parse/Query, không bao giờ đọc giá trị bind), rồi giữ kết nối đó từ câu lệnh ấy trở đi;
  `holding` cho biết đã giữ thật; `releaseHeld()` chuyển phần đã giữ đi; `stop()` đóng relay. Dùng cho ca ngừng trả
  lời (R-02, N-1, R-15) và **không** viết relay thứ hai. Nối vào ứng dụng qua
  `createHttpTestApp({ appDatabaseUrl: (directUrl) => relayUrl, env: { DB_QUERY_TIMEOUT_MS: '2000', ... } })`:
  ứng dụng đi qua relay, còn `sql` và các khẳng định đọc trạng thái đi qua URL trực tiếp. `env` đặt thêm biến
  môi trường cho riêng ứng dụng đó (ví dụ timeout ngắn hơn).
- Cách khẳng định với relay: giữ đúng một câu lệnh trên kết nối đang mở (kiểm `relay.holding`), để kết quả không đến từ
  connect timeout hay `maxWait`; chặn thời gian bằng timeout đã cấu hình cộng độ trễ nhỏ (quy ước `QUERY_TIMEOUT_MS + SLACK_MS`, 1,5 s), không dùng `sleep` để suy ra thứ tự; kiểm `pg_stat_activity` để chắc không còn backend
  `idle in transaction` khi cần chứng minh không có phần ghi dở.
- Suite theo gói remediation: `database-stall.integration-spec.ts` (câu lệnh ngừng được trả lời trên kết nối đang dùng,
  N-1/R-02/N-2, qua `TransactionRunner` thật), `pg-pool.integration-spec.ts` (pool `createPostgresPool` cùng adapter Prisma:
  kết nối bị loại, không tái sử dụng), `me-unavailable.integration-spec.ts` (`GET /me` ngừng trả lời **sau** guard ⟹ 503
  `SERVICE_UNAVAILABLE`, khác `TOKEN_VERIFICATION_UNAVAILABLE` của guard), cùng unit `src/infrastructure/database/pg-pool.spec.ts`.
- `PgRelay.holdCommitResponse(timeoutMs)` cho COMMIT tới server và chỉ giữ response của connection đó;
  `held` là sự kiện đã giữ byte trả về, `release()`/`dispose()` kết thúc hold và `stop()` dọn timer/socket.
  Test post-COMMIT đọc `organizations` và `audit_events` qua connection trực tiếp để chứng minh cả hai đã commit
  khi caller còn chờ, rồi kiểm timeout hữu hạn, không retry và PID mới. `holdWhen(/^COMMIT/)` là chặn chiều request,
  có thể commit khi hàng đợi được thả: chỉ khẳng định all-or-nothing. Probe UPDATE trước COMMIT mới khẳng định rollback.
- **Đếm câu lệnh (`API-LIST-DETAIL.1`, LD-R3):** `PgRelay.observe(listener)` báo văn bản SQL của **mỗi lần thực thi** (Query,
  hoặc Execute của portal đã Bind — statement đã prepare chạy lại vẫn được đếm), không đọc giá trị bind.
  `support/query-count.ts`: `QueryCounter.on(relay).run(work)` trả `{ result, statements }`; `dataStatements` bỏ
  BEGIN/COMMIT/SET; `tablesOf` liệt kê bảng sau FROM/JOIN. Test collection của hạng mục capability nối ứng dụng qua relay,
  dựng fixture qua URL trực tiếp, rồi khẳng định số câu lệnh bằng nhau trên hai cỡ dữ liệu, không câu lệnh nào đọc bảng chỉ
  detail cần, và không có giá trị bind. Mẫu: `query-count-harness.integration-spec.ts` (đặc tả `exchangeRateList`: 12 câu
  lệnh cho 5 và 60 tỷ giá). Không thêm instrumentation vào `PrismaService` hay dependency mới.
- `pnpm test:mutation` chạy control + đúng ba mutant trên disposable copy, cần cùng role thường/DB riêng;
  xem [runner guide](../scripts/README.md#targeted-mutation-verification). Không sửa checkout trong lúc runner chạy;
  exit/setup failure không được tính là killed và mọi mutant phải restore bytes/hash trước khi dọn copy.
- `installation-minimal-env.integration-spec.ts` chạy lệnh khởi tạo trong tiến trình với môi trường chỉ có
  `DATABASE_URL` và `NODE_ENV=production` (R-13). `installation-cli.integration-spec.ts` khởi chạy (spawn) mã nguồn CLI thật (`src/installation-cli.ts` qua `ts-node`) với môi trường
  tối thiểu, không cần database: `--help` chạy khi chưa cấu hình gì, thiếu `DATABASE_URL` được báo thành một dòng trước
  prompt mật khẩu và không có stack, URL bị từ chối không in lại mật khẩu. Nó chứng minh mã thoát và đầu ra của tiến trình,
  không chỉ của service.
- Mọi test khởi chạy lệnh thành tiến trình con qua `support/cli-process.ts` (`runCli`, `cliWorkingDirectory`,
  `stopCliProcesses` trong `afterAll`): tiến trình và thư mục làm việc được ghi nhận trước khi dùng, bị dừng/xóa khi suite
  kết thúc hoặc Jest thoát ([rule 8](../docs/rules/operational-commands.md)). `src/operational-commands.spec.ts` chặn import
  `child_process` ở test khác. Không để assertion trong helper.
- Lệnh vận hành H6.1/H6.2: `inspect.integration-spec.ts` (tiến trình thật qua các trạng thái chưa migrate/chưa cài/đã
  cài/dở dang, fingerprint mọi bảng trước/sau, ghi thử qua đồ thị inspect bị PostgreSQL từ chối `25006`),
  `dev-seed.integration-spec.ts` (trong tiến trình, generator mật khẩu cố định: rollback, audit, credential thật, vai,
  chạy lại, conflict), `dev-seed-cli.integration-spec.ts` (ma trận chốt, lần tạo và lần chạy lại),
  `installation-bootstrap-facts.integration-spec.ts` (characterization bản ghi cài đặt).
- Test đua khóa (`auth-concurrency.integration-spec.ts`) giữ khóa dòng ở một kết nối `pg` riêng và chờ
  `pg_locks` báo có tiến trình đang chờ trước khi nhả khóa; không dùng `sleep` để ép thứ tự.
- PostgreSQL phải chạy ở UTC **hoặc** để `PrismaService` ghim `TimeZone=UTC` (đã làm). Test
  `audit.integration-spec.ts` ("stores an instant exactly") bắt lỗi lệch múi giờ.
- Máy không chạy được Docker: PostgreSQL 17 nhúng (`embedded-postgres`) đủ cho `TEST_DATABASE_ADMIN_URL`;
  dùng bootstrap superuser của nó để provision role ordinary cùng thuộc tính phía trên trước khi chạy suite.
  `TEST_DATABASE_ADMIN_URL` phải dùng role ordinary đó để kiểm chứng cả `btree_gist` trusted-extension.

## Kho đối tượng thật (tùy chọn)

`test/integration/object-storage-real.integration-spec.ts` chạy adapter S3 thật với một dịch vụ tương thích S3 **kiểm chữ ký**
(MinIO, hoặc LocalStack có `S3_SKIP_SIGNATURE_VALIDATION=0`): đặt `TEST_OBJECT_STORAGE_ENDPOINT` (và, nếu không phải `test`/`test`,
`TEST_OBJECT_STORAGE_ACCESS_KEY_ID`, `TEST_OBJECT_STORAGE_SECRET_ACCESS_KEY`). Không đặt biến thì suite được bỏ qua và nói lý do —
test HTTP của tệp hợp đồng dùng kho trong bộ nhớ, nên chỉ suite này chứng minh việc kho từ chối liên kết ký sai loại/kích thước.
Ví dụ cục bộ: `docker run -d -p 127.0.0.1:54566:4566 -e SERVICES=s3 -e S3_SKIP_SIGNATURE_VALIDATION=0 localstack/localstack:3.8.1`
rồi `TEST_OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:54566 pnpm exec jest --config ./test/config/jest.integration.cjs --runInBand test/integration/object-storage-real`.
