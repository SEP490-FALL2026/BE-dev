# PLAN — File bằng chứng khi cấp/thu hồi (28/11/2026, bản 1.1)

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
6. Hai lần hoàn tất cùng gửi một file ⟹ deadlock hoặc file gắn hai tác vụ — P3 khóa file ngay sau tầng 3a/3b; integration ca 11.

---

## 1. Thứ tự gói

**P1 DB → P2 catalog → P3 licensing ghi → P4 licensing đọc → P5 test tích hợp + sinh file + CI.** Tuần tự, một nhánh `feat/provisioning-evidence-files`.

## 2. Nền

- Nhánh đã tạo từ `origin/dev` `595cdc48`, worktree `D:/FPT/FALL2026/Code/BE-evidence` (thư mục việc đã commit sẵn SPEC/PLAN/CODE-PROMPT).
- Run CI nền: `gh run list --branch dev --workflow ci.yml -L 3` — lấy run `dev` mới nhất đã xong; ghi id ở `PROGRESS.md`.

## 3. Bảng file

| Gói | Tạo                                                                                                                                                                                                           | Sửa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | `prisma/migrations/20261211000000_provisioning_evidence_enum_values/migration.sql`, `prisma/migrations/20261211000100_provisioning_evidence_documents/migration.sql`                                          | `prisma/models/catalog.prisma`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P2  | `src/modules/catalog/contract/provisioning-evidence-document.service.ts` (+ `.spec.ts`)                                                                                                                       | `catalog/contract/contract.policy.ts` (+ spec), `document.repo.ts`, `document.service.ts` (chỉ nếu `assertFileAllowed` đổi chữ ký), `contract.dto.ts` (nếu enum không tự theo `NEW_DOCUMENT_PURPOSES`), `catalog/public/catalog.api.ts`, `catalog/public/catalog.types.ts` (nếu có), `catalog.module.ts` (provider), `catalog/README.md`, `test/support/fake-object-storage.ts`                                                                                                                                                                                                                          |
| P3  | `licensing/provisioning/evidence-files/provisioning-evidence-files.policy.ts` (+ spec) — kiểm danh sách thuần; `provisioning-evidence-files.service.ts` (+ spec) — điểm vào nhóm: hàm gắn                     | `licensing/provisioning/provisioning.dto.ts`, `provisioning.errors.ts`, `provisioning.http-errors.ts`, `provisioning-task-frame.service.ts` (kiểu `after`), `tasks/provisioning-grant-completion.service.ts`, `tasks/provisioning.service.ts` (+ spec, audit), `tasks/provisioning-tasks.controller.ts` (khai lỗi 422 inline `:229-241`), `revocation-completion/revocation-completion.service.ts`, `revocation-completion/revocation-tasks.controller.ts` (`COMPLETE_REVOCATION_ERRORS` `:28` + access-cut inline `:107-127`), `docs/rules/database-business.md` (hàng khóa `3c`), registry test (dưới) |
| P4  | `licensing/provisioning/evidence-files/provisioning-evidence-files.controller.ts`, `provisioning-evidence-files.dto.ts`; thêm hàm đọc vào `provisioning-evidence-files.service.ts` (+ spec)                   | `licensing/licensing.module.ts`, `licensing/README.md`, `provisioning.errors.ts`, `provisioning.http-errors.ts`, registry test                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P5  | `test/integration/licensing/provisioning-evidence-files.integration-spec.ts`, `test/http/licensing/provisioning-evidence-files.http-spec.ts`, `test/support/provisioning-evidence-harness.ts` (bắt buộc — P5) | `openapi.json`, `docs/generated/*` (qua generator), `test/http/platform/openapi-presentation.http-spec.ts` (số operation +2), `scripts/verify/capability-graph.test.mjs` (nếu số capability/cạnh đổi)                                                                                                                                                                                                                                                                                                                                                                                                    |

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
- [ ] M2: cột + index + hai CHECK (`DROP CONSTRAINT IF EXISTS` rồi `ADD`). **Không** đụng guard (SPEC §4).
- [ ] `catalog.prisma`: enum + cột + `@@index`. `pnpm prisma:generate`.
- [ ] Cùng commit P1 (để typecheck xanh — `DocumentRepo.insert/find` `document.repo.ts:54,58` đỏ khi purpose của Prisma rộng hơn `DocumentRecord.purpose`):
      `contract.policy.ts` thêm `export type ProvisioningEvidencePurpose = 'PROVISIONING_EVIDENCE' | 'ACCESS_CUT_EVIDENCE'` vào union `DocumentPurpose`
      (`:24`) và hai khóa `PURPOSE_ROLES` (`['IT_ADMIN']`). **Chưa** thêm vào `NEW_DOCUMENT_PURPOSES` (P2). `pnpm typecheck` xanh.
