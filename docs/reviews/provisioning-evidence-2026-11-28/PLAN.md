# PLAN — File bằng chứng khi cấp/thu hồi (28/11/2026, bản 1.0)

> **Cho agent code:** dùng `superpowers:executing-plans` + `superpowers:test-driven-development`; bước dùng checkbox `- [ ]`. Đọc trọn
> [SPEC.md](SPEC.md) trước — PLAN chỉ ghi quyết định code, luật nghiệp vụ ở SPEC (EV-xx).

**Mục tiêu:** IT Admin đính kèm tối đa 3 file (PNG/JPEG/WebP/PDF) khi hoàn tất cấp/thu hồi; IT phụ trách và Super Admin xem/tải.

**Kiến trúc:** dùng kho `document_attachments` của `catalog` (thêm 2 `purpose`, cột chủ `provisioning_task_id`); `licensing` gắn file trong giao dịch
hoàn tất qua `CatalogApi`, và mở 2 route đọc trong thư mục mới `provisioning/evidence-files/`.

**Công nghệ:** NestJS 11, Prisma 7 + PostgreSQL 17, Zod DTO, Jest; `FakeObjectStorage` cho test.

## Ràng buộc chung

- Không đổi hành vi ngoài SPEC "Hành vi đúng" (mục 5) — lệch ⟹ ghi `D-n` _cần Owner_ ở `PROGRESS.md`, giữ hành vi cũ.
- Không chạm `src/modules/requests/**` (đợt 4 đang sửa). Không sửa migration đã commit; không sửa `scripts/verify/merged-migrations.txt`.
- Trần: 500 dòng code/file, 60 dòng/hàm, `complexity` 12, 25 file/thư mục, spec unit ≤ 400 dòng, integration/http ≤ 800, `test/support` ≤ 400.
- Spec unit nằm cạnh file nó test; test lỗi khẳng định **mã lỗi** (`body.error.code` hoặc `instanceof` + `problem`), không chỉ status.
- Mã lỗi `DOMAIN.REASON`, một mã một status; mô tả OpenAPI không chứa `QĐ-`/`US-`/`Q-EV`; ví dụ lỗi qua `errorExampleOf(...)` trong hằng `*_ERROR_EXAMPLES`.
- File sinh (`openapi.json`, `docs/generated/*`) chỉ đổi qua `pnpm openapi:export`, `pnpm arch:graph`, `pnpm arch:routes`.
- Không chạy full test/integration ở máy — CI GitHub chạy. Ở máy chỉ bộ kiểm nhanh mục 4 + unit của file đã sửa.

## Review Focus (dễ hỏng nhất, đã có test ở gói sở hữu)

1. Gắn file hỏng giữa chừng phải hủy cả lần hoàn tất (không tác vụ `COMPLETED` mà file vẫn `PENDING_ATTACH`, không file `READY` mà tác vụ chưa xong) — P3, integration ca 4.
2. File bằng chứng `READY` lộ qua route chung `/documents/{id}` hoặc `/links` (Finance đang mở được mọi file `READY`) — P2 `mayOpen`, integration ca 8.
3. IT không còn phụ trách / IT phòng mồ côi đọc được file — P4, dùng **acting** chứ không `getItAdminScope`; integration ca 7.
4. WebP đi lọt cho `CONTRACT_ATTACHMENT` (đổi luật cũ) hoặc chữ ký WebP so sai vì byte 4–7 là độ dài — P2 spec policy.
5. Gửi `evidenceDocumentIds: []` hoặc bỏ trường làm đổi hành vi cũ — P3 unit + test cũ không đổi.

---

## 1. Thứ tự gói

**P1 DB → P2 catalog → P3 licensing ghi → P4 licensing đọc → P5 test tích hợp + sinh file + CI.** Tuần tự, một nhánh `feat/provisioning-evidence-files`.

## 2. Nền

