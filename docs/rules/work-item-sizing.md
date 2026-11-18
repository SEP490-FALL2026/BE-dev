# Kích thước hạng mục theo User Story

Áp dụng khi chia việc được giao (một hoặc hai nhóm G, một H-slice, một bó finding hay một yêu cầu trực tiếp) thành hạng
mục, khi lập spec/plan mới và khi review một spec. Đây là nguồn chuẩn của quy tắc chia hạng mục; [quy trình
chung](../workspace/README.md), [CONTRIBUTING](../../CONTRIBUTING.md) và mẫu [spec](../workspace/_template/spec.md)/
[plan](../workspace/_template/plan.md) chỉ dẫn về đây. Nguồn: finding `PLAN-01`, `PLAN-02` của hạng mục
[gov1-gate2-story-sizing-and-capability-contracts](../workspace/items/gov1-gate2-story-sizing-and-capability-contracts/spec.md).

## Quy tắc

1. **G là container giao việc/roadmap, không bao giờ tự động là ranh giới spec/plan.** Một dev có thể được giao một hoặc
   hai nhóm G, nhưng phải phân rã Story của chúng trước khi tạo hạng mục. Câu "cùng G3" không phải lý do gom.
2. **Một hạng mục = một business outcome gắn kết, kiểm chứng được độc lập.** Các primary Story của nó cùng capability sở
   hữu, cùng hoặc tương thích ranh giới transaction/dữ liệu, chung một bề mặt API/sự kiện mạch lạc và một đường kiểm
   chứng có nghĩa.
3. **Được gom Story nhỏ** khi **đủ cả năm** điều kiện: cùng actor/outcome và capability; chạm cùng hoặc gắn chặt một ranh
   giới dữ liệu/transaction; implement, review và rollback được cùng nhau; test matrix gộp vẫn dễ hiểu; từng Story/AC
   vẫn truy vết riêng được.
4. **Một Story phức tạp có thể cần một hoặc nhiều hạng mục.** Tách khi nó đi qua capability kiểm thử độc lập được,
   ranh giới transaction, migration, wire contract, job bất đồng bộ hoặc ranh giới bảo mật, hoặc khi gộp lại làm một
   phiên implement/review không an toàn. Mỗi hạng mục `partial` ghi **đúng AC** nó sở hữu và **tên hạng mục**
   (sibling hoặc deferred) sở hữu từng AC còn lại.
5. **Không tách chỉ theo tầng kỹ thuật.** "Hạng mục controller", "hạng mục service", "hạng mục repo" cho cùng một hành vi
   là sai, trừ khi đó là technical enabler có giá trị độc lập và chuỗi phụ thuộc ghi rõ.