- [ ] Gate: `CI=true pnpm test -- test/gates/migration-order.gate-spec.ts` xanh.
- [ ] Commit `feat(catalog): provisioning evidence purposes and owner column on document attachments` — `Spec: SPEC §4`.

(Test DB của CHECK/guard nằm ở P5 ca 10 — chạy trên CI.)

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
  - Sửa kỳ vọng ca `:69-75` (danh sách `NEW_DOCUMENT_PURPOSES` thêm đúng 2 giá trị) — ngoại lệ được phép (SPEC EV-01).
  - `assertFileAllowed` (đọc chữ ký hiện tại ở `contract.policy.ts:93`; thêm `purpose` **tùy chọn** — thiếu ⟹ bảng cũ; ca cũ `:129-165` không sửa): `{purpose:'PROVISIONING_EVIDENCE', fileName:'a.webp',
contentType:'image/webp'}` qua; `{purpose:'CONTRACT_ATTACHMENT', … 'a.webp','image/webp'}` ném `DocumentTypeNotAllowedError`; `'a.png'` +
    `'image/webp'` ném (đuôi không khớp).
  - `contentMatchesType('image/webp', RIFF 01 02 03 04 WEBP …)` true; `RIFF…WAVE` false; prefix 11 byte false; `SIGNATURE_PREFIX_BYTES >= 12`.
    Nhận diện WebP **dùng lại** `src/infrastructure/object-storage/picture-image.ts:27` (export nếu chưa export; không chép bảng byte).
  - `mayOpen({purpose:'PROVISIONING_EVIDENCE', status:'READY', roles:['IT_ADMIN'], …})` = `'HIDDEN'`; cùng cho `FINANCE` (`'FORBIDDEN'` hoặc `'HIDDEN'` —
    khẳng định **không** `'OPEN'`); `PENDING_ATTACH` + uploader = actor ⟹ `'OPEN'`.
  - `assertPurposeAttachesTo('PROVISIONING_EVIDENCE','PROVISIONING_TASK')` qua; `('CONTRACT_ATTACHMENT','PROVISIONING_TASK')` ném
    `DocumentPurposeMismatchError`; `('PROVISIONING_EVIDENCE','CONTRACT')` ném.
- [ ] Code `contract.policy.ts`: `PURPOSE_ROLES`, `NEW_DOCUMENT_PURPOSES`, `ATTACHES_TO_PROVISIONING_TASK`, target `'PROVISIONING_TASK'`, `assertPurposeAvailable`,
      `ALLOWED_TYPES` theo purpose (giữ bảng cũ cho purpose cũ; bảng thêm `image/webp: ['webp']` cho hai purpose mới), `contentMatchesType` nhận WebP
      qua `picture-image.ts`, `mayOpen`. Nơi gọi duy nhất `document.service.ts:87` truyền `purpose`.
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
**Produces:**

