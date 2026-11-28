# PLAN — File bằng chứng khi cấp/thu hồi (28/11/2026, bản 1.2)

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

**P1 DB (S) → P2a luật file (S) → P2b catalog gắn/đọc (M) → [mốc] → P3a cấp xong (M) → P3b thu hồi + cắt truy cập (S/M) → [mốc] → P4 route đọc (M)
→ P5 test tích hợp + sinh file + CI (M).** Tuần tự, một nhánh `feat/provisioning-evidence-files`.

## 2. Nền

- Nhánh đã tạo từ `origin/dev` `595cdc48`, worktree `D:/FPT/FALL2026/Code/BE-evidence` (thư mục việc đã commit sẵn SPEC/PLAN/CODE-PROMPT).
- Run CI nền: `gh run list --branch dev --workflow ci.yml -L 3` — lấy run `dev` mới nhất đã xong; ghi id ở `PROGRESS.md`.

## 3. Bảng file

| Gói     | Tạo                                                                                                                                                                                                           | Sửa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1      | `prisma/migrations/20261211000000_provisioning_evidence_enum_values/migration.sql`, `prisma/migrations/20261211000100_provisioning_evidence_documents/migration.sql`                                          | `prisma/models/catalog.prisma`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P2a/P2b | `src/modules/catalog/contract/provisioning-evidence-document.service.ts` (+ `.spec.ts`)                                                                                                                       | `catalog/contract/contract.policy.ts` (+ spec), `document.repo.ts`, `document.service.ts` (chỉ nếu `assertFileAllowed` đổi chữ ký), `contract.dto.ts` (nếu enum không tự theo `NEW_DOCUMENT_PURPOSES`), `catalog/public/catalog.api.ts`, `catalog/public/catalog.types.ts` (nếu có), `catalog.module.ts` (provider), `catalog/README.md`, `test/support/fake-object-storage.ts`                                                                                                                                                                                                                          |
| P3a/P3b | `licensing/provisioning/evidence-files/provisioning-evidence-files.policy.ts` (+ spec) — kiểm danh sách thuần; `provisioning-evidence-files.service.ts` (+ spec) — điểm vào nhóm: hàm gắn                     | `licensing/provisioning/provisioning.dto.ts`, `provisioning.errors.ts`, `provisioning.http-errors.ts`, `provisioning-task-frame.service.ts` (kiểu `after`), `tasks/provisioning-grant-completion.service.ts`, `tasks/provisioning.service.ts` (+ spec, audit), `tasks/provisioning-tasks.controller.ts` (khai lỗi 422 inline `:229-241`), `revocation-completion/revocation-completion.service.ts`, `revocation-completion/revocation-tasks.controller.ts` (`COMPLETE_REVOCATION_ERRORS` `:28` + access-cut inline `:107-127`), `docs/rules/database-business.md` (hàng khóa `3c`), registry test (dưới) |
| P4      | `licensing/provisioning/evidence-files/provisioning-evidence-files.controller.ts`, `provisioning-evidence-files.dto.ts`; thêm hàm đọc vào `provisioning-evidence-files.service.ts` (+ spec)                   | `licensing/licensing.module.ts`, `licensing/README.md`, `provisioning.errors.ts`, `provisioning.http-errors.ts`, registry test                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P5      | `test/integration/licensing/provisioning-evidence-files.integration-spec.ts`, `test/http/licensing/provisioning-evidence-files.http-spec.ts`, `test/support/provisioning-evidence-harness.ts` (bắt buộc — P5) | `openapi.json`, `docs/generated/*` (qua generator), `test/http/platform/openapi-presentation.http-spec.ts` (số operation +2), `scripts/verify/capability-graph.test.mjs` (nếu số capability/cạnh đổi)                                                                                                                                                                                                                                                                                                                                                                                                    |

**Registry dùng file mảnh** (như đợt 4 — tránh xung đột khi gộp): mỗi registry thêm **một** file `…-provisioning-evidence.ts` cạnh file gộp và **một**
dòng import/spread ở file gộp (khuôn: `git show origin/feat/redesign-w4-wave-c --stat` có `openapi-example-route-codes-w4-c-view.ts`,
`api-coverage-manifest-w4-c-view.ts`, `api-collection-registry-nested-w4-c-view.ts`). Registry test phải cập nhật cùng gói thêm route/mã: `test/support/openapi-example-manifest.ts` (message thành công), `test/support/openapi-example-route-codes-licensing.ts`
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

