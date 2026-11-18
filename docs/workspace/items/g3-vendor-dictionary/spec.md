# Spec: từ điển nhà cung cấp dùng chung (`US-04-07`)

- Phụ trách: AI theo giao việc Owner (triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46 `FR-6.2`, `FR-6.5`, `ADR-05`; `US-04-07` AC-1 → AC-5 trong `BE-UserStory/src/EP-04.md`; `QĐ-38`, `QĐ-39e`), BE `57b1e1c`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

IT Admin duy trì từ điển nhà cung cấp gồm nhóm nhà cung cấp và các dòng dịch vụ tính tiền; hệ thống gợi ý dòng khi khai báo ứng
dụng mà không tự chọn, chuẩn hóa tên miền và mô tả giao dịch về đúng dòng, và cho IT Admin xử lý đề xuất bổ sung từ khai báo ứng
dụng ngoài từ điển.

## Sizing decision

- Container: G3 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: IT Admin duy trì từ điển và hệ thống nhận diện được nhà cung cấp từ tên, tên miền, mô tả giao dịch; chủ là capability `catalog/vendor-dictionary`.
- Boundaries: bảng dùng chung `vendor_groups`, `vendor_service_lines` và bảng đề xuất `vendor_dictionary_proposals` của `catalog`; route `/vendor-dictionary/*` chỉ IT Admin; hàm nhận diện thuần; một giao dịch mỗi lệnh ghi cùng Audit Trail.
- Not larger: gắn dòng cho ứng dụng (AC-6) cần ứng dụng nên thuộc `g3-catalog-entry`; sinh đề xuất khi khai báo ứng dụng ngoài từ điển (`US-04-01` AC-5) cũng ở đó.
- Not smaller: nhóm, dòng, nhận diện và xử lý đề xuất chung một bảng và một quyền IT Admin; nhận diện không kiểm chứng được nếu thiếu dữ liệu từ điển.
- Siblings: `g3-catalog-entry`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC        | Coverage | Phần còn lại thuộc       |
| -------- | --------- | -------- | ------------------------ |
| US-04-07 | AC-1→AC-5 | partial  | AC-6: `g3-catalog-entry` |

## Supporting references

`FR-6.2`, `FR-6.5` (tên miền phụ, nhà bán lại), `ADR-05` (từ điển tách khỏi danh mục của tổ chức), `QĐ-38` (một mục là một dòng
dịch vụ tính tiền riêng), `QĐ-39e` (một dòng chỉ quy về một ứng dụng), `WF-17a`, [ADR-0013](../../../decisions/0013-catalog-finance-licensing-contexts.md).

## Explicit out of scope

- Gắn dòng cho ứng dụng và ràng buộc _một dòng một ứng dụng_ (AC-6) — `g3-catalog-entry`.
- Tạo đề xuất khi khai báo ứng dụng ngoài từ điển (`US-04-01` AC-5) — `g3-catalog-entry`; lát này chỉ cho xem và xử lý đề xuất đã có.
- Khớp mờ và quyết định hợp thức hóa (`US-13-01`, G9); gợi ý bằng AI (đã loại).
- Xóa nhóm hoặc dòng: không có thao tác xóa (dòng sẽ được ứng dụng và khoản chi tham chiếu).

## Dependencies and blockers

Nền `g3-catalog-foundation` (đã xong). Facade `AuditService` (Audit Trail) và `OrganizationService` (tổ chức của đề xuất). Không blocker.

## Ownership: module, data, API