- `ProvisioningEvidenceFileInvalidError(problem)` ở `provisioning.errors.ts`.
- Hàm thuần `assertEvidenceFileList(ids: readonly string[] | undefined): readonly string[]` (trả mảng đã sắp, `[]` khi thiếu; ném `TOO_MANY`/`DUPLICATE`),
  hằng `EVIDENCE_FILES_MAX = 3` ở `evidence-files/provisioning-evidence-files.policy.ts`.
- `ProvisioningEvidenceFilesService` (`@Injectable`, điểm vào nhóm `evidence-files/provisioning-evidence-files.service.ts`):
  `attach(tx: DbTx, actor: AuthenticatedPrincipal, taskId: string, ids: readonly string[] | undefined, purpose: ProvisioningEvidencePurpose): Promise<readonly string[]>`
  — gọi `assertEvidenceFileList`; mảng rỗng ⟹ trả `[]`, không gọi catalog; còn lại gọi `CatalogApi.attachProvisioningEvidence`, bắt
  `DocumentAttachRefusedError` ⟹ ném `ProvisioningEvidenceFileInvalidError(error.problem)`; trả mảng id đã sắp.

- [ ] Test đỏ `provisioning-evidence-files.policy.spec.ts`: `undefined`/`[]` ⟹ `[]`; 3 id ⟹ đủ, đã sắp; 4 id ⟹ `ProvisioningEvidenceFileInvalidError`
      `problem 'TOO_MANY'`; `['a','a']` ⟹ `'DUPLICATE'`.
- [ ] Test đỏ `provisioning-evidence-files.service.spec.ts` (phần `attach`): rỗng ⟹ không gọi catalog, trả `[]`; 2 id ⟹ gọi catalog đúng `purpose`, trả đã
      sắp; catalog ném `DocumentAttachRefusedError('PURPOSE_MISMATCH')` ⟹ `ProvisioningEvidenceFileInvalidError` `problem 'PURPOSE_MISMATCH'`.
- [ ] DTO: `evidenceDocumentIds: z.array(z.uuid()).max(20).optional()` ở `completeBodySchema`, `revocationCompletionBodySchema`, `accessCutBodySchema`, kèm
      `.meta({ description })` tiếng Anh (tối đa 3 file đã upload qua `/documents` với purpose tương ứng; không chứa mã QĐ).
- [ ] Lỗi: `ProvisioningEvidenceFileInvalidError` → 422 `PROVISIONING_TASK.EVIDENCE_FILE_INVALID` `details { problem }` trong `provisioning.http-errors.ts`
      (+ ví dụ trong `*_ERROR_EXAMPLES`). Khai ở **từng** chỗ: `complete` inline (`provisioning-tasks.controller.ts:229-241`), `COMPLETE_REVOCATION_ERRORS`
      (`revocation-tasks.controller.ts:28`, cho `revocation-completion`), access-cut inline (`:107-127`).
- [ ] Kiểu audit: `TaskWrite.after` (`provisioning-task-frame.service.ts:20`) nới thành `Record<string, AuditValue>` (`audit/public/audit.types.ts:4`).
- [ ] Ghi — gắn là **dòng đầu** callback `write` (sau khung, trước mọi khóa khác; SPEC EV-09):
  - `ProvisioningGrantCompletion.write` / `writeExtension` (tham số thật là `context`): `const evidenceDocumentIds = await this.evidenceFiles.attach(tx,
actor, context.task.id, input.evidenceDocumentIds, 'PROVISIONING_EVIDENCE')` rồi phần cũ y nguyên; hai hàm **trả** `evidenceDocumentIds` (đang `void`).
    `ProvisioningService.complete` (`tasks/provisioning.service.ts:165-190`) thêm `evidenceDocumentIds` vào `after` của audit `PROVISIONING_TASK.COMPLETED`.
  - `RevocationCompletionService.complete`: một dòng gọi `attach(..., 'PROVISIONING_EVIDENCE')` đầu `write`; thêm `evidenceDocumentIds` vào after của
    `REVOCATION_COMPLETED` (qua tham số của `completedRevocationAudit`). Callback đã ~52 dòng tính (trần 60) — nếu vượt, tách phần cũ ra hàm riêng **không
    đổi thứ tự**. `recordAccessCut`: một dòng gọi `attach(..., 'ACCESS_CUT_EVIDENCE')` đầu `write`; after `ACCESS_CUT` thêm `evidenceDocumentIds`.
  - Kiểu input: thêm `evidenceDocumentIds?: readonly string[]` ở chữ ký service (`complete` của grant; `CompletionInput` của thu hồi mở rộng **tại chữ ký
    service**, không sửa `revocation.policy.ts`); controller truyền nguyên DTO.
  - `docs/rules/database-business.md` bảng _Thứ tự khóa chuẩn_: thêm hàng `3c` `document_attachments` `FOR UPDATE` theo `id` tăng — gắn file bằng chứng
    tác vụ, sau `3a`/`3b`, trước `4`.