6. **Không AC mồ côi, không hai chủ.** Trước khi tạo hạng mục đầu tiên của một nhóm G được giao, người phụ trách ghi
   [scope map](#scope-map-của-nhóm-g) của nhóm đó trong [roadmap](../roadmap.md): mỗi Story/AC đang dùng của phạm vi ánh
   xạ tới **đúng một** trong `full`, `partial`, `deferred` hoặc `not affected`. Mọi hạng mục được nêu làm chủ phải đã có
   spec/plan khung và đăng ký ở items index — không có "hạng mục tương lai" giấu AC. Bảng `Primary Story/AC` của từng spec
   vẫn dùng đúng `full`/`partial`/`n/a`; `deferred` và `not affected` chỉ xuất hiện trong scope map.
7. **Size exception là bằng chứng, không phải lối tắt.** Nó ghi vì sao outcome gộp là gắn kết, vì sao tách sẽ tạo coupling
   giả hoặc test trùng, ranh giới phase/checkpoint, phạm vi tối đa và người chấp nhận. Một câu như "cùng transaction"
   đứng một mình không đủ.
8. **Technical enabler dùng primary `n/a` chỉ khi không hiện thực AC nghiệp vụ nào.** Nó nêu tên hạng mục phía sau mà nó
   gỡ chặn và không được claim coverage Story.

## Bốn chế độ sizing

Mỗi spec mới có mục `## Sizing decision` với các trường `- Container:`, `- Mode:`, `- Outcome and owner:`,
`- Boundaries:`, `- Not larger:`, `- Not smaller:`, `- Siblings:`, `- Scope map:` ([mẫu](../workspace/_template/spec.md)).

| `Mode`              | Khi nào                                                                                      | Bảng `Primary Story/AC`                                                       | `Siblings`                                       |
| ------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| `single-story`      | Một Story (đủ hoặc một phần) là một outcome                                                  | Đúng một Story ở dòng `full`/`partial`                                        | `none`, hoặc hạng mục của phần còn lại           |
| `grouped-stories`   | Nhiều Story nhỏ thỏa đủ năm điều kiện của quy tắc 3                                          | Từ hai Story; trên ba cần `## Size exception` đủ trường                       | `none` hoặc hạng mục liên quan                   |
| `split-story`       | Một Story phức tạp chia thành nhiều outcome kiểm chứng độc lập (quy tắc 4)                   | Ít nhất một dòng `partial`, cột cuối nêu hạng mục sở hữu AC còn lại           | **Bắt buộc** nêu sibling/deferred bằng tên       |
| `technical-enabler` | Không hiện thực AC nghiệp vụ nào (gate, refactor giữ hành vi, hạ tầng kiểm chứng, hardening) | Chỉ dòng `n/a`, cột Story là `—`; cột cuối nêu hạng mục phía sau được gỡ chặn | Hạng mục liên quan hoặc `none` nếu đã nêu ở bảng |

Quy ước của bảng `Primary Story/AC`:

- `full`: đúng một Story và **dải AC chính xác** (`AC-1→AC-3`, `AC-4, AC-6`); cột cuối `—` vì không còn AC nào.
- `partial`: đúng một Story, đúng AC sở hữu ở đây; cột cuối **không** rỗng, nêu hạng mục sở hữu phần còn lại bằng tên
  `` `ten-hang-muc` `` hoặc link tới spec của nó. Trong một nhóm G, hạng mục đó phải đã có spec/plan khung và đứng trong
  scope map (checker đối chiếu); chỉ downstream của một enabler ngoài G mới được là tên dự kiến.
- `n/a`: chỉ cho `technical-enabler`; cột Story `—`, cột AC là mã TE/finding, cột cuối nêu hạng mục phía sau.

Tên hạng mục là tên thư mục trong `docs/workspace/items/` (chữ thường, nối bằng gạch ngang). Tên nhóm (`G6`) không phải
hạng mục.

## Ví dụ

**Gom hợp lệ.** Danh mục chức vụ: các nhóm AC thêm (`US-02-07` AC-1→AC-3), sửa tên (AC-4, AC-5) và ngừng/dùng lại
(AC-6→AC-8) cùng actor IT Admin, capability `organization/job-title`, bảng `job_titles`, chính sách HTTP chỉ `IT_ADMIN`
và một test matrix. Hôm nay chúng là AC của một Story nên hạng mục thật là `single-story`. Nếu ba nhóm đó là ba Story
nhỏ riêng (mã `US-JT-A`…`US-JT-C` dưới đây chỉ là minh họa), một spec/plan `grouped-stories` vẫn đúng:

```md
- Mode: `grouped-stories`
- Outcome and owner: IT Admin duy trì danh mục chức vụ; capability organization/job-title.
- Boundaries: mỗi lệnh ghi một transaction trên job_titles; /job-titles; không sự kiện; chỉ IT_ADMIN.

| Story               | AC         | Coverage | Phần còn lại thuộc |
| ------------------- | ---------- | -------- | ------------------ |
| US-JT-A (thêm)      | AC-1→AC-3  | full     | —                  |
| US-JT-B (sửa tên)   | AC-1, AC-2 | full     | —                  |
| US-JT-C (ngừng/bật) | AC-1→AC-3  | full     | —                  |
```

**Tách hợp lệ một Story phức tạp.** `US-02-01` (import sáu bước): xem trước/kiểm dòng và xác nhận ghi idempotent là hai
outcome, hai ranh giới transaction và hai test matrix. Hạng mục xem trước ghi:

```md
- Mode: `split-story`
- Siblings: `g2-import-confirm` (xác nhận, hủy, file trùng, ghi một lần); `g7-usage-import` (AC-5 múi giờ của usage).

| Story    | AC               | Coverage | Phần còn lại thuộc                                                  |
| -------- | ---------------- | -------- | ------------------------------------------------------------------- |
| US-02-01 | AC-1, AC-6, AC-7 | partial  | AC-2→AC-4, AC-8→AC-10: `g2-import-confirm`; AC-5: `g7-usage-import` |
```

Hạng mục `g2-import-confirm` ghi điều ngược lại và phụ thuộc hạng mục xem trước; không AC nào thiếu chủ hay có hai chủ.

**Gom sai.** Mọi Story của G3 trong một hạng mục chỉ vì cùng nhãn G3 (`Cohesion: toàn bộ G3 vì cùng một G`). Phải phân
rã G3 theo quy tắc 6 rồi tạo nhiều hạng mục. `pnpm rules:check` từ chối lý do dựa trên nhóm G.

**Tách sai.** Ba spec `...-controller`, `...-service`, `...-repo` cho một endpoint nguyên tử không có kết quả kiểm thử độc
lập: gộp thành một hạng mục `single-story`.

**Technical enabler.** Gate capability contract của GOV.1/GATE.2 không hiện thực AC nào:

```md
- Mode: `technical-enabler`

| Story | AC       | Coverage | Phần còn lại thuộc                                 |
| ----- | -------- | -------- | -------------------------------------------------- |
| —     | GATE2-01 | n/a      | gỡ chặn thiết kế G3, ví dụ `g3-catalog-foundation` |
```

## Scope map của nhóm G

Một nhóm G được giao có **đúng một** khối trong [roadmap](../roadmap.md), đặt dưới mục của nhóm, với heading cố định
(anchor `work-item-decomposition-g3`). Không lập artefact phân rã nào khác.

```md
### Work-item decomposition: G3

- Nguồn: Docs `9416fe0` (US v0.15), BE `bdc9fe8`.
- Active: 2 Story, 9 AC.

| Story    | AC        | Disposition  | Owner              | Remaining owner     | Reason                         | Order |
| -------- | --------- | ------------ | ------------------ | ------------------- | ------------------------------ | ----- |
| US-04-01 | AC-1→AC-4 | full         | `g3-catalog-entry` | —                   | —                              | 1     |
| US-04-01 | AC-5      | partial      | `g3-catalog-entry` | `g3-catalog-retire` | —                              | 1     |
| US-04-01 | AC-6      | deferred     | —                  | `g3-catalog-retire` | chờ trạng thái Assignment G4   | 2     |
| US-04-02 | AC-1→AC-2 | not affected | —                  | —                   | đã giao ở `g2-...` trước GOV.1 | —     |
```

- Hai dòng đầu: pin Docs và BE `<sha>` của nguồn đã dùng; `Active: <n> Story, <m> AC.` là số Story/AC đang dùng của
  nhóm theo nguồn đó — phải bằng số Story khác nhau và số khóa AC của bảng.
- Cột đúng thứ tự: `Story | AC | Disposition | Owner | Remaining owner | Reason | Order`. Mỗi dòng một Story và tập AC
  chính xác (`AC-1→AC-4`, `AC-5, AC-7`); mỗi khóa `Story + AC` xuất hiện **một** lần trên mọi scope map.
- `full`: một `Owner`, không `Remaining owner`. `partial` (AC chia theo vế giữa hai hạng mục): một `Owner` và ít nhất một
  `Remaining owner` khác. `deferred`: không `Owner`, đúng một đích ở `Remaining owner`, `Reason` bắt buộc.
  `not affected`: không chủ, `Reason` bắt buộc. `Order` ghi thứ tự/phụ thuộc khi có, nếu không thì `—`.
- Mọi tên trong `Owner`/`Remaining owner` là thư mục hạng mục (`` `ten-hang-muc` ``) có `spec.md`, `plan.md` và đăng ký ở
  items index. Spec của mỗi chủ (`full`, `partial`) phải claim đúng khóa đó; claim `full` một Story khi map chia Story đó
  cho hạng mục khác, hoặc claim `partial` khi map giao trọn Story cho chính nó, là mâu thuẫn.

Phía hạng mục: `- Container:` nêu nhóm G; `- Scope map:` có **một link mỗi nhóm** tới heading chuẩn, ví dụ
`[G3](../../../roadmap.md#work-item-decomposition-g3)`. Mọi khóa Story/AC trong `Primary Story/AC` phải có trong map với
hạng mục này là chủ. Hạng mục có Story phải nêu G; chỉ `technical-enabler` ngoài nhóm G dùng `- Scope map: n/a` (kèm
hạng mục phía sau ở bảng). Không lập scope map thật trong lát quy tắc này — map của G3 lập ở lượt lập kế hoạch G3 theo
nguồn Docs có thẩm quyền.

## Size exception

Bắt buộc khi trên ba primary Story; khi có mục này thì cả năm trường phải có nội dung thật (không `—`, `none`, `TBD`):

- `- Cohesion:` vì sao outcome gộp là một và gắn kết;
- `- Why not split:` coupling giả hoặc test trùng nếu tách;
- `- Checkpoints:` ranh giới phase/checkpoint trong plan;
- `- Maximum scope:` phạm vi tối đa, gồm thứ **không** được thêm vào;
- `- Accepted by:` người chấp nhận ngoại lệ và ngày.

## Plan của hạng mục lớn đã được chấp nhận

Mỗi task vẫn có `Files`, `Depends on`, `Acceptance`, `Verify`. Hạng mục có Size exception hoặc nhiều phase ghi rõ ranh
giới phase và checkpoint (gate chạy sau mỗi phase) trong plan. Không có quy tắc cứng kiểu "mỗi task tối đa năm file":
file sinh tự động, file chỉ di chuyển và refactor giữ hành vi được đánh giá theo bằng chứng (diff, test giữ nguyên, đồ
thị phụ thuộc), không theo số đếm.

## Phạm vi kiểm tra tự động

`pnpm rules:check` (`checkWorkItems` trong [check-rules.mjs](../../scripts/check-rules.mjs)) từ chối hạng mục mới khi:
thiếu `## Sizing decision` hoặc trường của nó; `Mode` lạ; số Story không khớp `Mode`; dòng `full` thiếu AC chính xác
hoặc còn phần chưa làm; dòng `partial` không nêu hạng mục của phần còn lại; `n/a` ngoài `technical-enabler` hoặc
enabler claim Story/không nêu hạng mục phía sau; trên ba Story không có Size exception đủ năm trường; và lập luận
sizing dựa trên nhóm G.

Với scope map (`workItems.roadmap` của config), checker từ chối thêm: hạng mục nêu G mà thiếu link `Scope map` hoặc link
sai heading/nhóm; nhóm chưa có map; disposition lạ; một khóa Story/AC có hai dòng; `full` không đúng một chủ; `partial`
thiếu chủ hoặc chủ phần còn lại; `deferred` không có đích tồn tại hay lý do; `not affected` có chủ hoặc không lý do; chủ
không phải hạng mục đăng ký có spec/plan; khóa trong spec không có trong map với hạng mục đó là chủ; dòng map mà spec của
chủ không claim; claim `full`/`partial` mâu thuẫn với map; thiếu pin, thiếu `Active` hoặc số đếm không khớp bảng; Story
nằm ngoài G với `Scope map: n/a`.

Hạng mục có trước GOV.1 nằm trong `sizingGrandfathered` của [rules-check.config.json](../../rules-check.config.json): chỉ
miễn phần sizing và scope map, vẫn chịu mọi kiểm tra mẫu khác; danh sách chỉ co lại (một test ghim tập ban đầu, mục không
còn thư mục hoặc đã có `## Sizing decision` bị báo lỗi).

Checker **không** chứng minh outcome thật sự gắn kết, AC đúng nghiệp vụ, hay scope map **đủ** so với Docs: nó không đọc
generator User Stories. Pin Docs/BE và số đếm khai báo là để người review so với nguồn có thẩm quyền; checker chỉ bảo đảm
bảng khớp chính số đếm đó và khớp các spec.