- Nhánh đã tạo từ `origin/dev` `595cdc48`, worktree `D:/FPT/FALL2026/Code/BE-evidence` (thư mục việc đã commit sẵn SPEC/PLAN/CODE-PROMPT).
- Run CI nền: `gh run list --branch dev --workflow ci.yml -L 3` — lấy run `dev` mới nhất đã xong; ghi id ở `PROGRESS.md`.

## 3. Bảng file

| Gói | Tạo                                                                                                                                                                                                                         | Sửa                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | `prisma/migrations/20261211000000_provisioning_evidence_enum_values/migration.sql`, `prisma/migrations/20261211000100_provisioning_evidence_documents/migration.sql`                                                        | `prisma/models/catalog.prisma`                                                                                                                                                                                                                                                                                                                                                  |
| P2  | `src/modules/catalog/contract/provisioning-evidence-document.service.ts` (+ `.spec.ts`)                                                                                                                                     | `catalog/contract/contract.policy.ts` (+ spec), `document.repo.ts`, `document.service.ts` (chỉ nếu `assertFileAllowed` đổi chữ ký), `contract.dto.ts` (nếu enum không tự theo `NEW_DOCUMENT_PURPOSES`), `catalog/public/catalog.api.ts`, `catalog/public/catalog.types.ts` (nếu có), `catalog.module.ts` (provider), `catalog/README.md`, `test/support/fake-object-storage.ts` |
| P3  | `licensing/provisioning/evidence-files/evidence-files.policy.ts` (+ spec) — kiểm danh sách thuần                                                                                                                            | `licensing/provisioning/provisioning.dto.ts`, `provisioning.errors.ts`, `provisioning.http-errors.ts`, `tasks/provisioning-grant-completion.service.ts` (+ spec nếu có), `tasks/provisioning-tasks.controller.ts` (khai lỗi 422), `revocation-completion/revocation-completion.service.ts`, `revocation-completion/revocation-tasks.controller.ts`, registry test (dưới)        |
| P4  | `licensing/provisioning/evidence-files/evidence-files.controller.ts`, `evidence-files.service.ts` (+ spec), `evidence-files.dto.ts`                                                                                         | `licensing/licensing.module.ts`, `licensing/README.md`, `provisioning.errors.ts`, `provisioning.http-errors.ts`, registry test                                                                                                                                                                                                                                                  |
| P5  | `test/integration/licensing/provisioning-evidence-files.integration-spec.ts`, `test/http/licensing/provisioning-evidence-files.http-spec.ts`, `test/support/provisioning-evidence-harness.ts` (nếu harness có sẵn không đủ) | `openapi.json`, `docs/generated/*` (qua generator), `test/http/platform/openapi-presentation.http-spec.ts` (số operation +2), `scripts/verify/capability-graph.test.mjs` (nếu số capability/cạnh đổi)                                                                                                                                                                           |

Registry test phải cập nhật cùng gói thêm route/mã: `test/support/openapi-example-manifest.ts` (message thành công), `test/support/openapi-example-route-codes-licensing.ts`
(mã theo route + status), `test/support/api-coverage-manifest.ts`, `api-collection-registry*.ts` (danh sách có chặn `items` của `evidence-files` — mục
`API-LIST-DETAIL.1` loại bounded). Tìm đúng tên file bằng `git grep -l "provisioningTaskComplete" test/`.

## 4. Bộ kiểm nhanh (trước mỗi commit)

```bash
pnpm prisma:generate            # chỉ khi P1 đổi schema
pnpm typecheck
pnpm exec eslint <file đã sửa>
pnpm arch:check && pnpm rules:check && pnpm format:check
pnpm test:gates
CI=true pnpm test -- <spec unit của file đã sửa>
```

Thêm ở P4/P5: `pnpm openapi:export && pnpm arch:routes && pnpm arch:graph && pnpm arch:capabilities --module licensing && pnpm arch:capabilities --module catalog`
rồi `pnpm arch:docs:check`. Kết quả thật (số pass/fail) ghi `PROGRESS.md`.

## 5. Khuôn mỗi gói