- [ ] Unit (**chỉ thêm ca** vào `tasks/provisioning.service.spec.ts`, `revocation-completion/revocation-completion.service.spec.ts`; `ProvisioningGrantCompletion`
      chưa có spec ⟹ ca grant đặt ở `provisioning.service.spec.ts` hoặc spec mới `provisioning-grant-completion.service.spec.ts`): không gửi file ⟹ audit
      có `evidenceDocumentIds: []`; gửi 2 file ⟹ `evidenceFiles.attach` gọi **trước** `markCompleted`/`markRevocationCompleted`/`markAccessCut` và trước
      khóa dòng/assignment (`invocationCallOrder`); `attach` ném ⟹ **không** gọi `markCompleted`. `revocation.policy.spec.ts` (389 dòng) **không** thêm ca.
- [ ] Registry: route codes (422 mới ở 3 route), ví dụ lỗi. Đăng ký provider `ProvisioningEvidenceFilesService` ở `licensing.module.ts`.
- [ ] Bộ kiểm nhanh + `CI=true pnpm test -- src/modules/licensing/provisioning`. Commit `feat(licensing): attach evidence files when a provisioning task
    is completed or access is cut` — `Spec: EV-06…EV-12`; ghi `Kiểm giữ:` liệt kê mọi kiểm cũ của 3 hàm ghi (khung, `cleanEvidence`, K1, K4, `NOT_BEFORE`,
      `NOT_TERMINATING`) và khẳng định thứ tự giữa chúng không đổi.

### P4 — Licensing: route đọc (EV-13…EV-16)

**Interfaces — Consumes:** `CatalogApi.listProvisioningEvidence`, `issueProvisioningEvidenceLink` (P2); `ProvisioningTaskFrame.requireActingItAdmin` (frame `:134`);
repo đọc tác vụ có `assignment.employeeId` (khung đọc ở `provisioning-task-frame.service.ts:72-73` — dùng hàm đọc **không khóa** có sẵn của
`ProvisioningTaskRepo`, ví dụ hàm `ProvisioningService.get` dùng).
**Produces:** `ProvisioningEvidenceFilesService.list(actor, taskId): Promise<EvidenceFileView[]>`, `ProvisioningEvidenceFilesService.link(actor, taskId, fileId): Promise<{ url: string; expiresAt: Date }>`;
`ProvisioningEvidenceFileNotFoundError` → 404 `PROVISIONING_TASK.EVIDENCE_FILE_NOT_FOUND`. `EvidenceFileView = { id, stage: 'COMPLETION'|'ACCESS_CUT', fileName, contentType, sizeBytes, attachedAt }`.