### P2a — Catalog: luật file (EV-01…EV-05) — cỡ S

**Tiêu chí:** (1) hai purpose mới chỉ IT Admin khai được; (2) WebP chỉ nhận cho hai purpose mới, purpose cũ giữ PDF/PNG/JPEG; (3) `mayOpen` không bao giờ
`OPEN` file bằng chứng `READY`.

**Interfaces — Produces (P2b tạo; cửa `CatalogApi`, dùng ở P3/P4):**

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
    Nhận diện WebP **dùng lại** `pictureKindOf(prefix)?.contentType === 'image/webp'` (`src/infrastructure/object-storage/picture-image.ts:24`, đã export;
    không chép bảng byte).
  - `mayOpen({purpose:'PROVISIONING_EVIDENCE', status:'READY', roles:['IT_ADMIN'], …})` = `'HIDDEN'`; cùng cho `FINANCE` (`'FORBIDDEN'` hoặc `'HIDDEN'` —
    khẳng định **không** `'OPEN'`); `PENDING_ATTACH` + uploader = actor ⟹ `'OPEN'`.
  - `assertPurposeAttachesTo('PROVISIONING_EVIDENCE','PROVISIONING_TASK')` qua; `('CONTRACT_ATTACHMENT','PROVISIONING_TASK')` ném
    `DocumentPurposeMismatchError`; `('PROVISIONING_EVIDENCE','CONTRACT')` ném.
- [ ] Code `contract.policy.ts`: `PURPOSE_ROLES`, `NEW_DOCUMENT_PURPOSES`, `ATTACHES_TO_PROVISIONING_TASK`, target `'PROVISIONING_TASK'`, `assertPurposeAvailable`,
      `ALLOWED_TYPES` theo purpose (giữ bảng cũ cho purpose cũ; bảng thêm `image/webp: ['webp']` cho hai purpose mới), `contentMatchesType` nhận WebP
      qua `picture-image.ts`, `mayOpen`. Nơi gọi duy nhất `document.service.ts:87` truyền `purpose`.
- [ ] `test/support/fake-object-storage.ts` `GENUINE_START['image/webp']` = `[0x52,0x49,0x46,0x46,0x24,0,0,0,0x57,0x45,0x42,0x50]`.
- [ ] Bộ kiểm nhanh + `CI=true pnpm test -- src/modules/catalog/contract`. Commit `feat(catalog): evidence purposes and WebP for provisioning
  evidence files` — `Spec: EV-01…EV-05`.

### P2b — Catalog: gắn/liệt kê/ký link file bằng chứng (EV-09, EV-10, EV-14 phía catalog) — cỡ M

**Tiêu chí:** (1) chỉ gắn file `PENDING_ATTACH` của chính người hoàn tất, đúng purpose, khóa theo `id` tăng; (2) danh sách chỉ `READY` của tác vụ;
(3) link không qua `mayOpen`, audit `DOCUMENT.LINK_ISSUED` không chứa URL.

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
- [ ] Bộ kiểm nhanh. Commit `feat(catalog): attach, list and link the evidence files of a provisioning task` — `Spec: EV-09, EV-10, EV-14 (catalog)`.

**Mốc kiểm (sau P2b):** `pnpm typecheck`, `pnpm test:gates`, `CI=true pnpm test -- src/modules/catalog` xanh; ghi số thật vào `PROGRESS.md`.

### P3a — Licensing: nền gắn file + cấp xong (EV-06…EV-12 cho `complete`) — cỡ M

**Interfaces — Consumes:** `CatalogApi.attachProvisioningEvidence`, `DocumentAttachRefusedError`, kiểu `ProvisioningEvidencePurpose` (P2b).
**Produces (P3b, P4 dùng):**

- `ProvisioningEvidenceFileInvalidError(problem)` ở `provisioning.errors.ts` → 422 `PROVISIONING_TASK.EVIDENCE_FILE_INVALID` `details { problem }`.
- Hàm thuần `assertEvidenceFileList(ids: readonly string[] | undefined): readonly string[]` (trả mảng đã sắp, `[]` khi thiếu; ném `TOO_MANY`/`DUPLICATE`),
  hằng `EVIDENCE_FILES_MAX = 3` ở `evidence-files/provisioning-evidence-files.policy.ts`.