- Module `catalog` (C1) xuất hiện ở lát này: `catalog.module.ts` (gồm controller; không đồ thị nào ngoài API cần nó nên không tách module HTTP — điều kiện Nest submodule chưa phát sinh, sẽ xét lại khi `licensing` import `catalog`), capability `vendor-dictionary/` (controller, service, repo, DTO, lỗi, type, hàm nhận diện `vendor-matcher.ts`) và `mappers/` (ánh xạ lỗi HTTP, audit).
- Dữ liệu: `vendor_groups`, `vendor_service_lines`, `vendor_dictionary_proposals` (model `VendorGroup`, `VendorServiceLine`, `VendorDictionaryProposal` trong `prisma/models/catalog.prisma`; chủ `catalog` ở `PRISMA_MODEL_OWNER`).
- API (đều `IT_ADMIN`): `GET/POST /vendor-dictionary/groups`, `PATCH /vendor-dictionary/groups/{id}`, `POST /vendor-dictionary/groups/{id}/service-lines`, `PATCH /vendor-dictionary/service-lines/{id}`, `GET /vendor-dictionary/suggestions`, `POST /vendor-dictionary/normalizations`, `GET /vendor-dictionary/proposals`, `POST /vendor-dictionary/proposals/{id}/resolutions`.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                   | Kết luận                                                                                                                                                                                                                                                                                          | Nguồn / loại                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Từ điển có thuộc tổ chức không        | Không: nhóm và dòng là dữ liệu dùng chung, không có cột tổ chức (Story). Đề xuất bổ sung có cột tổ chức vì sinh từ khai báo của một tổ chức                                                                                                                                                       | `US-04-07` Dữ liệu nghiệp vụ            |
| Nhận diện theo tên                    | Theo bậc, bậc đầu có kết quả thắng: dòng tên đúng như gõ → nhóm tên đúng như gõ (mọi dòng của nhóm) → tên chứa chuỗi gõ → chuỗi gõ chứa tên (từ 3 ký tự). So sánh không phân biệt hoa/thường, dấu, khoảng trắng thừa; chuỗi gõ dưới 2 ký tự không gợi ý. Không bao giờ tự chọn (AC-5)             | AC-1, AC-5; lựa chọn của người thiết kế |
| Nhận diện theo tên miền               | Lấy host từ tên miền hoặc URL (bỏ scheme, thông tin đăng nhập, cổng, đường dẫn, `www.`); khớp tên miền của dòng khi host bằng hoặc là tên miền phụ (`app.figma.com` ⟹ `figma.com`, `notfigma.com` không khớp); không dòng nào giữ thì dùng tên miền thương hiệu của nhóm và đưa mọi dòng của nhóm | AC-2, `FR-6.5`                          |
| Nhận diện theo mẫu mô tả giao dịch    | Mẫu là chuỗi **nguyên văn** (không biểu thức chính quy: tránh ReDoS và hiểu nhầm `*`); so không phân biệt hoa/thường và khoảng trắng; mẫu dài nhất thắng, bằng nhau thì giữ tất cả                                                                                                                | AC-3; lựa chọn của người thiết kế       |
| Trùng tên miền hoặc mẫu giữa hai dòng | Cho phép; nhận diện trả cả hai ứng viên và không tự chọn (nhìn thấy được thay vì chặn). Tên nhóm là duy nhất toàn từ điển; tên dòng duy nhất trong nhóm                                                                                                                                           | lựa chọn của người thiết kế             |
| Giới hạn                              | Tối đa 20 tên miền và 20 mẫu mỗi nhóm/dòng; tên 1–200 ký tự sau chuẩn hóa; mẫu 3–100 ký tự; tên miền phải là host hợp lệ                                                                                                                                                                          | lựa chọn của người thiết kế             |
| Xử lý đề xuất                         | `ACCEPTED` kèm dòng đã tồn tại (IT Admin tạo dòng bằng route thường) hoặc `DISMISSED`; chỉ đề xuất đang chờ xử lý được; hai lần xử lý đồng thời thì một lần thắng                                                                                                                                 | luồng thay thế của `US-04-07`           |

## Behavior and design

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-D1 | Khóa so sánh `normalized_name` = `searchKey(name)` (NFD bỏ dấu, chữ thường, gộp khoảng trắng); tên hiển thị là `normalizeDisplayName(name)`. Unique CSDL: `vendor_groups(normalized_name)`, `vendor_service_lines(group_id, normalized_name)`; trùng ⟹ 409 (không check-then-insert)      |
| T-D2 | Hàm nhận diện (`searchKey`, `normalizeHost`, `matchDomain`, `matchDescription`, `matchName`) là TypeScript thuần trong `vendor-matcher.ts`; nạp toàn bộ dòng một lần mỗi lần gọi (từ điển cỡ vài chục đến vài trăm dòng), so khớp trong bộ nhớ                                            |
| T-D3 | Mọi lệnh ghi mở một giao dịch `TransactionRunner.run` ghi bản ghi và Audit Trail cùng giao dịch; sửa không đổi gì (sau chuẩn hóa) ⟹ 200, không audit                                                                                                                                      |
| T-D4 | Đề xuất: ràng buộc CSDL `status = PENDING ⇔ resolved_at IS NULL` và `status = ACCEPTED ⇔ resolved_line_id IS NOT NULL`; một đề xuất đang chờ cho mỗi (tổ chức, tên chuẩn hóa) bằng chỉ mục duy nhất có điều kiện. Xử lý đồng thời: khóa dòng đề xuất `FOR UPDATE` rồi kiểm lại trạng thái |
| T-D5 | Lỗi phân trang: danh sách nhóm đọc page/count cùng snapshot (`RepeatableRead`), thứ tự `normalized_name, id`                                                                                                                                                                              |

### HTTP contract

