# Đề xuất đồng bộ nguồn: yêu cầu dịch EN–VI

- Trạng thái: **đề xuất, chưa áp dụng.** Nhóm Owner/Docs ghi các thay đổi này vào nguồn chính thức theo quy trình của Docs; ai áp dụng thì người đó ghi vào sổ. Trợ lý AI chỉ soạn, không sửa repo Docs.
- **Stale — trùng số — chờ thẩm quyền (18/10/2026):** mã đề xuất "`QĐ-74`" và `QĐ-74a`–`i` trong hạng mục này là đề xuất cũ, **chưa** từng vào sổ quyết định. Sổ Docs nay dùng `QĐ-74` cho phương pháp thu thập usage (16/10/2026). Đọc mọi chỗ ghi `QĐ-74` ở đây là _đề xuất dịch EN↔VI chưa có số_; không cấp số mới, không coi là Accepted; evidence giữ nguyên. **E-2 = B, Owner 18/10/2026:** giữ `draft`, không giao implement, không cấp số mới trong repo BE; hạng mục bị chặn implement tới khi một quyết định Docs có thẩm quyền cấp số hợp lệ và giải quyết quan hệ với `QĐ-69`/`QĐ-78`. Research và evidence giữ nguyên ([remediation](../baseline-impact-and-remediation-2026-10-17/spec.md)).
- Lý do không áp dụng ngay: các file đích (sổ quyết định, BRD, `BE-UserStory/src/*`) đang có thay đổi chưa commit của phiên khác, và hash của chúng đã đổi ngay trong ngày 14/10/2026.
- Trước khi áp dụng: kiểm lại hash, anchor và số quyết định còn trống.
- Phạm vi: chỉ những thay đổi tối thiểu cho yêu cầu dịch. Không đổi workflow G5, không ghi xác nhận GVHD hay dev approval.
- [Spec](spec.md) · [Research](research.md).

## Trạng thái nguồn lúc soạn

Docs HEAD lúc soạn là `0e0bb83`, working tree có khoảng 100 mục thay đổi chưa commit. Hash là `git hash-object` trên working tree lúc 14/10/2026.

**Kiểm lại 15/10/2026:**

- Docs HEAD `3341ea0`; working tree sạch, không thấy writer nào đang sửa.
- Cả 6 file đích có hash **trùng** bảng dưới, nghĩa là nội dung đã soạn chính là bản đã commit ở `3341ea0`.
- Anchor `FR-3.19` (dòng 550) và dòng mục 11 (dòng 1750) còn đúng.
- Sổ quyết định cao nhất vẫn là `QĐ-73`; `QĐ-74` chưa tồn tại. BRD chỉ nhắc nó như "số tiếp theo".
- ⟹ Bản vá **còn mới (fresh)** so với `3341ea0`. Vẫn **chưa áp dụng** vì cần Owner xác nhận nội dung P1 trước (mục _Thứ tự áp dụng_).

| File (từ gốc Docs)                                                                  | Blob hiện tại                              | Working tree |
| ----------------------------------------------------------------------------------- | ------------------------------------------ | ------------ |
| Decisions/project-decisions.md                                                      | `fbb142febc551c347ae53d11d42f212ad47448cb` | đã sửa       |
| Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md | `13d61cf6fca1c0b5b343e509b5d100b4162c7987` | đã sửa       |
| BE-UserStory/src/EP-05.md                                                           | `55d39c41c27509e55e1982fcb9736d21d1b66bb5` | đã sửa       |
| BE-UserStory/src/99-tail.md                                                         | `5233ecc3e66b156fcc3a3f219b186d163a6e64ea` | đã sửa       |
| BE-UserStory/src/00-head.md                                                         | `569517f723ff2224cb3079a6a034abd5fce8c799` | đã sửa       |
| ERD/logical/LOGICAL-ERD-S0.md                                                       | `149a20d9967abf245965a129b335562a01c5a0ef` | không đổi    |