- `ProvisioningEvidenceFilesService` (`@Injectable`, điểm vào nhóm `evidence-files/provisioning-evidence-files.service.ts`):
  `attach(tx: DbTx, actor: AuthenticatedPrincipal, taskId: string, ids: readonly string[] | undefined, purpose: ProvisioningEvidencePurpose): Promise<readonly string[]>`
  — gọi `assertEvidenceFileList`; mảng rỗng ⟹ trả `[]`, không gọi catalog; còn lại gọi `CatalogApi.attachProvisioningEvidence`, bắt
  `DocumentAttachRefusedError` ⟹ ném `ProvisioningEvidenceFileInvalidError(error.problem)`; trả mảng id đã sắp.
- `TaskWrite.after` (`provisioning-task-frame.service.ts:20`) nới thành `Record<string, AuditValue>` (`audit/public/audit.types.ts:4`).

**Tiêu chí:** (1) `complete` không gửi file chạy y như cũ (spec cũ xanh, không đổi kỳ vọng); (2) gửi file ⟹ gắn là bước đầu của `write`, trước
`markCompleted` và mọi khóa khác; (3) audit `PROVISIONING_TASK.COMPLETED` có `evidenceDocumentIds`.

- [ ] Test đỏ `provisioning-evidence-files.policy.spec.ts`: `undefined`/`[]` ⟹ `[]`; 3 id ⟹ đủ, đã sắp; 4 id ⟹ `ProvisioningEvidenceFileInvalidError`
      `problem 'TOO_MANY'`; `['a','a']` ⟹ `'DUPLICATE'`.
- [ ] Test đỏ `provisioning-evidence-files.service.spec.ts` (phần `attach`): rỗng ⟹ không gọi catalog, trả `[]`; 2 id ⟹ gọi catalog đúng `purpose`, trả đã
      sắp; catalog ném `DocumentAttachRefusedError('PURPOSE_MISMATCH')` ⟹ `ProvisioningEvidenceFileInvalidError` `problem 'PURPOSE_MISMATCH'`.
- [ ] Code policy + service + lỗi (`provisioning.errors.ts`, `provisioning.http-errors.ts` + ví dụ trong `*_ERROR_EXAMPLES`); đăng ký provider ở
      `licensing.module.ts`; nới `TaskWrite.after`.
- [ ] DTO `completeBodySchema`: `evidenceDocumentIds: z.array(z.uuid()).max(20).optional()` + `.meta({ description })` tiếng Anh (tối đa 3 file đã upload
      qua `/documents` với purpose `PROVISIONING_EVIDENCE`; không chứa mã QĐ). Khai 422 ở `complete` inline (`provisioning-tasks.controller.ts:229-241`).
- [ ] Ghi: `ProvisioningService.complete` (`tasks/provisioning.service.ts:165-190`) thêm `evidenceDocumentIds?` vào kiểu `input` (`:168`) và truyền xuống;
      `ProvisioningGrantCompletion.write` / `writeExtension` (tham số thật là `context`) có **dòng đầu** `const evidenceDocumentIds = await
  this.evidenceFiles.attach(tx, actor, context.task.id, input.evidenceDocumentIds, 'PROVISIONING_EVIDENCE')`, phần cũ y nguyên, và **trả**
      `evidenceDocumentIds` (đang `void`); `ProvisioningService.complete` đưa giá trị trả vào `after` (`:184-188`).
- [ ] Unit (**chỉ thêm ca** — `ProvisioningGrantCompletion` chưa có spec ⟹ spec mới `tasks/provisioning-grant-completion.service.spec.ts` hoặc thêm vào
      `tasks/provisioning.service.spec.ts`): không file ⟹ after có `evidenceDocumentIds: []`; 2 file ⟹ `evidenceFiles.attach` gọi **trước** `markCompleted`
      (`mock.invocationCallOrder`); `attach` ném ⟹ không gọi `markCompleted`.
- [ ] `docs/rules/database-business.md` bảng _Thứ tự khóa chuẩn_: thêm hàng `3c` `document_attachments` `FOR UPDATE` theo `id` tăng — gắn file bằng chứng
      tác vụ, sau `3a`/`3b`, trước `4`.
- [ ] Registry (file mảnh, mục 3): mã 422 của `provisioningTaskComplete`.
- [ ] Bộ kiểm nhanh + `CI=true pnpm test -- src/modules/licensing/provisioning`. Commit `feat(licensing): attach evidence files when a provisioning task is
  completed` — `Spec: EV-06…EV-12 (complete)`; `Kiểm giữ:` khung (`assertItAdmin`, khóa, `requireActingItAdmin`), `cleanEvidence`/K1 trước khung,
      `assertNotRevocationTask`, `nextStatus`, `assertKeyFits`, checklist K1, `markCompleted` — thứ tự giữa chúng không đổi.