Lỗi chung: 401 `AUTHENTICATION_REQUIRED`/`INVALID_ACCESS_TOKEN`, 403 `AUTHORIZATION.FORBIDDEN`, 422 `VALIDATION_ERROR`, 503
`SERVICE_UNAVAILABLE`/`TOKEN_VERIFICATION_UNAVAILABLE`. Trên dây: `Group = { id, name, brandDomains[], serviceLines: Line[], createdAt, updatedAt }`,
`Line = { id, name, domains[], patterns[], createdAt, updatedAt }`, `Candidate = { serviceLineId, serviceLineName, groupId, groupName }`.

| Operation (operationId)                                                                                           | Thành công                                                                                                                                             | Lỗi riêng                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /vendor-dictionary/groups` (`vendorGroupList`) — `search?`, `page`, `pageSize`                               | 200 `VENDOR_DICTIONARY.GROUPS_LISTED` `{ items: Group[], pagination }`                                                                                 | —                                                                                                                                                                            |
| `POST /vendor-dictionary/groups` (`vendorGroupCreate`) — `{ name, brandDomains? }`                                | 201 `VENDOR_DICTIONARY.GROUP_CREATED`                                                                                                                  | 409 `VENDOR_DICTIONARY.GROUP_NAME_TAKEN`; 422 `VENDOR_DICTIONARY.NAME_INVALID`, `VENDOR_DICTIONARY.DOMAIN_INVALID`, `VENDOR_DICTIONARY.TOO_MANY_VALUES`                      |
| `PATCH /vendor-dictionary/groups/{id}` (`vendorGroupUpdate`) — `{ name?, brandDomains? }`                         | 200 `VENDOR_DICTIONARY.GROUP_UPDATED`                                                                                                                  | 404 `VENDOR_DICTIONARY.GROUP_NOT_FOUND`; 409 như trên; 422 như trên và `VENDOR_DICTIONARY.UPDATE_EMPTY`                                                                      |
| `POST /vendor-dictionary/groups/{id}/service-lines` (`vendorServiceLineCreate`) — `{ name, domains?, patterns? }` | 201 `VENDOR_DICTIONARY.SERVICE_LINE_CREATED`                                                                                                           | 404 `GROUP_NOT_FOUND`; 409 `VENDOR_DICTIONARY.SERVICE_LINE_NAME_TAKEN`; 422 `NAME_INVALID`, `DOMAIN_INVALID`, `VENDOR_DICTIONARY.PATTERN_INVALID`, `TOO_MANY_VALUES`         |
| `PATCH /vendor-dictionary/service-lines/{id}` (`vendorServiceLineUpdate`)                                         | 200 `VENDOR_DICTIONARY.SERVICE_LINE_UPDATED`                                                                                                           | 404 `VENDOR_DICTIONARY.SERVICE_LINE_NOT_FOUND`; 409, 422 như trên                                                                                                            |
| `GET /vendor-dictionary/suggestions` (`vendorSuggestionList`) — `name`                                            | 200 `VENDOR_DICTIONARY.SUGGESTED` `{ candidates: Candidate[] }` — không tự chọn                                                                        | —                                                                                                                                                                            |
| `POST /vendor-dictionary/normalizations` (`vendorNormalize`) — `{ kind: 'DOMAIN'\|'DESCRIPTION', value }`         | 200 `VENDOR_DICTIONARY.NORMALIZED` `{ method: 'DOMAIN'\|'PATTERN'\|null, candidates: Candidate[] }` (1 ⟹ khớp duy nhất; nhiều ⟹ mơ hồ; 0 ⟹ không khớp) | —                                                                                                                                                                            |
| `GET /vendor-dictionary/proposals` (`vendorProposalList`) — `status?`, `page`, `pageSize`                         | 200 `VENDOR_DICTIONARY.PROPOSALS_LISTED`                                                                                                               | —                                                                                                                                                                            |
| `POST /vendor-dictionary/proposals/{id}/resolutions` (`vendorProposalResolve`) — `{ outcome, serviceLineId? }`    | 200 `VENDOR_DICTIONARY.PROPOSAL_RESOLVED`                                                                                                              | 404 `VENDOR_DICTIONARY.PROPOSAL_NOT_FOUND`, `SERVICE_LINE_NOT_FOUND`; 409 `VENDOR_DICTIONARY.PROPOSAL_ALREADY_RESOLVED`; 422 `VENDOR_DICTIONARY.PROPOSAL_RESOLUTION_INVALID` |

Không có `DELETE` (router trả 404 `HTTP_NOT_FOUND`).

### Dữ liệu và migration

Migration `20261020110000_catalog_vendor_dictionary`: enum `VendorProposalStatus`, ba bảng, CHECK kích thước mảng và nhất quán đề xuất, unique tên, chỉ
mục duy nhất có điều kiện cho đề xuất đang chờ, khóa ngoại. Không đụng bảng hiện có. Rollback: không code cũ nào dùng các bảng này; gỡ bằng migration mới.

### Audit và bảo mật

Audit cùng giao dịch: `VENDOR_GROUP.CREATED/UPDATED`, `VENDOR_SERVICE_LINE.CREATED/UPDATED`, `VENDOR_PROPOSAL.RESOLVED` (giá trị trước/sau của trường nghiệp vụ),
tác nhân `USER` kèm vai. Chỉ IT Admin gọi được mọi route; Finance, trưởng phòng, Employee, Super Admin bị từ chối (AC-4, `SoD-1`). Từ điển không chứa dữ liệu cá nhân.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                                                                                                             | Cấp test                        | Bằng chứng sau implement                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| AC-1        | Từ điển có nhóm Figma, dòng Figma (`figma.com`): gõ "figma"/" FIGMA " → gợi ý dòng Figma của nhóm Figma; "Fígma" có dấu cũng khớp                                               | unit matcher + integration HTTP | matcher 28 + `vendor-dictionary-http` (AC-1)                |
| AC-2        | `www.figma.com`, `https://app.figma.com/files?x=1`, `WWW.FIGMA.COM:443` → Figma, method `DOMAIN`; `notfigma.com` không khớp                                                     | unit + integration              | matcher + `vendor-dictionary-http` (2 test)                 |
| AC-3        | `PAYPAL*CANVA 123` (mẫu `PAYPAL*CANVA`) → Canva, method `PATTERN`; không phân biệt hoa/thường; `*` và `.` là ký tự thường, không phải biểu thức chính quy                       | unit + integration              | matcher + `vendor-dictionary-http`                          |
| AC-4        | Employee, Finance, Super Admin, Manager gọi mọi route → 403, từ điển không đổi; IT Admin gọi được                                                                               | e2e + integration               | e2e 6 vai × 9 route + integration Finance/Employee          |
| AC-5        | Nhóm Microsoft có hai dòng Microsoft 365 và Azure: gõ "Microsoft" → hai ứng viên, không chọn; gõ "azure" → chỉ Azure                                                            | unit + integration              | matcher + `vendor-dictionary-http`                          |
| Ghi dữ liệu | Tạo nhóm/dòng, chuẩn hóa tên miền (chữ thường, bỏ trùng), audit trước/sau; tên nhóm trùng (kể cả khác hoa/thường/dấu) → 409; tên dòng trùng trong cùng nhóm 409, khác nhóm được | integration                     | `vendor-dictionary-http`, `-constraints`                    |
| Giới hạn    | Tên rỗng/quá dài → 422; tên miền không hợp lệ → 422; 21 tên miền hoặc 21 mẫu → 422; mẫu dưới 3 ký tự → 422; sửa rỗng → 422                                                      | e2e + integration               | validation spec 14 + e2e 19 + http                          |
| Đồng thời   | Hai yêu cầu tạo cùng tên nhóm đồng thời → đúng một 201, một 409; hai lần xử lý cùng đề xuất đồng thời → đúng một thắng                                                          | integration                     | http (2 test; đột biến bỏ khóa dòng/ánh xạ unique làm 4 đỏ) |
| Đề xuất     | Liệt kê theo trạng thái; xử lý `ACCEPTED` với dòng có thật, `DISMISSED`; xử lý lần hai → 409; `ACCEPTED` thiếu dòng hoặc `DISMISSED` kèm dòng → 422; dòng không tồn tại → 404   | integration                     | http (3 test)                                               |
| Hợp đồng    | `api-inventory`: chín operation mới có summary ngắn, 401/403/422/503, message riêng; manifest cập nhật; không route xóa                                                         | e2e                             | e2e `api-inventory` 72 operation                            |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm (AC-1→AC-5; AC-6 ở `g3-catalog-entry`).
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi nên e2e + `pnpm openapi:export`.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract mới đã báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; `PRISMA_MODEL_OWNER` thêm đúng ba model của `catalog`.
- [x] ARCHITECTURE và AGENTS cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: thiết kế `ready`. Quyết định cần Owner xác nhận khi review: thứ tự bậc nhận diện theo tên; mẫu là chuỗi nguyên văn (không biểu thức chính quy);
cho phép trùng tên miền/mẫu giữa hai dòng (trả nhiều ứng viên); không có xóa nhóm/dòng. Đã `verified` local (xem [plan](plan.md#verification-and-handoff)); chưa review, chưa nghiệm thu.