Cùng ngày, sổ quyết định và BRD đã đổi hash giữa hai lần đọc: `84c4822f…` → `fbb142fe…` và `1afaca33…` → `13d61cf6…`.

**Phân biệt ba mức:**

- **Nguồn đã ghi:** những gì đang có trong file.
- **Nguồn đã pin:** snapshot `S-2026-10-12b` = Docs `0e0bb83`.
- **Đề xuất:** toàn bộ nội dung dưới đây.

BRD working tree đang ở v3.39, nhưng bảng mục 11 của BRD vẫn ghi v3.38. Đây là độ trễ có sẵn trong nguồn, không do đề xuất này gây ra.

## Số quyết định

- `QĐ-71` đã dùng cho việc bỏ có chủ ý đặc tả `AI_BACKEND_MODEL_SPEC.md`. `QĐ-72` là Owner thông báo GVHD đã duyệt. Số cao nhất đang dùng là `QĐ-73` (`QĐ-73a`, `QĐ-73b`).
- Số còn trống lúc soạn là **`QĐ-74`**; BRD mục 11 cũng ghi "số tiếp theo `QĐ-74`". Đề xuất này **không** giữ chỗ số đó. Nếu phiên khác dùng trước, đổi sang số trống kế tiếp.
- `QĐ-72d(2)` loại các quyết định sau 14/10 khỏi phạm vi GVHD đã duyệt, nên quyết định dịch chỉ là quyết định của Owner.

## Quyết định Owner cần ghi (provenance)

| #   | Nội dung                                                                                                                                                | Lượt                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Thêm yêu cầu dịch                                                                                                                                       | Prompt phiên thiết kế 14/10/2026                      |
| 2   | Dịch cục bộ, không gửi provider ngoài                                                                                                                   | Như trên                                              |
| 3   | Không lưu bản dịch vào DB                                                                                                                               | Như trên                                              |
| 4   | Theo yêu cầu, từng trường, đích theo `Accept-Language`                                                                                                  | Như trên                                              |
| 5   | Trần cứng sử dụng                                                                                                                                       | Như trên                                              |
| 6   | Bản dịch tham khảo + bảo vệ thuật ngữ                                                                                                                   | Như trên                                              |
| 7   | Lưu mã ngôn ngữ gốc                                                                                                                                     | Như trên                                              |
| 8   | Thiếu header hoặc không có ngôn ngữ hỗ trợ ⟹ `vi`, không 406                                                                                            | Lượt kiểm lại review 14/10/2026                       |
| 9   | Không dịch được ⟹ trả bản gốc; nguồn null/rỗng/khoảng trắng giữ nguyên giá trị                                                                          | Như trên                                              |
| 10  | Dịch máy cục bộ **không** là _tính năng AI_ theo BRD 6.4 / `QĐ-69a`                                                                                     | Prompt phiên khép spec 14/10/2026 (câu hỏi phương án) |
| 11  | `vi;q=0` mà `en` còn chấp nhận ⟹ `en`; từ chối cả hai (`vi;q=0, en;q=0`, `*;q=0`) ⟹ `vi`                                                                | Như trên                                              |
| 12  | Người viết khai sai ngôn ngữ trên bản ghi không sửa được ⟹ người đọc chọn lại nguồn khi xem bản dịch (`source=vi\|en`); không sửa bản ghi, không lưu gì | Như trên                                              |

Tất cả là quyết định của Owner qua prompt phiên, chưa phải xác nhận của GVHD hay dev review.

## P1 — Sổ quyết định

- File `Decisions/project-decisions.md`. Thêm sau dòng bắt đầu `| **\`QĐ-73b\`** | **Hồ sơ Employee của Finance ở bước đầu`.
- Cập nhật bộ đếm ở dòng 4 và ô `**\`QĐ-01\` → \`QĐ-73\`**`(dòng 14) thành`QĐ-74`.