### P3b — Licensing: thu hồi xong + cắt truy cập (EV-06…EV-12 cho hai route thu hồi) — cỡ S/M

**Interfaces — Consumes:** `ProvisioningEvidenceFilesService.attach`, `ProvisioningEvidenceFileInvalidError` (P3a).

**Tiêu chí:** (1) hai route không gửi file chạy y như cũ; (2) gắn là bước đầu của `write`, trước `lockLine`/`ending.lock`; (3) audit `REVOCATION_COMPLETED`
và `ACCESS_CUT` có `evidenceDocumentIds`; (4) callback `complete` không vượt 60 dòng tính.

- [ ] DTO `revocationCompletionBodySchema`, `accessCutBodySchema`: thêm `evidenceDocumentIds` như P3a (mô tả nêu purpose `PROVISIONING_EVIDENCE` /
      `ACCESS_CUT_EVIDENCE`). Khai 422 ở `COMPLETE_REVOCATION_ERRORS` (`revocation-tasks.controller.ts:28`) và access-cut inline (`:107-127`).
- [ ] `RevocationCompletionService.complete`: kiểu input mở rộng **tại chữ ký service** (`CompletionInput & { evidenceDocumentIds?: readonly string[] }`,
      không sửa `revocation.policy.ts`); **dòng đầu** `write` gọi `attach(..., 'PROVISIONING_EVIDENCE')`; hàm module `completedRevocationAudit`
      (`revocation-completion.service.ts:162`) nhận thêm tham số thứ 5 `evidenceDocumentIds` và đặt vào `after`. Callback đã ~52 dòng tính (trần 60) — vượt ⟹
      tách phần cũ ra hàm riêng **không đổi thứ tự**.
- [ ] `recordAccessCut` (`:116-159`): **dòng đầu** `write` gọi `attach(..., 'ACCESS_CUT_EVIDENCE')`; after của `ACCESS_CUT` thêm `evidenceDocumentIds`.
- [ ] Unit (**chỉ thêm ca** vào `revocation-completion/revocation-completion.service.spec.ts`, hoặc spec mới cạnh nó nếu > 400 dòng): không file ⟹ after có
      `[]`; có file ⟹ `attach` gọi trước `aftermath.lockLine`/`ending.lock` và `markRevocationCompleted`/`markAccessCut`; `attach` ném ⟹ không gọi
      `markRevocationCompleted`. `revocation.policy.spec.ts` (389 dòng) **không** thêm ca.
- [ ] Registry (file mảnh): mã 422 của `provisioningTaskCompleteRevocation`, `provisioningTaskRecordAccessCut`.
- [ ] Bộ kiểm nhanh + `CI=true pnpm test -- src/modules/licensing/provisioning`. Commit `feat(licensing): attach evidence files when a revocation is
  completed or access is cut` — `Spec: EV-06…EV-12 (revocation)`; `Kiểm giữ:` `assertRevocationTask`, `nextStatus`, `assertNotBefore`, `BEFORE_WORK`,
      `lockLine`, `ending.lock`, `planCompletion`/`cleanEvidence`/note `ALREADY_GONE`, `planKeyReturn`, `NOT_TERMINATING`, `AssignmentNotOpenError`,
      `planAccessCut` — thứ tự giữa chúng không đổi.

**Mốc kiểm (sau P3b):** `pnpm typecheck`, `pnpm lint`, `pnpm test:gates`, `CI=true pnpm test -- src/modules/catalog src/modules/licensing` xanh; ghi số thật
vào `PROGRESS.md` trước khi sang P4.

### P4 — Licensing: route đọc (EV-13…EV-16) — cỡ M

**Tiêu chí:** (1) Super Admin đọc mọi tác vụ; (2) IT chỉ đọc khi **đang** phụ trách (`requireActingItAdmin`), ngoài phạm vi ⟹ 404
`PROVISIONING_TASK.NOT_FOUND`; (3) tác vụ chưa xếp phòng đã hoàn tất ⟹ chỉ Super Admin (SPEC TC-4 — Owner chốt: chỉ Super Admin; thêm 1 ca unit: tác vụ chưa xếp phòng đã hoàn tất, IT từng làm ⟹ 404).

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

### P5 — Test tích hợp + HTTP + CI — cỡ M

