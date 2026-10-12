# Nguồn yêu cầu

BRD sở hữu nghiệp vụ; US dẫn xuất phạm vi/AC; sổ quyết định ghi thay đổi nghiệp vụ. ARCHITECTURE/ADR của BE sở hữu cách hiện thực, không ghi đè yêu cầu.

| Nguồn      | Vị trí nhận diện trong bộ tài liệu dự án                                                 | Link chia sẻ / revision                         |
| ---------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| BRD        | Docs/Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md | v3.36, snapshot `S-2026-10-12b`                 |
| Phạm vi    | Docs/Requiments/Định nghĩa phạm vi & nghiệp vụ.md                                        | v1.24 (không đổi), snapshot `S-2026-10-12b`     |
| US         | Docs/BE-UserStory/user-stories-and-epics.md và Docs/BE-UserStory/epics/                  | v0.15 bổ sung `QĐ-67`, snapshot `S-2026-10-12b` |
| Quyết định | Docs/Decisions/project-decisions.md                                                      | QĐ-01 → QĐ-67, `S-2026-10-12b`                  |
| Conceptual | Docs/ERD/CONCEPTUAL ERD - DANH SÁCH ENTITY.md                                            | v5.1 (21 · 42), không đổi, `S-2026-10-12b`      |

Vị trí trên chỉ để nhận diện tài liệu, không bắt contributor có thư mục cạnh checkout BE. Mỗi spec pin revision thực sự dùng.

## Snapshot `S-2026-10-12b` (hiện hành)

Repo Docs có remote `SEP490-FALL2026/docs` theo cấu hình Git của bản local. Nền là commit **`982ea92`** trên `main` (đã có trên `origin/main` lúc kiểm 12/10/2026) — commit này chứa đúng snapshot `S-2026-10-12` bên dưới. Trên nền đó, lượt khép thiết kế 12/10/2026 có **thay đổi chưa commit**: sổ quyết định (`QĐ-67`), BRD v3.36, nguồn US (`src/00-head.md`, `src/99-tail.md`, `src/EP-01.md`, `src/EP-02.md`) và các tệp US sinh lại từ nguồn. Đối chiếu bằng SHA-256 của nội dung tệp (LF, không BOM):

| Tệp (tính từ gốc Docs)                                                              | SHA-256                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md | `16c6437b88a032b8697f7b15064e316b7f3bddf752442e4b8aa3b78c480a499d` |
| Requiments/Định nghĩa phạm vi & nghiệp vụ.md                                        | `7d2f79cd9df4bbf0b3382335ca8e0561ec6b54f0525d7f825e4d8130a151da36` |
| Decisions/project-decisions.md                                                      | `6bc3a595f4bdf423c10e2cbf2f7d18bea2753f6828854cb416a441ddd88aecd7` |
| BE-UserStory/user-stories-and-epics.md                                              | `469615661d56de3a035993cce3cd457a53be469c275f7d2073c322c1f136f66e` |
| BE-UserStory/epics/EP-01.md                                                         | `197d561a59d7ffff9696c0655d8e790d0c38b5c41704b5d269c5f5c1bd2bac69` |
| BE-UserStory/epics/EP-02.md                                                         | `c30646ce11d779beb6980c7043a89e2d0e8db505a46c2f46e720b39bcc890c5b` |
| BE-UserStory/epics/EP-03.md                                                         | `36771e86529b23a2c32093a39d91cc841bdbc2bed296b0a4217b52163dde6f7e` |
| BE-UserStory/src/00-head.md                                                         | `316f44faac522f17586a833e9b9a1eecaa6ce56d40d1b887e8f49fe349a088a4` |
| BE-UserStory/src/99-tail.md                                                         | `d6a08dcdab1c24e4a2136158f6227e01825489a50105816bd284a4cd8437c5e6` |
| BE-UserStory/src/EP-01.md                                                           | `bbb22ccc1964a37f665b6e3c20158f2155e02b26bf0fb431543e93760625097b` |
| BE-UserStory/src/EP-02.md                                                           | `6f449360edd2812feb754ffc45657b1f7091a3e90e02e8f22d36cfd03285f644` |
| ERD/CONCEPTUAL ERD - DANH SÁCH ENTITY.md                                            | `6ab348ec9f1af01512a264c493599f1ddf778b82b82caf4250ff6746c89cc8c0` |

**Điều kiện bàn giao:** người nhận chưa đọc được các tệp trên thì chưa bàn giao được. Owner commit/push Docs hoặc chia sẻ đúng các tệp có hash khớp, rồi ghi commit Docs vào cột revision ở trên. Nguồn US canonical là `BE-UserStory/src/` + `BE-UserStory/tools/build_us.py`; tệp sinh không sửa tay.

## Snapshot `S-2026-10-12` (lịch sử)

Lập lúc Docs HEAD là `583fc22` cộng thay đổi chưa commit; nay **đã commit ở `982ea92`** — tám tệp đã pin (BRD v3.35, Phạm vi v1.24, sổ quyết định QĐ-01 → QĐ-66, US v0.15 và `epics/EP-01`→`EP-03`, Conceptual v5.1) khớp hash với commit đó (kiểm 12/10/2026). Dùng `git show 982ea92:<tệp>` để đọc lại. Spec nào còn dẫn `S-2026-10-12` phải đánh giá lại theo `QĐ-67` trước khi review.

## Lưu ý về thiết kế cũ

BE ADR-0006/0008/0009/0010 và `docs/architecture/native-*.md` chỉ còn trong lịch sử Git (bản cuối ở `1e8d0a1`, bị dọn ở `6396bbf`); nhánh `feat/native-schema` chưa merge. Chúng viết theo cây `manager_id`, không phải gói code-ready. Có thể đọc để tham khảo khi review, ghi rõ revision; không restore source hay plan cũ. ADR mới không dùng lại các số này. Quyết định nghiệp vụ `QĐ-46`/`QĐ-47` ở sổ quyết định vẫn hiệu lực, đọc cùng `QĐ-67`.