```markdown
---

## `QĐ-74` — Owner thêm yêu cầu bản dịch máy tham khảo EN ↔ VI cho nội dung tự do được chọn

> **Bối cảnh:** 14/10/2026, trong các prompt phiên thiết kế BE (gói `dynamic-content-translation`), Owner yêu cầu người đọc xem được bản dịch tham khảo của nội dung tự do do người khác viết bằng ngôn ngữ còn lại. **Quyết định của Owner qua prompt phiên 14/10/2026, chưa phải xác nhận của GVHD** (sau `QĐ-72`, không thuộc phạm vi `QĐ-72`).

| Mã           | Quyết định                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`QĐ-74a`** | **Thêm yêu cầu:** người có quyền đọc hồ sơ xem được bản dịch máy tham khảo giữa tiếng Việt và tiếng Anh của các trường tự do trong **danh sách cho phép**. Đợt đầu gắn lát G5: lý do nghiệp vụ và lý do ngoài bộ chuẩn của Request (`US-05-02`, `FR-3.2`, `FR-3.18`), lý do duyệt/từ chối bước nhu cầu (`US-05-04`). Trường khác chỉ thêm bằng quyết định mới. Không dịch tên riêng, mã, số tiền, ngày, dữ liệu danh mục, Audit Trail, thông báo/email, đầu ra AI. |
| **`QĐ-74b`** | **Dịch chạy cục bộ** trong hệ thống; không gửi nội dung tới nhà cung cấp dịch bên ngoài. Dùng nhà cung cấp ngoài cần quyết định mới.                                                                                                                                                                                                                                                                                                                               |
| **`QĐ-74c`** | **Không lưu bản dịch** vào cơ sở dữ liệu; chỉ lưu **mã ngôn ngữ gốc** của từng trường, do người viết khai báo (giao diện chỉ chọn sẵn).                                                                                                                                                                                                                                                                                                                            |
| **`QĐ-74d`** | **Theo yêu cầu, từng trường;** ngôn ngữ đích theo ngôn ngữ người đọc yêu cầu. Không xác định được, hoặc không có ngôn ngữ hỗ trợ ⟹ **tiếng Việt**; người đọc từ chối tiếng Việt nhưng chấp nhận tiếng Anh ⟹ tiếng Anh; từ chối cả hai ⟹ tiếng Việt. Không trả lỗi cho các trường hợp này.                                                                                                                                                                          |
| **`QĐ-74e`** | **Không dịch được ⟹ trả nguyên văn bản gốc.** Nguồn trống ⟹ giữ đúng giá trị đó, không chạy mô hình. Duyệt, từ chối và mọi bước khác không phụ thuộc tính năng dịch.                                                                                                                                                                                                                                                                                               |
| **`QĐ-74f`** | **Trần cứng sử dụng:** giới hạn độ dài, số tiến trình dịch, hàng đợi, thời gian, tần suất; con số chốt ở thiết kế kỹ thuật BE. Không phát sinh chi phí theo ký tự.                                                                                                                                                                                                                                                                                                 |
| **`QĐ-74g`** | **Bản dịch tham khảo + bảo vệ thuật ngữ:** bản gốc luôn hiển thị và là căn cứ; bản dịch gắn nhãn _bản dịch máy_, không là căn cứ quyết định; tên người, số, ngày, email, tên phần mềm giữ nguyên. Chỉ bật sau cổng chất lượng do dev + Owner chốt.                                                                                                                                                                                                                 |
| **`QĐ-74h`** | **Không phải tính năng AI theo BRD 6.4 / `QĐ-69a`:** dịch máy cục bộ là tiện ích hiển thị, không sinh nội dung mới, không ra quyết định; không tính vào hai tính năng AI và không chịu ràng buộc _làm sau phân hệ lõi_.                                                                                                                                                                                                                                            |
| **`QĐ-74i`** | **Khai sai ngôn ngữ gốc:** bản ghi không sửa (`QĐ-53a`, `FR-11.2`); người đọc chọn lại ngôn ngữ nguồn khi xem bản dịch. Không lưu gì, mã khai báo giữ nguyên.                                                                                                                                                                                                                                                                                                      |

**Còn mở, không suy:** điều kiện license của mô hình OPUS-MT khi doanh nghiệp dùng thương mại (thẻ mô hình ghi apache-2.0; dữ liệu huấn luyện Tatoeba-Challenge ghi CC-BY-NC-SA 4.0) — Owner/pháp lý; giá trị `mul` (nội dung hai ngôn ngữ). Chi tiết contract (trạng thái, mã lý do, giới hạn header) là thiết kế kỹ thuật BE.

**Tài liệu đổi:** sổ này · BRD v3.40 (`FR-3.20`, ghi chú 6.4, 7.7.2 dòng 5, 7.7.5, lịch sử phiên bản, mục 11) · User Stories (`US-05-02` AC-11, `US-05-04` AC-11/AC-12; đầu/đuôi, số AC) · Logical ERD (ghi chú mục 14 dòng C4) · roadmap BE. **Không đổi:** Conceptual ERD, source BE/FE/Mobile, cơ sở dữ liệu. **Chưa đánh giá:** Use Case/UF (thao tác _xem bản dịch_).
```