0. Đọc file sẽ sửa + spec hiện có. 1. Viết test đỏ (unit). 2. Chạy ⟹ đỏ đúng lý do. 3. Code tối thiểu. 4. Chạy ⟹ xanh. 5. Bộ kiểm nhanh. 6. Tự đọc
   `git diff` đối chiếu từng EV của gói. 7. Commit (message tiếng Anh, kiểu `feat(licensing): …`, cuối có `Spec: EV-xx, EV-yy`). 8. Cập nhật `PROGRESS.md`.

---

## 6. Các gói

### P1 — Migration + Prisma (EV dữ liệu, SPEC §4)

**Interfaces — Produces:** cột `provisioningTaskId: string | null` trên `DocumentAttachment`; enum `DocumentPurpose` có `PROVISIONING_EVIDENCE`, `ACCESS_CUT_EVIDENCE`.

- [ ] Đọc `prisma/migrations/20261020250000_catalog_contracts_and_documents/migration.sql`, `20261022130000_document_final_key_and_expiry/migration.sql`,
      `20261113004560_rc2_out_of_process_cases/migration.sql`; `git grep -l "document_attachment_guard" prisma/migrations` ⟹ định nghĩa guard **mới nhất**.
- [ ] M1: chỉ `ALTER TYPE … ADD VALUE IF NOT EXISTS` hai giá trị (tên type đúng như migration gốc).
- [ ] M2: cột + index + hai CHECK (`DROP CONSTRAINT IF EXISTS` rồi `ADD`) + guard (SPEC §4). Mọi câu idempotent khi có thể.
- [ ] `catalog.prisma`: enum + cột + `@@index`. `pnpm prisma:generate`, `pnpm typecheck` (union `DocumentPurpose` TS ở `contract.policy.ts:23` sẽ bắt
      `Record<DocumentPurpose, …>` thiếu khóa ⟹ thêm tạm hai khóa `PURPOSE_ROLES` ở P2 — nếu typecheck đỏ do đó, gộp phần `PURPOSE_ROLES` vào commit P1).
- [ ] Gate: `CI=true pnpm test -- test/gates/migration-order.gate-spec.ts` xanh.
- [ ] Commit `feat(catalog): provisioning evidence purposes and owner column on document attachments` — `Spec: SPEC §4`.

(Test DB của guard/CHECK nằm ở P5 ca 10 — chạy trên CI.)

### P2 — Catalog: luật file + gắn/liệt kê/ký link (EV-01…05, EV-09/10 phía catalog)

**Interfaces — Produces (cửa `CatalogApi`, dùng ở P3/P4):**

```ts
type ProvisioningEvidencePurpose = 'PROVISIONING_EVIDENCE' | 'ACCESS_CUT_EVIDENCE';
interface ProvisioningEvidenceFile {
  id: string; purpose: ProvisioningEvidencePurpose; fileName: string; contentType: string; sizeBytes: number; attachedAt: Date;
}
attachProvisioningEvidence(tx: DbTx, actor: AuthenticatedPrincipal,
  input: { documentIds: readonly string[]; provisioningTaskId: string; purpose: ProvisioningEvidencePurpose }): Promise<void>;
  // ném DocumentAttachRefusedError(problem) — khuôn attachOutOfProcessCaseDocuments (catalog.api.ts:226-240)
listProvisioningEvidence(provisioningTaskId: string, tx?: DbTx): Promise<ProvisioningEvidenceFile[]>;
  // chỉ READY, purpose ∈ hai giá trị mới, ORDER BY attached_at, id
issueProvisioningEvidenceLink(actor: AuthenticatedPrincipal,
  input: { provisioningTaskId: string; documentId: string }): Promise<{ url: string; expiresAt: Date } | null>;
  // null khi file không READY / không thuộc tác vụ / không phải purpose mới; KHÔNG qua mayOpen (licensing đã xét quyền)
```

Kiểu xuất ở `catalog/public/` (file types hiện có của public, hoặc cạnh `catalog.api.ts` theo quy ước module).