- [ ] Test đỏ `provisioning-evidence-files.service.spec.ts` (phần đọc): Super Admin ⟹ không gọi `requireActingItAdmin`, trả danh sách (map `PROVISIONING_EVIDENCE`→`COMPLETION`,
      `ACCESS_CUT_EVIDENCE`→`ACCESS_CUT`); IT phụ trách ⟹ trả; `requireActingItAdmin` ném `ProvisioningNotInChargeError` ⟹ ném `ProvisioningTaskNotFoundError`
      (đúng lớp lỗi hiện có của 404 `PROVISIONING_TASK.NOT_FOUND`); ném `EmployeeNotStartedError` ⟹ cũng `ProvisioningTaskNotFoundError`; tác vụ không tồn tại
      ⟹ `ProvisioningTaskNotFoundError`; `link` khi facade trả `null` ⟹ `ProvisioningEvidenceFileNotFoundError`.
- [ ] Code `list`/`link` trong `provisioning-evidence-files.service.ts` + `provisioning-evidence-files.dto.ts` (Zod, `createZodDto`, envelope thành công như các route licensing) + `provisioning-evidence-files.controller.ts` `@Controller({ path: 'provisioning-tasks', version: '1' })`
      với `@Get(':id/evidence-files')` (`@RequireRoles('IT_ADMIN','SUPER_ADMIN')`, operationId `provisioningTaskEvidenceFileList`) và
      `@Post(':id/evidence-files/:fileId/links')` (`no-store`, operationId `provisioningTaskEvidenceFileLink`, status 200 như `POST documents/:id/links`);
      tham số theo khuôn `TaskIdParamDto` (`provisioning.dto.ts:309`, Zod `@Param()`): `TaskIdParamDto` cho route danh sách, DTO mới
      `EvidenceFileParamDto` (`{ id: uuid, fileId: uuid }`, strict) cho route link. Message thành công theo quy ước `PROVISIONING_TASK.*` (đăng ký manifest).
- [ ] `licensing.module.ts` đăng ký controller; `licensing/README.md` thẻ capability mới `provisioning/evidence-files/` (mục đích; file; route; mã lỗi).
- [ ] Registry (route codes, coverage, collection bounded, message). `pnpm openapi:export && pnpm arch:routes && pnpm arch:graph`,
      `pnpm arch:capabilities --module licensing` ⟹ không vòng; cập nhật `scripts/verify/capability-graph.test.mjs` nếu số liệu đổi.
- [ ] Bộ kiểm nhanh. Commit `feat(licensing): list and open the evidence files of a provisioning task (responsible IT Admin, Super Admin)` — `Spec: EV-13…EV-16`.

### P5 — Test tích hợp + HTTP + CI

- [ ] Harness: đọc `test/support/provisioning-harness.ts` (`granted` `:249`, `complete` `:236`), `revocation-harness.ts` (`revoked` `:153`, `accessCut`
      `:158`), `document-harness.ts` (`providerOverrides` `OBJECT_STORAGE` `:23-31`, `uploaded()` `:70`), `devices-harness.ts:118` (khuôn kế thừa).
      `DocumentHarness` đã kế thừa `ProvisioningHarness` (có kho giả + upload) ⟹ ca 1–5, 7–9, 11 dùng nó. `RevocationHarness`
      (`revocation-harness.ts:64`) **không** có kho file ⟹ **bắt buộc** tạo `test/support/provisioning-evidence-harness.ts` (≤ 400 dòng) kế thừa
      `RevocationHarness`, override `start` thêm `FakeObjectStorage` qua `providerOverrides` (`provisioning-harness.ts:173-179`), mang
      `createDocument/completeDocument/putObject/uploaded` như `document-harness.ts:23-39,70` — cho ca 6. Không sửa hành vi harness cũ.
- [ ] Integration `provisioning-evidence-files.integration-spec.ts`: đủ 11 ca SPEC §8 (≤ 800 dòng; quá ⟹ tách `…-read.integration-spec.ts`). Ca 10 theo khuôn
      `test/integration/catalog/document-constraints.integration-spec.ts:142` (khẳng định cả `code` lẫn **tên** constraint). Ca 11 theo một spec
      đồng thời có sẵn (`git grep -ln "40P01" test/integration`).
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
