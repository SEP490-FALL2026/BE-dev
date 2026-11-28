# SPEC — File bằng chứng khi cấp/thu hồi (28/11/2026, bản 1.1)

- **Trạng thái:** bản 1.1 (áp review độc lập Opus 28/11: B1–B4, R1–R7, N1–N5), Owner đã chốt 4 luật Q-EV1…Q-EV4 (28/11/2026, chat điều phối). Chưa vào sổ QĐ — gom ở lượt tài liệu cuối.
- **Nền đọc code:** `origin/dev` `595cdc48` (sau #101 hóa đơn QĐ-118d, #104 hotfix worker). Mọi `file:line` tính trên sha này.
- **Nhánh code:** `feat/provisioning-evidence-files` (tách từ `dev`), PR riêng → `dev`. **Chạy song song đợt 4** — không chạm `src/modules/requests/**`.
- **Nguồn:** yêu cầu FE (28/11), quyết định Owner Q-EV1…4 (mục 2), luật hiện có `US-07-02` AC-5 (bằng chứng text bắt buộc), `QĐ-90a`, `QĐ-118` (IT phụ
  trách), `US-04-04` (file tài liệu: AC-1, AC-2, AC-10), khuôn RC-2 (`usage/vendor-account-review/out-of-process-case-closure.service.ts`).
  Chỗ tự chốt ghi **Tự chốt** + căn cứ. Luật nghiệp vụ không có ở đây ⟹ **không** tự thêm (D-n _cần Owner_).

## 1. Mục tiêu

Khi IT Admin hoàn tất một tác vụ thủ công — **cấp xong** (`POST /provisioning-tasks/{id}/complete`), **thu hồi xong**
(`POST /provisioning-tasks/{id}/revocation-completion`) hoặc **ghi nhận đã cắt truy cập** (`POST /provisioning-tasks/{id}/access-cut`) — họ đính kèm
**tối đa 3 file** (ảnh chụp trang quản trị nhà cung cấp, PDF xác nhận) bên cạnh ghi chú text. File chỉ IT Admin phụ trách tác vụ và Super Admin xem/tải.

**Thành công khi:** mọi tiêu chí EV-xx (mục 5) có test chạy thật trên CI GitHub (unit đỏ trước; integration/http xanh); không test cũ nào đổi kỳ vọng;
CI không có test đỏ mới so với run nền `dev`.

## 2. Quyết định Owner (28/11/2026)

| Mã    | Luật                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| Q-EV1 | Áp cho cả **cấp xong** (`complete`, gồm tác vụ `EXTEND`) và **thu hồi** (`revocation-completion`, `access-cut`)                 |
| Q-EV2 | Ghi chú text **giữ bắt buộc** như hiện tại (422 `PROVISIONING_TASK.EVIDENCE_REQUIRED`); file **tùy chọn**, chỉ thêm vào         |
| Q-EV3 | Tối đa **3 file mỗi lần** hoàn tất; loại **PNG, JPEG, WebP, PDF**; dung lượng theo tham số `DOCUMENT_MAX_SIZE_MB` (mặc định 10) |
| Q-EV4 | Xem/tải: **IT Admin phụ trách tác vụ** (luật QĐ-118 hiện hành) và **Super Admin**; vai khác (Finance, Manager, Employee…) không |

## 3. Thiết kế (tóm tắt)

**Dùng lại kho file của catalog** (`document_attachments`, đang phục vụ hợp đồng, hồ sơ ký, hóa đơn mua, ca ngoài quy trình RC-2) — **không** dựng bảng thứ ba.
`licensing` đã import `CatalogModule` và cạnh `licensing → catalog` hợp lệ (ADR-0019, cùng tầng T4); bảng `document_attachments` do `catalog` sở hữu
(`test/gates/architecture-boundaries.gate-spec.ts` `PRISMA_MODEL_OWNER`) ⟹ `licensing` chỉ đi qua `CatalogApi`.

Luồng FE (không đổi cách upload hiện có):

1. `POST /api/v1/documents` body `{ fileName, contentType, sizeBytes, purpose: "PROVISIONING_EVIDENCE" | "ACCESS_CUT_EVIDENCE" }` ⟹ nhận link `PUT` ký sẵn
   (120 giây).
2. FE `PUT` file thẳng lên kho (MinIO) bằng link đó.
3. `POST /api/v1/documents/{id}/complete` ⟹ server kiểm kích thước, loại, chữ ký byte đầu ⟹ file `PENDING_ATTACH`.
4. Gọi API hoàn tất kèm `evidenceDocumentIds: [id1, id2]` ⟹ trong **cùng giao dịch** với việc hoàn tất, file chuyển `READY` và gắn vào tác vụ.
   Gắn hỏng ⟹ cả lần hoàn tất bị hủy (tác vụ vẫn `IN_PROGRESS`).
5. Xem: `GET /api/v1/provisioning-tasks/{id}/evidence-files` (danh sách) và `POST /api/v1/provisioning-tasks/{id}/evidence-files/{fileId}/links` (link
   tải 5 phút).

| Mục đích (`purpose`)    | Dùng ở                                              | `stage` trả FE |
| ----------------------- | --------------------------------------------------- | -------------- |
| `PROVISIONING_EVIDENCE` | `complete` (GRANT, EXTEND), `revocation-completion` | `COMPLETION`   |
| `ACCESS_CUT_EVIDENCE`   | `access-cut`                                        | `ACCESS_CUT`   |

**Tự chốt (TC-1):** hai `purpose` thay vì một cột "giai đoạn" — một tác vụ thu hồi có hai lần nộp bằng chứng (hoàn tất, rồi cắt truy cập khi
`UNTIL_PAID_END`); `purpose` là cột có sẵn, chọn lúc khai báo, kiểm ở `assertPurposeAttachesTo` ⟹ không thêm cột. Căn cứ: khuôn `ATTACHES_TO_*` của
`contract.policy.ts:44-50`.

**Tự chốt (TC-2):** danh sách file **không** nhúng vào `GET /provisioning-tasks/{id}` mà là route riêng — (a) Super Admin hiện không đọc được
`GET /provisioning-tasks/{id}` (`@RequireRoles('IT_ADMIN')`, controller `:139-158`), mở route chi tiết cho Super Admin là đổi luật ngoài phạm vi;
(b) phạm vi đọc chi tiết (`getItAdminScope`, gồm nhánh phòng mồ côi) rộng hơn "IT phụ trách" của Q-EV4; (c) `provisioning-task-view.service.ts` đã ~403
dòng code. Điểm vào màn hình cho Super Admin (thông báo `IT_ADMIN_SELF_EXECUTED`, Audit Trail tài nguyên `ProvisioningTask`) là việc của FE.

## 4. Dữ liệu và migration

Hai migration (giá trị enum mới không dùng được trong CHECK cùng giao dịch — khuôn `20261203000000_w3_b3_enum_values`). Mốc **sau** mọi migration đợt 4
(đợt 4 dùng `20261210000000…20261210000200`):

- **M1** `20261211000000_provisioning_evidence_enum_values`: `ALTER TYPE "DocumentPurpose" ADD VALUE IF NOT EXISTS 'PROVISIONING_EVIDENCE'`,
  `… 'ACCESS_CUT_EVIDENCE'`. (Kiểm tên type thật trong migration `20261020250000_catalog_contracts_and_documents`.)
- **M2** `20261211000100_provisioning_evidence_documents`:
  - Cột `document_attachments.provisioning_task_id uuid NULL` (không FK — cùng kiểu `purchase_invoice_id`, `out_of_process_case_id`), index
    `document_attachments_provisioning_task_id_idx`.
  - `DROP` + `ADD` lại `document_attachments_owner_state`: thêm `provisioning_task_id` vào `num_nonnulls(...) <= 1` và vào vế "READY ⇔ có chủ".
    Chép nguyên văn định nghĩa hiện hành ở `20261113004560_rc2_out_of_process_cases/migration.sql:65-73` rồi chỉ thêm cột mới.
  - `DROP` + `ADD` lại `document_attachments_purpose_fits_owner`: chép định nghĩa hiện hành, thêm vế `provisioning_task_id IS NULL OR purpose IN
('PROVISIONING_EVIDENCE','ACCESS_CUT_EVIDENCE')`. (Các vế theo từng cột cũ đã loại purpose mới khỏi chủ cũ — không cần vế ngược.)
  - Trigger `document_attachment_guard` **không đổi**, M2 **không** `CREATE OR REPLACE` guard. Guard hiện hành
    (`20261022130000_document_final_key_and_expiry/migration.sql:22-52`) đã chặn mọi `UPDATE` trên hàng `READY`/`QUARANTINED`/`EXPIRED` (`55000`,
    `document_attachments_one_way`) và cho phép `PENDING_ATTACH → READY` ⟹ cột chủ mới tự được đặt một lần, không đổi sau đó.
- Prisma `prisma/models/catalog.prisma`: enum `DocumentPurpose` thêm 2 giá trị; model `DocumentAttachment` thêm
  `provisioningTaskId String? @map("provisioning_task_id") @db.Uuid` + `@@index([provisioningTaskId])`.
- **Không** đổi `merged-migrations.txt`; không sửa migration đã commit.

## 5. Hành vi đúng (EV-xx)

### Khai báo và upload (catalog)

- **EV-01** `PURPOSE_ROLES`: `PROVISIONING_EVIDENCE: ['IT_ADMIN']`, `ACCESS_CUT_EVIDENCE: ['IT_ADMIN']`. Finance khai báo ⟹ 403
  `DOCUMENT.PURPOSE_FORBIDDEN` (mã hiện có). Thêm cả hai vào `NEW_DOCUMENT_PURPOSES` (DTO `POST /documents` nhận). Ca cũ
  `contract.policy.spec.ts:69-75` khẳng định nguyên danh sách `NEW_DOCUMENT_PURPOSES` ⟹ **được phép** sửa kỳ vọng đó (thêm đúng 2 giá trị) — ngoại lệ duy
  nhất của luật "không đổi kỳ vọng test cũ" cùng với số operation ở `openapi-presentation.http-spec.ts`.
- **EV-02** `assertPurposeAvailable` cho qua hai `purpose` mới (đã có chỗ gắn).
- **EV-03** Loại file **theo mục đích**: hai `purpose` mới nhận `application/pdf` (`pdf`), `image/png` (`png`), `image/jpeg` (`jpg`, `jpeg`), `image/webp`
  (`webp`). Mọi `purpose` cũ **giữ nguyên** PDF/PNG/JPEG — khai báo WebP cho `CONTRACT_ATTACHMENT` vẫn 422 `DOCUMENT.TYPE_NOT_ALLOWED`. Dung lượng: luật
  hiện có (`DOCUMENT_MAX_SIZE_MB`). `assertFileAllowed` nhận `purpose` **tùy chọn** (thiếu ⟹ bảng loại cũ) để spec cũ `:129-165` biên dịch nguyên vẹn;
  nơi gọi duy nhất `document.service.ts:87` truyền `purpose`. (`budgets` có `assertFileAllowed` riêng — không chạm.)
- **EV-04** Chữ ký byte WebP: `RIFF` ở byte 0–3 **và** `WEBP` ở byte 8–11; byte 4–7 tùy ý. **Dùng lại** nhận diện WebP có sẵn ở
  `src/infrastructure/object-storage/picture-image.ts:27` (không tự viết bảng byte thứ hai); `SIGNATURE_PREFIX_BYTES` ≥ 12. File khai WebP mà byte đầu không
  khớp ⟹ `QUARANTINED` (luật AC-10 hiện có).
- **EV-05** Mở file qua route chung: `mayOpen` **không bao giờ** trả `OPEN` cho file `READY` có `purpose` mới ⟹ IT Admin/Finance gọi `GET /documents/{id}`,
  `POST /documents/{id}/links` nhận 404 `DOCUMENT.NOT_FOUND` (vai khác vẫn 403 như cũ — guard route). `PENDING_ATTACH` vẫn mở cho người upload (xem lại
  trước khi nộp) — giữ luật cũ.

### Gắn khi hoàn tất (licensing → catalog)

- **EV-06** Body ba route nhận thêm `evidenceDocumentIds?: string[]` (uuid, tùy chọn; DTO giới hạn thô `max(20)` chỉ để chặn body lớn). Không gửi hoặc `[]`
  ⟹ hành vi **y như hiện tại**.
- **EV-07** File **không** thêm và **không** bớt luật kiểm ghi chú text nào: `EVIDENCE_REQUIRED` vẫn ở đúng chỗ luật cũ đòi (`cleanEvidence`), kể cả các
  ngoại lệ cũ — K1 có checklist (`provisioning.service.ts:170`, ghi chú ngoài được rỗng) và thu hồi `ALREADY_GONE` có note (`revocation.policy.ts:191`).
  Có file mà ghi chú rỗng ở chỗ luật cũ đòi ⟹ 422 `PROVISIONING_TASK.EVIDENCE_REQUIRED`.
- **EV-08** Kiểm danh sách (trước mọi ghi): > 3 id ⟹ 422 `PROVISIONING_TASK.EVIDENCE_FILE_INVALID` `details { problem: "TOO_MANY" }`; id trùng ⟹ cùng mã
  `problem: "DUPLICATE"`. Khuôn: `out-of-process-case-closure.service.ts:106,169`.
- **EV-09** Gắn trong **cùng giao dịch** với việc hoàn tất, **sau** mọi kiểm quyền/trạng thái của khung (`ProvisioningTaskFrame.work`: khóa tác vụ tầng
  3a/3b, IT phụ trách, `check`) và **ngay đầu** callback `write` (sau kiểm danh sách EV-08), **trước** mọi khóa khác của bước ghi (gói, kỳ, dòng, lô, khóa
  license, assignment). Thứ tự khóa: `provisioning_tasks` (3a/3b) → `document_attachments` (theo `id` tăng) → tầng 4 trở xuống; thêm hàng `3c
document_attachments — gắn file bằng chứng tác vụ` vào bảng _Thứ tự khóa chuẩn_ (`docs/rules/database-business.md`). Catalog khóa từng file theo thứ tự id, kiểm: tồn tại và **người
  upload = người hoàn tất** (khác ⟹ `NOT_FOUND`), `purpose` khớp route (`PROVISIONING_EVIDENCE` cho `complete`/`revocation-completion`,
  `ACCESS_CUT_EVIDENCE` cho `access-cut`; khác ⟹ `PURPOSE_MISMATCH`), trạng thái `PENDING_ATTACH` (`READY` ⟹ `ALREADY_ATTACHED`; khác ⟹
  `NOT_READY_TO_ATTACH`). Từ chối ⟹ 422 `PROVISIONING_TASK.EVIDENCE_FILE_INVALID` `details { problem }`; **cả giao dịch hủy** — tác vụ giữ trạng thái cũ,
  không file nào được gắn, không audit hoàn tất.
- **EV-10** Gắn thành công: mỗi file `READY`, `provisioning_task_id = id tác vụ`, `attached_at = now`; catalog ghi audit `DOCUMENT.ATTACHED` mỗi file
  (after `{ status: "READY", provisioningTaskId }`). Audit hoàn tất của tác vụ (`PROVISIONING_TASK.COMPLETED`, `PROVISIONING_TASK.REVOCATION_COMPLETED`,
  `PROVISIONING_TASK.ACCESS_CUT`) thêm trường `evidenceDocumentIds` (mảng id đã sắp; `[]` khi không có) vào ảnh **after**. Kiểu `TaskWrite.after`
  (`provisioning-task-frame.service.ts:20`, hiện `Record<string, string | number | boolean | null>`) nới thành `Record<string, AuditValue>`
  (`audit/public/audit.types.ts:4`; `licensingAuditEvent` đã nhận `AuditValue`). Audit `COMPLETED` dựng ở `ProvisioningService.complete`
  (`tasks/provisioning.service.ts:184-190`) ⟹ `ProvisioningGrantCompletion.write`/`writeExtension` **trả** mảng id đã gắn cho nơi dựng audit.
- **EV-11** Tác vụ `EXTEND` (`writeExtension`) cũng gắn như `complete` GRANT. Tác vụ thu hồi `ALREADY_GONE` (ghi chú thay bằng chứng) vẫn được gửi file.
- **EV-12** Thứ tự lỗi: lỗi khung (403/404/409 hiện có) **thắng** lỗi file; lỗi file (EV-08, EV-09) đứng **trước** các lỗi riêng của bước ghi (khóa K4,
  checklist K1, `NOT_BEFORE`…) — chỉ xảy ra khi request gửi file hỏng, request không gửi file giữ nguyên thứ tự cũ. Test khẳng định: lỗi khung thắng lỗi
  file; gắn hỏng thì không có gì được ghi; một ca đồng thời (2 connection có barrier, luật `database-business.md` "Mọi luồng mới cần một integration test
  đồng thời"): hai IT hoàn tất **hai tác vụ khác nhau** cùng gửi **một** `documentId` ⟹ đúng một thành công, một 422 `ALREADY_ATTACHED` hoặc `NOT_FOUND`,
  không `40P01`.

### Xem và tải (licensing, route mới)

- **EV-13** `GET /api/v1/provisioning-tasks/{id}/evidence-files` — `@RequireRoles('IT_ADMIN', 'SUPER_ADMIN')`, operationId
  `provisioningTaskEvidenceFileList`. Trả `{ items: EvidenceFile[] }` (danh sách có chặn, ≤ 6, **không** phân trang), sắp `attachedAt` tăng rồi `id`:
  `{ id, stage: "COMPLETION" | "ACCESS_CUT", fileName, contentType, sizeBytes, attachedAt }`. Chỉ file `READY` của tác vụ. Không có file ⟹ `items: []`.
- **EV-14** `POST /api/v1/provisioning-tasks/{id}/evidence-files/{fileId}/links` — cùng vai, operationId `provisioningTaskEvidenceFileLink`,
  `Cache-Control: no-store`. Trả `{ url, expiresAt }`, link 300 giây (`LINK_TTL_SECONDS`), `Content-Disposition: attachment` (adapter hiện có). Ghi audit
  `DOCUMENT.LINK_ISSUED` (chỉ `expiresAt`, **không** ghi URL — luật hiện có). File không thuộc tác vụ / không `READY` / không phải `purpose` mới ⟹ 404
  `PROVISIONING_TASK.EVIDENCE_FILE_NOT_FOUND`.
- **EV-15** Quyền đọc (cả hai route), không khóa hàng:
  - Tác vụ không có trong tổ chức ⟹ 404 `PROVISIONING_TASK.NOT_FOUND`.
  - **Super Admin**: mọi tác vụ của tổ chức.
  - **IT Admin**: phải là **IT đang phụ trách** tác vụ theo đúng luật ghi — gọi `ProvisioningTaskFrame.requireActingItAdmin(undefined, actor,
{ beneficiaryEmployeeId: task.assignment.employeeId, taskId })` (frame `:134-175`; người phụ trách phòng, người làm thay đang hiệu lực, hoặc người được
    chỉ định cho việc chưa xếp phòng). Hàm ném `ProvisioningNotInChargeError` **hoặc** `EmployeeNotStartedError` ⟹ đổi thành 404
    `PROVISIONING_TASK.NOT_FOUND` (không lộ tồn tại — cùng cách `ProvisioningService.get` ẩn tác vụ ngoài phạm vi).
  - **Tự chốt (TC-3):** IT đã hoàn tất nhưng nay không còn phụ trách thì **không** xem được nữa — đúng chữ Q-EV4 "IT phụ trách" và luật "người phụ trách
    hiện tại" của QĐ-118d (nộp lại hóa đơn).
  - **Tự chốt (TC-4) — cần Owner xác nhận:** tác vụ của người **chưa xếp phòng** — hoàn tất xong thì chỉ định IT cho việc đó chấm dứt
    (`provisioning-task-frame.service.ts:95-101`) ⟹ sau khi hoàn tất **chỉ Super Admin** xem được file của tác vụ đó. Giữ đúng luật quyền hiện có, không mở
    thêm ngoại lệ; Owner muốn khác ⟹ sửa ở vòng sau.
- **EV-16** Kho file sập ⟹ 503 (map chung hiện có `service-unavailable.ts`); không cần code riêng.

## 6. Kiến trúc và vị trí file

| Phần                                | Vị trí                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Luật purpose/loại/chữ ký/`mayOpen`  | `src/modules/catalog/contract/contract.policy.ts` (+ spec)                                                                                                                                                                                                                                                                |
| Gắn/liệt kê/ký link file bằng chứng | **file mới** `src/modules/catalog/contract/provisioning-evidence-document.service.ts` (+ spec) — `document.service.ts` đã 498 dòng, không thêm vào                                                                                                                                                                        |
| SQL                                 | `src/modules/catalog/contract/document.repo.ts` (144 dòng): `markAttachedToProvisioningTask`, `listReadyOfProvisioningTask`                                                                                                                                                                                               |
| Cửa công khai                       | `src/modules/catalog/public/catalog.api.ts`: `attachProvisioningEvidence`, `listProvisioningEvidence`, `issueProvisioningEvidenceLink`                                                                                                                                                                                    |
| Body + mã lỗi ghi                   | `licensing/provisioning/provisioning.dto.ts`, `provisioning.errors.ts`, `provisioning.http-errors.ts`, `provisioning-task-frame.service.ts` (kiểu `after`); gọi gắn ở `tasks/provisioning-grant-completion.service.ts`, `tasks/provisioning.service.ts` (audit), `revocation-completion/revocation-completion.service.ts` |
| Route đọc + gắn                     | **thư mục mới** `src/modules/licensing/provisioning/evidence-files/` (thư mục `provisioning/` đã 25/25 file): điểm vào `provisioning-evidence-files.service.ts` (gắn + đọc) và `.policy.ts` (kiểm danh sách thuần), `provisioning-evidence-files.controller.ts`, `provisioning-evidence-files.dto.ts` + spec              |
| Đăng ký                             | `licensing.module.ts` (controller + provider), README `licensing` và `catalog` (thẻ capability), registry test (PLAN mục 3)                                                                                                                                                                                               |

Ràng buộc: ADR-0019 (chỉ `catalog/public/*`), trần 500 dòng code/file, 60 dòng/hàm, 25 file/thư mục, spec cạnh file, spec unit ≤ 400 dòng
(`revocation.policy.spec.ts` đã 389 — **không** thêm ca vào đó, dùng spec mới). `revocation-completion.service.ts` hàm `complete` ~52 dòng được tính
(trần 60) ⟹ gắn file đúng **một** dòng gọi trả mảng id, không phình callback. Tên file trong thư mục nhóm theo `module-structure.md:58-63`: file điểm vào
`provisioning-evidence-files.service.ts` / `.policy.ts`; `tasks/` và `revocation-completion/` chỉ import file điểm vào.

## 7. API thay đổi (cho FE — API description sau PR)

| Route                                                         | Thay đổi                                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /documents`                                             | `purpose` thêm `PROVISIONING_EVIDENCE`, `ACCESS_CUT_EVIDENCE` (chỉ IT Admin); hai purpose này nhận thêm `image/webp` |
| `POST /provisioning-tasks/{id}/complete`                      | body thêm `evidenceDocumentIds?`; lỗi mới 422 `PROVISIONING_TASK.EVIDENCE_FILE_INVALID`                              |
| `POST /provisioning-tasks/{id}/revocation-completion`         | như trên                                                                                                             |
| `POST /provisioning-tasks/{id}/access-cut`                    | như trên (purpose `ACCESS_CUT_EVIDENCE`)                                                                             |
| `GET /provisioning-tasks/{id}/evidence-files`                 | **mới** — IT phụ trách, Super Admin                                                                                  |
| `POST /provisioning-tasks/{id}/evidence-files/{fileId}/links` | **mới** — 404 `PROVISIONING_TASK.EVIDENCE_FILE_NOT_FOUND`                                                            |

`EVIDENCE_FILE_INVALID.details.problem` ∈ `TOO_MANY | DUPLICATE | NOT_FOUND | ALREADY_ATTACHED | NOT_READY_TO_ATTACH | PURPOSE_MISMATCH`. Mô tả OpenAPI
không chứa mã `QĐ-`/`US-`/`Q-EV` (luật `OPENAPI-EXAMPLE.1`). Số operation: +2.

## 8. Test bắt buộc

Unit (đỏ trước): `contract.policy.spec.ts` (EV-01…05), `provisioning-evidence-document.service.spec.ts` (EV-09/10 phía catalog: khóa theo thứ tự id,
uploader khác, purpose sai, `READY`, audit), `provisioning-evidence-files` policy/service spec (EV-13…15: Super Admin, IT phụ trách, IT không phụ trách ⟹ 404,
`EmployeeNotStarted` ⟹ 404, file không thuộc tác vụ ⟹ 404), spec kiểm danh sách EV-08.

Integration (`test/integration/licensing/provisioning-evidence-files.integration-spec.ts`, DB thật + `FakeObjectStorage`):

1. Cấp K2 xong kèm 2 file (PNG + WebP) ⟹ 200; hai file `READY`, `provisioning_task_id` đúng; audit `PROVISIONING_TASK.COMPLETED` có `evidenceDocumentIds`.
2. Cấp K2 có file mà `evidence: ""` (không checklist K1) ⟹ 422 `PROVISIONING_TASK.EVIDENCE_REQUIRED`; tác vụ vẫn `IN_PROGRESS`; file vẫn `PENDING_ATTACH`.
3. 4 id ⟹ 422 `EVIDENCE_FILE_INVALID` `TOO_MANY`; id trùng ⟹ `DUPLICATE`.
4. File do IT khác upload ⟹ `NOT_FOUND`; file `CONTRACT_ATTACHMENT` ⟹ `PURPOSE_MISMATCH`; file `ACCESS_CUT_EVIDENCE` ở `complete` ⟹ `PURPOSE_MISMATCH`;
   file đã gắn tác vụ khác ⟹ `ALREADY_ATTACHED`; file chưa upload ⟹ `NOT_READY_TO_ATTACH`. Mỗi ca: tác vụ giữ trạng thái, không audit hoàn tất (rollback).
5. IT không phụ trách gọi `complete` có file ⟹ 403 `PROVISIONING.NOT_IN_CHARGE` (lỗi khung thắng).
6. Thu hồi K2 `UNTIL_PAID_END` kèm 1 PDF, rồi `access-cut` kèm 1 ảnh `ACCESS_CUT_EVIDENCE` ⟹ danh sách trả 2 file, `stage` `COMPLETION` rồi `ACCESS_CUT`.
7. `GET …/evidence-files`: IT phụ trách 200; Super Admin 200; IT khác 404 `PROVISIONING_TASK.NOT_FOUND`; Finance 403. Link: 200 `{url, expiresAt}`,
   `Cache-Control: no-store`, audit `DOCUMENT.LINK_ISSUED`; `fileId` của tác vụ khác ⟹ 404 `EVIDENCE_FILE_NOT_FOUND`.
8. `POST /documents/{id}/links` trên file bằng chứng `READY` (IT phụ trách, Finance) ⟹ 404 `DOCUMENT.NOT_FOUND`.
9. Khai báo WebP: purpose `PROVISIONING_EVIDENCE` ⟹ 201; `CONTRACT_ATTACHMENT` ⟹ 422 `DOCUMENT.TYPE_NOT_ALLOWED`. Finance khai `PROVISIONING_EVIDENCE` ⟹
   403 `DOCUMENT.PURPOSE_FORBIDDEN`.
10. DB (SQL trực tiếp, khuôn `test/integration/catalog/document-constraints.integration-spec.ts:142`): `UPDATE` một hàng `CONTRACT_ATTACHMENT` đang
    `PENDING_ATTACH` thành `status='READY', attached_at=now(), provisioning_task_id=$x` ⟹ `23514` **tên** `document_attachments_purpose_fits_owner`; hàng
    `PROVISIONING_EVIDENCE` `PENDING_ATTACH` đặt cả `contract_id` và `provisioning_task_id` khi chuyển `READY` ⟹ `23514` `document_attachments_owner_state`;
    đổi `provisioning_task_id` của hàng đã `READY` ⟹ `55000` (`document_attachments_one_way`, guard hiện có).
11. Đồng thời (EV-12): hai IT phụ trách hai phòng, mỗi người một tác vụ `IN_PROGRESS`; cùng một `documentId` (người upload là IT thứ nhất); 2 connection có
    barrier gọi `complete` ⟹ đúng một 200, một 422 `EVIDENCE_FILE_INVALID` (`problem` `NOT_FOUND` hoặc `ALREADY_ATTACHED`), không `40P01`; file gắn đúng
    một tác vụ. Khuôn barrier: `git grep -ln "40P01" test/integration` lấy một spec đồng thời có sẵn.

HTTP (`test/http/licensing/provisioning-evidence-files.http-spec.ts`, không DB): vai của hai route mới (Employee/Manager/Finance 403), validate `fileId`
không phải uuid ⟹ 400, body `evidenceDocumentIds` không phải mảng uuid ⟹ 400, OpenAPI khai đủ mã + ví dụ.

Mọi test lỗi khẳng định **mã lỗi**, không chỉ status. Không đổi kỳ vọng test cũ; test cũ chỉ được thêm ca.

## 9. Ngoài phạm vi / nợ đã biết

- File `PENDING_ATTACH` không ai gắn sẽ nằm lại (luật dọn hiện có chỉ hết hạn `AWAITING_UPLOAD` sau 24 giờ) — nợ chung của kho tài liệu, không sửa ở đây.
- Không xóa/thay file đã gắn (bằng chứng là bất biến — guard DB).
- Không có trên mobile (QĐ-61b: mobile không tải tệp).
- Seed demo: không bắt buộc; thêm sau ở đợt 8 nếu cần.