- [ ] Test đỏ `contract.policy.spec.ts`:
  - `assertMayChoosePurpose('PROVISIONING_EVIDENCE', ['FINANCE'])` ném `DocumentPurposeForbiddenError`; `['IT_ADMIN']` qua. Cùng cho `ACCESS_CUT_EVIDENCE`.
  - `assertPurposeAvailable` qua cho hai purpose mới.
  - `assertFileAllowed` (đọc chữ ký hiện tại ở `contract.policy.ts:93`; thêm tham số `purpose`): `{purpose:'PROVISIONING_EVIDENCE', fileName:'a.webp',
contentType:'image/webp'}` qua; `{purpose:'CONTRACT_ATTACHMENT', … 'a.webp','image/webp'}` ném `DocumentTypeNotAllowedError`; `'a.png'` +
    `'image/webp'` ném (đuôi không khớp).
  - `contentMatchesType('image/webp', RIFF 01 02 03 04 WEBP …)` true; `RIFF…WAVE` false; prefix 11 byte false. `SIGNATURE_PREFIX_BYTES >= 12`.
  - `mayOpen({purpose:'PROVISIONING_EVIDENCE', status:'READY', roles:['IT_ADMIN'], …})` = `'HIDDEN'`; cùng cho `FINANCE` (`'FORBIDDEN'` hoặc `'HIDDEN'` —
    khẳng định **không** `'OPEN'`); `PENDING_ATTACH` + uploader = actor ⟹ `'OPEN'`.
  - `assertPurposeAttachesTo('PROVISIONING_EVIDENCE','PROVISIONING_TASK')` qua; `('CONTRACT_ATTACHMENT','PROVISIONING_TASK')` ném
    `DocumentPurposeMismatchError`; `('PROVISIONING_EVIDENCE','CONTRACT')` ném.
- [ ] Code `contract.policy.ts`: `PURPOSE_ROLES`, `NEW_DOCUMENT_PURPOSES`, `ATTACHES_TO_PROVISIONING_TASK`, target `'PROVISIONING_TASK'`, `assertPurposeAvailable`,
      `ALLOWED_TYPES` theo purpose (giữ bảng cũ cho purpose cũ; bảng thêm `image/webp: ['webp']` cho hai purpose mới), `SIGNATURES` cho phép byte tùy ý
      (`null`) ở vị trí 4–7 của WebP, `mayOpen`. Mọi nơi gọi `assertFileAllowed` (`document.service.ts:86` và chỗ khác — `git grep -n "assertFileAllowed("
    src/modules/catalog`) truyền `purpose`.
- [ ] `test/support/fake-object-storage.ts` `GENUINE_START['image/webp']` = `[0x52,0x49,0x46,0x46,0x24,0,0,0,0x57,0x45,0x42,0x50]`.
- [ ] Test đỏ `provisioning-evidence-document.service.spec.ts` (mock repo/audit như `budget-attachment-*.spec.ts` hoặc spec catalog hiện có):
  - khóa theo id đã sắp (`lock` gọi theo thứ tự `['a','b']` khi vào `['b','a']`);
  - uploader khác ⟹ `DocumentNotFoundError`; purpose `ACCESS_CUT_EVIDENCE` khi input `PROVISIONING_EVIDENCE` ⟹ `DocumentPurposeMismatchError`; `READY` ⟹
    `DocumentAlreadyAttachedError`; `AWAITING_UPLOAD` ⟹ `DocumentNotReadyToAttachError`;
  - thành công: `markAttachedToProvisioningTask(tx, id, taskId, now)` mỗi file + audit `DOCUMENT.ATTACHED` after `{ status:'READY', provisioningTaskId }`;
  - `issueLink`: file READY đúng tác vụ ⟹ gọi `createDownloadUrl({ key: finalObjectKey ?? objectKey, fileName, contentType, expiresInSeconds: 300 })`, audit
    `DOCUMENT.LINK_ISSUED` có `expiresAt`, không có `url`; file tác vụ khác ⟹ `null`, không audit.