**Tiêu chí:** 11 ca integration SPEC §8 + HTTP spec chạy thật trên CI GitHub; không test đỏ mới so với nền.

- [ ] Harness: đọc `test/support/provisioning-harness.ts` (`granted` `:249`, `complete` `:236`), `revocation-harness.ts` (`revoked` `:153`, `accessCut`
      `:158`), `document-harness.ts` (`providerOverrides` `OBJECT_STORAGE` `:23-31`, `uploaded()` `:70`), `devices-harness.ts:118` (khuôn kế thừa).
      `DocumentHarness` đã kế thừa `ProvisioningHarness` (có kho giả + upload) ⟹ ca 1–5, 7–9, 11 dùng nó. `RevocationHarness`
      (`revocation-harness.ts:64`) **không** có kho file ⟹ **bắt buộc** tạo `test/support/provisioning-evidence-harness.ts` (≤ 400 dòng) kế thừa
      `RevocationHarness`, override `start` thêm `FakeObjectStorage` qua `providerOverrides` (`provisioning-harness.ts:173-179`), mang
      `createDocument/completeDocument/putObject/uploaded` như `document-harness.ts:23-39,70` — cho ca 6. Không sửa hành vi harness cũ.
- [ ] Integration `provisioning-evidence-files.integration-spec.ts`: đủ 11 ca SPEC §8 (≤ 800 dòng; quá ⟹ tách `…-read.integration-spec.ts`). Ca 10 theo khuôn
      `test/integration/catalog/document-constraints.integration-spec.ts:142` (helper `move` của spec đó trả SQLSTATE: khẳng định `23514`/`55000`; muốn khẳng định tên constraint thì đọc `error.constraint` của `pg` — không qua Prisma,
      vì adapter Prisma 7 bỏ tên constraint). Ca 11 theo một spec
      đồng thời có sẵn (`git grep -ln "40P01" test/integration`).
- [ ] HTTP `provisioning-evidence-files.http-spec.ts` (khuôn `test/http/licensing/provisioning.http-spec.ts`): vai 2 route mới; uuid sai ⟹ 400;
      `evidenceDocumentIds: ['x']` ⟹ 400 ở 3 route; OpenAPI khai 422 `EVIDENCE_FILE_INVALID` ở 3 route, 404 `EVIDENCE_FILE_NOT_FOUND` ở route link.
- [ ] `test/http/platform/openapi-presentation.http-spec.ts`: số operation +2 (đọc số hiện tại trên nhánh).
- [ ] Sinh lại: `pnpm openapi:export && pnpm arch:routes && pnpm arch:graph && pnpm arch:docs:check`; `pnpm rules:format` cho tài liệu.
- [ ] Self-review toàn diff với SPEC (bảng EV → test → file) ghi vào `PROGRESS.md`.
- [ ] Push; `gh workflow run ci.yml --ref feat/provisioning-evidence-files`; chờ xong; phân loại **từng test đỏ** so với run nền (mục 2): đỏ cùng tên trên nền ⟹
      nợ cũ; đỏ mới ⟹ sửa (tối đa 2 vòng), rồi CI lại. Ghi run id + bảng phân loại ở `PROGRESS.md`.
- [ ] Commit `test(licensing): evidence files of provisioning tasks end to end` — `Spec: SPEC §8`.

## 6b. Gộp với đợt 4

Nhánh này và đợt 4 cùng đụng `openapi.json`, `docs/generated/*`, `openapi-presentation.http-spec.ts` (số operation) và file gộp của registry. PR nào
vào `dev` sau: `git merge origin/dev` (không rebase nhánh đã push), giữ cả hai phía ở file gộp registry, rồi `pnpm openapi:export && pnpm arch:routes &&
pnpm arch:graph`, sửa số operation = số thật. Migration `20261211…` đứng sau mọi migration đợt 4 — không đổi tên.

## 7. Xong khi

- Mọi EV-01…EV-16 có test trỏ tới (bảng trong `PROGRESS.md`).
- CI tay trên nhánh: `quality`, `http-contract`, `e2e-smoke`, `integration-inband` xanh; `integration (1..3)` không có test đỏ **mới** so với nền.
- Không test cũ nào đổi kỳ vọng (chỉ thêm ca); không file nào vượt trần; `openapi.json`/`docs/generated` khớp generator.
- Báo cáo cuối theo CODE-PROMPT mục 5. **Không** mở PR — điều phối review rồi mở.