## P2 — BRD: `FR-3.20`, phiên bản, mục 11

File BRD (blob `13d61cf6…`). Chọn `FR-3.20` ở mục 5.3 vì cả ba trường đợt đầu là lý do của yêu cầu/bước duyệt, và dòng 5 của bảng 7.7.2 dẫn `FR-3.x`. Phương án khác là `FR-8.12` (xuyên suốt) hoặc `FR-11.3` (trường biểu mẫu).

Thêm ngay sau đoạn bắt đầu `- **FR-3.19:** **Cổng mức kiểm soát cho phần mềm mới**` (dòng 550 lúc soạn), trước dòng trống và `**Các tình huống ngoại lệ phải xử lý**`:

```markdown
- **FR-3.20:** **Bản dịch tham khảo cho nội dung tự do** (`QĐ-74`). Người có quyền đọc một hồ sơ yêu cầu xem được, theo yêu cầu từng trường, bản dịch máy giữa tiếng Việt và tiếng Anh của các trường tự do trong danh sách cho phép — đợt đầu: lý do nghiệp vụ và lý do ngoài bộ chuẩn (`FR-3.2`, `FR-3.18`), lý do duyệt/từ chối bước nhu cầu (`FR-3.7`). (1) Mỗi trường lưu **mã ngôn ngữ gốc** do người viết khai báo; **không** lưu bản dịch. (2) Ngôn ngữ đích theo ngôn ngữ người đọc yêu cầu; không xác định được ⟹ tiếng Việt. (3) Bản gốc luôn hiển thị và là căn cứ; bản dịch gắn nhãn _bản dịch máy_, không là căn cứ quyết định; tên người, số, ngày, email, tên phần mềm giữ nguyên. (4) Không dịch được ⟹ hiển thị bản gốc; duyệt, từ chối và mọi bước khác **không** phụ thuộc tính năng dịch. (5) Dịch chạy trong hệ thống, không gửi nội dung ra ngoài; người xem bản dịch đúng bằng người được đọc hồ sơ (7.7.2 dòng 5). Không phải tính năng AI theo 6.4 (`QĐ-74h`).
```

Cùng file:

- `**Phiên bản:** 3.39 — 14/10/2026` → `3.40`.
- Thêm một dòng sau dòng `| **3.39** |`: `| **3.40** | **14/10/2026** | **Owner thêm yêu cầu bản dịch tham khảo (\`QĐ-74\`):** \`FR-3.20\` mới; ghi chú 6.4, 7.7.2 dòng 5 và 7.7.5. Không đổi mục khác | \`QĐ-74\` |`.
- Mục 11: dòng _Sổ quyết định dự án_ (dòng 1750 lúc soạn) đổi `QĐ-01` → `QĐ-73` thành `QĐ-74`. Dòng BRD trong cùng bảng đang ghi v3.38 (đã trễ) đổi thành v3.40.
- Mục 6.4: thêm sau câu "…**và không có tính năng AI thứ ba**…" ghi chú: `Bản dịch tham khảo FR-3.20 chạy mô hình dịch cục bộ nhưng không phải tính năng AI theo mục này (\`QĐ-74h\`).`
- Tùy chọn: thêm dòng ở Phụ lục C.1 vì đây là phần thêm ngoài đề tài đã đăng ký.

## P3 — BRD 7.7.2 dòng 5

Anchor: dòng bắt đầu `| 5 | Yêu cầu, lý do, bước duyệt, người quyết | Cơ bản | Thấp |`. Ô cuối `` `FR-3.x`, `QĐ-53a` `` thành:

```markdown
`FR-3.x`, `QĐ-53a`; bản dịch tham khảo (`FR-3.20`, `QĐ-74`) chỉ sinh khi đọc, không lưu, cùng người xem; nội dung tự do có thể vô tình chứa dữ liệu ngoài dòng này — dịch không đổi phân loại
```

## P4 — BRD 7.7.5 dòng cuối

Anchor: dòng bắt đầu `| Đánh giá tác động chuyển dữ liệu xuyên biên giới |`. Thêm vào cuối ô ghi chú:

```markdown
Bản dịch tham khảo (`FR-3.20`) chạy mô hình trong hệ thống, không gửi nội dung tới nhà cung cấp dịch nên không làm phát sinh nghĩa vụ này; dùng nhà cung cấp dịch bên ngoài cần quyết định mới (`QĐ-74b`).
```

## P5 — User Stories G5

- Sửa ở `BE-UserStory/src/EP-05.md`. `epics/*.md` và `user-stories-and-epics.md` là file sinh, không sửa tay.
- Sau khi sửa: `python -I -B BE-UserStory/tools/build_us.py --write` rồi `--check`.
- Số AC dự kiến 1.408 → 1.411; cập nhật đầu/đuôi theo công cụ.
- Lưu ý đính chính trong gói dịch cũ: cờ và lý do ngoài bộ chuẩn nằm ở `US-05-04` **AC-7**; `US-05-02` AC-6 là "thiếu trường bắt buộc của `BM-01`".

**`US-05-02`:**

- Dòng _Dữ liệu nghiệp vụ_: sau "lý do ngoài bộ chuẩn" thêm `; **mã ngôn ngữ gốc** (`vi`/`en`) của lý do nghiệp vụ và lý do ngoài bộ chuẩn — người viết khai báo, giao diện chọn sẵn (`QĐ-74`, `FR-3.20`)`.
- Thêm `FR-3.20`, `QĐ-74` vào quy tắc nghiệp vụ và truy vết.
- Thêm vào kịch bản test: ``· `TS-10` (→ AC-11): `E1` giao diện tiếng Anh nhập lý do tiếng Việt, chọn _Tiếng Việt_ → lưu `vi`; thiếu mã → không gửi``.
- Thêm sau dòng `- **AC-10 — Cùng quy tắc trên mobile.**` của `US-05-02` (dòng 90 lúc soạn):

```markdown
- **AC-11 — Mã ngôn ngữ gốc (`QĐ-74`, `FR-3.20`).** **Given** `E1` dùng giao diện tiếng Anh và nhập lý do nghiệp vụ bằng tiếng Việt, **When** `E1` chọn ngôn ngữ nội dung _Tiếng Việt_ và gửi, **Then** Request lưu mã `vi` cho lý do nghiệp vụ, không lưu bản dịch nào; **When** gửi lý do có nội dung mà thiếu mã ngôn ngữ, **Then** không tạo Request và hệ thống nêu trường còn thiếu.
```