- [ ] Code service mới (`@Injectable`, một use case nhóm "file bằng chứng tác vụ") + repo `markAttachedToProvisioningTask`, `listReadyOfProvisioningTask`,
      (đọc một file theo id + task) theo khuôn `markAttachedToOutOfProcessCase`; facade 3 hàm; đăng ký provider `catalog.module.ts`.
- [ ] `catalog/README.md`: thêm vào thẻ capability `contract/` (purpose mới, file mới, 3 hàm facade).
- [ ] Bộ kiểm nhanh. Commit `feat(catalog): evidence files of a provisioning task (purposes, WebP, attach, list, link)` — `Spec: EV-01…EV-05, EV-09, EV-10`.

### P3 — Licensing: gắn file khi hoàn tất (EV-06…EV-12)

**Interfaces — Consumes:** `CatalogApi.attachProvisioningEvidence`, `DocumentAttachRefusedError` (P2).
**Produces:** `ProvisioningEvidenceFileInvalidError(problem)` ở `provisioning.errors.ts`; hàm thuần
`assertEvidenceFileList(ids: readonly string[] | undefined): readonly string[]` (trả mảng đã sắp, `[]` khi thiếu; ném `TOO_MANY`/`DUPLICATE`) ở
`evidence-files/evidence-files.policy.ts`; hằng `EVIDENCE_FILES_MAX = 3`.

- [ ] Test đỏ `evidence-files.policy.spec.ts`: `undefined`/`[]` ⟹ `[]`; 3 id ⟹ đủ, đã sắp; 4 id ⟹ `ProvisioningEvidenceFileInvalidError` `problem 'TOO_MANY'`;
      `['a','a']` ⟹ `'DUPLICATE'`.
- [ ] DTO: `evidenceDocumentIds: z.array(z.uuid()).max(20).optional()` ở `completeBodySchema`, `revocationCompletionBodySchema`, `accessCutBodySchema`, kèm
      `.meta({ description })` tiếng Anh (tối đa 3 file đã upload qua `/documents` với purpose tương ứng; không chứa mã QĐ).
- [ ] Lỗi: `ProvisioningEvidenceFileInvalidError` → 422 `PROVISIONING_TASK.EVIDENCE_FILE_INVALID` `details { problem }` trong `provisioning.http-errors.ts`
      (+ ví dụ trong `*_ERROR_EXAMPLES`), khai ở 3 route (`@ApiErrorResponses`/mảng lỗi hiện có của controller — `COMPLETE_REVOCATION_ERRORS` cho hai route thu hồi).
- [ ] Ghi:
  - `ProvisioningGrantCompletionService.write` và `writeExtension`: đầu hàm `const fileIds = assertEvidenceFileList(input.evidenceDocumentIds)`; ngay trước
    `repo.markCompleted` gọi helper `attachEvidence(tx, actor, ctx.task.id, fileIds, 'PROVISIONING_EVIDENCE')` (bỏ qua khi `fileIds.length === 0`; bắt
    `DocumentAttachRefusedError` ⟹ ném `ProvisioningEvidenceFileInvalidError(error.problem)`). Audit `PROVISIONING_TASK.COMPLETED` after thêm
    `evidenceDocumentIds: fileIds`.
  - `RevocationCompletionService.complete`: cùng cách, gắn trước `tasks.markRevocationCompleted`, purpose `PROVISIONING_EVIDENCE`; `recordAccessCut` gắn trước
    `tasks.markAccessCut`, purpose `ACCESS_CUT_EVIDENCE`. Audit `REVOCATION_COMPLETED` (qua `completedRevocationAudit`) và `ACCESS_CUT` thêm
    `evidenceDocumentIds`. Helper đặt ở một chỗ dùng chung trong `evidence-files/` (ví dụ `evidence-file-attacher.service.ts`, `@Injectable`) để không phình
    callback `complete` (~45 dòng, trần 60).
  - Truyền `evidenceDocumentIds` từ controller → service (`input` hiện là object DTO; thêm trường vào kiểu `input`).
- [ ] Unit (spec hiện có của hai service, **chỉ thêm ca**): không gửi file ⟹ không gọi catalog, audit có `evidenceDocumentIds: []`; gửi 2 file ⟹ catalog gọi
      đúng `purpose` trước `markCompleted`/`markRevocationCompleted`/`markAccessCut` (kiểm thứ tự gọi bằng mock `invocationCallOrder`); catalog ném
      `DocumentAttachRefusedError('PURPOSE_MISMATCH')` ⟹ ném `ProvisioningEvidenceFileInvalidError` `problem 'PURPOSE_MISMATCH'` và **không** gọi `markCompleted`.
      `revocation.policy.spec.ts` (389 dòng) **không** thêm ca.
- [ ] Registry: route codes (422 mới ở 3 route), ví dụ lỗi.
- [ ] Bộ kiểm nhanh + `CI=true pnpm test -- src/modules/licensing/provisioning`. Commit `feat(licensing): attach evidence files when a provisioning task is
    completed or access is cut` — `Spec: EV-06…EV-12`; ghi `Kiểm giữ:` liệt kê mọi kiểm cũ của 3 hàm ghi (khung, `cleanEvidence`, K1, K4, `NOT_BEFORE`,
      `NOT_TERMINATING`) và khẳng định thứ tự không đổi.

### P4 — Licensing: route đọc (EV-13…EV-16)

**Interfaces — Consumes:** `CatalogApi.listProvisioningEvidence`, `issueProvisioningEvidenceLink` (P2); `ProvisioningTaskFrame.requireActingItAdmin` (frame `:134`);
repo đọc tác vụ có `assignment.employeeId` (khung đọc ở `provisioning-task-frame.service.ts:72-73` — dùng hàm đọc **không khóa** có sẵn của
`ProvisioningTaskRepo`, ví dụ hàm `ProvisioningService.get` dùng).
**Produces:** `EvidenceFilesService.list(actor, taskId): Promise<EvidenceFileView[]>`, `EvidenceFilesService.link(actor, taskId, fileId): Promise<{ url: string; expiresAt: Date }>`;
`ProvisioningEvidenceFileNotFoundError` → 404 `PROVISIONING_TASK.EVIDENCE_FILE_NOT_FOUND`. `EvidenceFileView = { id, stage: 'COMPLETION'|'ACCESS_CUT', fileName, contentType, sizeBytes, attachedAt }`.

- [ ] Test đỏ `evidence-files.service.spec.ts`: Super Admin ⟹ không gọi `requireActingItAdmin`, trả danh sách (map `PROVISIONING_EVIDENCE`→`COMPLETION`,
      `ACCESS_CUT_EVIDENCE`→`ACCESS_CUT`); IT phụ trách ⟹ trả; `requireActingItAdmin` ném `ProvisioningNotInChargeError` ⟹ ném `ProvisioningTaskNotFoundError`
      (đúng lớp lỗi hiện có của 404 `PROVISIONING_TASK.NOT_FOUND`); ném `EmployeeNotStartedError` ⟹ cũng `ProvisioningTaskNotFoundError`; tác vụ không tồn tại
      ⟹ `ProvisioningTaskNotFoundError`; `link` khi facade trả `null` ⟹ `ProvisioningEvidenceFileNotFoundError`.
- [ ] Code service + DTO (Zod, `createZodDto`, envelope thành công như các route licensing) + controller `@Controller({ path: 'provisioning-tasks', version: '1' })`
      với `@Get(':id/evidence-files')` (`@RequireRoles('IT_ADMIN','SUPER_ADMIN')`, operationId `provisioningTaskEvidenceFileList`) và
      `@Post(':id/evidence-files/:fileId/links')` (`no-store`, operationId `provisioningTaskEvidenceFileLink`, status 200 như `POST documents/:id/links`);
      tham số theo khuôn `TaskIdParamDto` (`provisioning.dto.ts:309`, Zod `@Param()`): `TaskIdParamDto` cho route danh sách, DTO mới
      `EvidenceFileParamDto` (`{ id: uuid, fileId: uuid }`, strict) cho route link. Message thành công theo quy ước `PROVISIONING_TASK.*` (đăng ký manifest).