**`US-05-04`:**

- Dòng dữ liệu/quyền riêng tư: thêm `Bản dịch tham khảo (`FR-3.20`) không lưu, không mở rộng người xem.`
- Thêm `FR-3.20`, `QĐ-74` vào truy vết.
- Thêm kịch bản test: `TS-9` (→ AC-11) và `TS-10` (→ AC-12) theo hai AC dưới đây.
- Thêm sau dòng `- **AC-10 — Cùng quy tắc trên mobile.**` của `US-05-04` (dòng 186 lúc soạn):

```markdown
- **AC-11 — Đọc bản dịch tham khảo (`QĐ-74`, `FR-3.20`).** **Given** lý do nghiệp vụ của `E1` có mã `en` và `H1` dùng giao diện tiếng Việt, **When** `H1` yêu cầu xem bản dịch, **Then** `H1` thấy bản gốc và bản dịch tiếng Việt gắn nhãn _bản dịch máy_, tên phần mềm, số và ngày giữ nguyên; **When** không dịch được, **Then** `H1` thấy bản gốc và vẫn duyệt hoặc từ chối được; **When** `H1` thấy nội dung thực ra là tiếng Việt và chọn lại ngôn ngữ nguồn, **Then** hệ thống hiển thị bản gốc, không sửa bản ghi.
- **AC-12 — Lý do quyết định có mã ngôn ngữ, người yêu cầu đọc bản dịch (`QĐ-74`).** **Given** `H1` từ chối kèm lý do tiếng Việt, **When** lưu, **Then** bản ghi phê duyệt điện tử có mã `vi` cho lý do; **When** `E1` (giao diện tiếng Anh) yêu cầu xem bản dịch lý do, **Then** thấy bản gốc và bản dịch tiếng Anh; **When** trưởng phòng `H2` (`P-ENG`) yêu cầu bản dịch đó, **Then** bị từ chối như khi xem chi tiết và không bản dịch nào được tạo.
```

## P6 — Logical ERD (chỉ ghi chú)

- Chưa có Logical cho Request: C4 (`AccessRequest`, `ApprovalStep`) chỉ nằm ở mục 14 _Ngoài S0_ của `ERD/logical/LOGICAL-ERD-S0.md`.
- Anchor: dòng bắt đầu `| **C4** Yêu cầu & phê duyệt |` (dòng 1153 lúc soạn). Thêm vào ô _Cần thiết kế_:

```markdown
; mã ngôn ngữ gốc cho mỗi trường tự do trong danh sách cho phép của `FR-3.20` (lý do nghiệp vụ, lý do ngoài bộ chuẩn, lý do quyết định bước) — miền đề xuất {`vi`, `en`, `und`} (`mul` chờ Owner), trống ⇔ trường trống; **không** có thực thể/thuộc tính lưu bản dịch (`QĐ-74c`)
```

## P7 — Roadmap BE

- Đã thêm một dòng tối thiểu vào [roadmap](../../../roadmap.md) của repo BE, giữ nguyên các thay đổi có sẵn.
- Khi Docs ghi xong `QĐ-74`, cập nhật dòng đó: bỏ chữ "đề xuất" và dẫn AC chính thức.

## Thứ tự áp dụng đề nghị

1. Owner xác nhận nội dung P1. Câu hỏi license và `mul` có thể để mở.
2. Ghi P1 và P2–P4 cùng một lượt, kèm lịch sử phiên bản.
3. Sửa P5 trong `src/`, chạy `build_us.py --write` và `--check`.
4. Ghi P6.
5. Pin snapshot mới có commit/hash, cập nhật [nguồn của workspace BE](../../sources.md).
6. Spec lát G5 dẫn snapshot đó.