- [ ] `licensing.module.ts` đăng ký controller + provider; `licensing/README.md` thẻ capability mới `provisioning/evidence-files/` (mục đích; file; route; mã lỗi).
- [ ] Registry (route codes, coverage, collection bounded, message). `pnpm openapi:export && pnpm arch:routes && pnpm arch:graph`,
      `pnpm arch:capabilities --module licensing` ⟹ không vòng; cập nhật `scripts/verify/capability-graph.test.mjs` nếu số liệu đổi.
- [ ] Bộ kiểm nhanh. Commit `feat(licensing): list and open the evidence files of a provisioning task (responsible IT Admin, Super Admin)` — `Spec: EV-13…EV-16`.

### P5 — Test tích hợp + HTTP + CI

- [ ] Harness: đọc `test/support/provisioning-harness.ts` (`granted` `:249`, `complete` `:236`), `revocation-harness.ts` (`revoked` `:153`, `accessCut`
      `:158`), `document-harness.ts` (`providerOverrides` `OBJECT_STORAGE` `:23-31`, `uploaded()` `:70`), `devices-harness.ts:118` (khuôn kế thừa). Nếu
      harness provisioning chưa nhận `providerOverrides` ⟹ tạo `test/support/provisioning-evidence-harness.ts` (≤ 400 dòng) ghép hai cái, **không** sửa
      hành vi harness cũ.
- [ ] Integration `provisioning-evidence-files.integration-spec.ts`: đủ 10 ca SPEC §8 (≤ 800 dòng; quá ⟹ tách `…-read.integration-spec.ts`). Ca 10 dùng SQL trực tiếp
      và khẳng định `code = '23514'` (CHECK) / mã lỗi guard như các spec guard catalog hiện có (`git grep -n "document_attachment_guard" test/`).
- [ ] HTTP `provisioning-evidence-files.http-spec.ts` (khuôn `test/http/licensing/provisioning.http-spec.ts`): vai 2 route mới; uuid sai ⟹ 400;
      `evidenceDocumentIds: ['x']` ⟹ 400 ở 3 route; OpenAPI khai 422 `EVIDENCE_FILE_INVALID` ở 3 route, 404 `EVIDENCE_FILE_NOT_FOUND` ở route link.
- [ ] `test/http/platform/openapi-presentation.http-spec.ts`: số operation +2 (đọc số hiện tại trên nhánh).
- [ ] Sinh lại: `pnpm openapi:export && pnpm arch:routes && pnpm arch:graph && pnpm arch:docs:check`; `pnpm rules:format` cho tài liệu.
- [ ] Self-review toàn diff với SPEC (bảng EV → test → file) ghi vào `PROGRESS.md`.
- [ ] Push; `gh workflow run ci.yml --ref feat/provisioning-evidence-files`; chờ xong; phân loại **từng test đỏ** so với run nền (mục 2): đỏ cùng tên trên nền ⟹
      nợ cũ; đỏ mới ⟹ sửa (tối đa 2 vòng), rồi CI lại. Ghi run id + bảng phân loại ở `PROGRESS.md`.
- [ ] Commit `test(licensing): evidence files of provisioning tasks end to end` — `Spec: SPEC §8`.

## 7. Xong khi

- Mọi EV-01…EV-16 có test trỏ tới (bảng trong `PROGRESS.md`).
- CI tay trên nhánh: `quality`, `http-contract`, `e2e-smoke`, `integration-inband` xanh; `integration (1..3)` không có test đỏ **mới** so với nền.
- Không test cũ nào đổi kỳ vọng (chỉ thêm ca); không file nào vượt trần; `openapi.json`/`docs/generated` khớp generator.
- Báo cáo cuối theo CODE-PROMPT mục 5. **Không** mở PR — điều phối review rồi mở.
