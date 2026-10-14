# Nguồn yêu cầu

BRD sở hữu nghiệp vụ; US dẫn xuất phạm vi/AC; sổ quyết định ghi thay đổi nghiệp vụ. ARCHITECTURE/ADR của BE sở hữu cách hiện thực, không ghi đè yêu cầu.

| Nguồn      | Vị trí nhận diện trong bộ tài liệu dự án                                                 | Link chia sẻ / revision                                         |
| ---------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| BRD        | Docs/Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md | v3.36 `S-2026-10-12b`; v3.39 `S-2026-10-14`                     |
| Phạm vi    | Docs/Requiments/Định nghĩa phạm vi & nghiệp vụ.md                                        | v1.24 `S-2026-10-12b`; v1.27 `S-2026-10-14`                     |
| US         | Docs/BE-UserStory/user-stories-and-epics.md và Docs/BE-UserStory/epics/                  | v0.15 (`QĐ-67`) `S-2026-10-12b`; v0.15 (`QĐ-73`) `S-2026-10-14` |
| Quyết định | Docs/Decisions/project-decisions.md                                                      | QĐ-01 → QĐ-67 `S-2026-10-12b`; → QĐ-73 `S-2026-10-14`           |
| Conceptual | Docs/ERD/CONCEPTUAL ERD - DANH SÁCH ENTITY.md                                            | v5.1 (21 · 42), không đổi, `S-2026-10-12b`                      |

Vị trí trên chỉ để nhận diện tài liệu, không bắt contributor có thư mục cạnh checkout BE. Mỗi spec pin revision thực sự dùng.

## Snapshot `S-2026-10-12b` (baseline của G0, lát 1a/1b)

Snapshot đã nằm nguyên vẹn ở repo `SEP490-FALL2026/docs`, commit
**`0e0bb83e30d1584c847c1723ac3f7adaa923e171`** (`0e0bb83`). Ngày 14/10/2026 đã kiểm lại
**12/12 tệp** bằng `git show 0e0bb83:<tệp>` và SHA-256 chuẩn hóa LF, không BOM: khớp bảng dưới.
`982ea92` chỉ là snapshot lịch sử trước `QĐ-67`; không còn mô tả baseline này là thay đổi chưa commit.
Người nhận lấy đúng commit từ [repo Docs](https://github.com/SEP490-FALL2026/docs/commit/0e0bb83e30d1584c847c1723ac3f7adaa923e171),
không lấy working tree mới hơn để thay ngầm nguồn của spec.

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

**Điều kiện bàn giao:** nguồn đã có commit tái lập; người nhận vẫn cần xác nhận truy cập được đúng
commit/tệp có hash khớp. Việc kiểm hash local không xác nhận quyền truy cập remote của dev và không
phê duyệt spec. Nguồn US canonical là `BE-UserStory/src/` + `BE-UserStory/tools/build_us.py`;
tệp sinh không sửa tay.

## Snapshot `S-2026-10-14b` (working tree Docs — chưa commit; thay `S-2026-10-14`)

Lập 14/10/2026 sau delta `QĐ-73b` trên workflow: Docs HEAD `0e0bb83` **cộng thay đổi chưa commit** — BRD v3.39, Phạm vi v1.27,
sổ `QĐ-01` → `QĐ-73`, User Stories v0.15 (147 mã, 143 dùng, 1 408 AC), `WF-01` v3.3 (hồ sơ Finance đầu tiên nhập tay hoặc
import), `WF-04` (ghi ngoại lệ), Conceptual v5.1 (không đổi). Hash: SHA-256 nội dung chuẩn hóa LF, bỏ BOM (49 files);
cột _Git_ là trạng thái so với `0e0bb83` (`M` sửa, `??` mới). Mọi tệp bắt buộc nằm ngoài `Reviews/` và evidence bị ignore.

**Dùng cho bước nào.** _Bắt đầu refinement/design_ (hai lát 1c, G2 đầu): người nhận có **đúng các tệp** dưới đây và
hash khớp. Cùng máy: đọc thẳng working tree Docs. Khác máy: nhận **gói snapshot** — đúng 49 tệp theo đường dẫn
trong bảng (ví dụ nén từ gốc Docs) — rồi kiểm lại hash; bảng hash một mình **không** đủ để làm việc. _Giao implementation_:
nguồn phải được **cố định và truy cập được** cho mọi người làm/review; khi nhóm dùng Git, cách ưu tiên là commit Docs rồi
pin snapshot bằng commit (như `S-2026-10-12b`) — đây là quy ước ưu tiên của tài liệu này, **không** phải quyết định Owner;
chưa thấy quy định bắt buộc commit trong [quy trình](README.md) (chỉ yêu cầu snapshot có version/hash cho nguồn chưa commit).

| Tệp (tính từ gốc Docs)                                                              | Git   | SHA-256 (LF, không BOM)                                            |
| ----------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md | M     | `06953364c289dcbd2aed23d2b4d7a87e0bce7fd2aedb39411563cba485aeee5a` |
| Requiments/Định nghĩa phạm vi & nghiệp vụ.md                                        | M     | `0c8823cf6a1b4e70ffdd251d94d7773e072993702a6368d2c5cd1013f3141ce7` |
| Decisions/project-decisions.md                                                      | M     | `778fbd22ead508a957f37322cd4f234907c349447a4860fed63c41b07fa9a205` |
| ERD/CONCEPTUAL ERD - DANH SÁCH ENTITY.md                                            | M     | `86a2d4ef7cd7a9e0d770ee3ea39848f2a3658ee7bbf4ee7a658f8b216a77feb1` |
| BE-UserStory/README.md                                                              | clean | `e37a97f4a2491fb77f59f852de7026d0cfbdfe4204e47c8bd1a52381aee838de` |
| BE-UserStory/tools/build_us.py                                                      | M     | `6944ca804947fa45edd3291a4d0f0da2d8be638f2155eeb4fcab16fb7fb8c269` |
| BE-UserStory/tools/us_tools.py                                                      | clean | `744ae613dc0e7c2701835eb66678a833803714c45fd80169c71d48b7dec5d990` |
| BE-UserStory/tools/check_links.py                                                   | clean | `1fb8477dc6de4e5bd54618059921633a48ace3aaf014b6ea5abdb9aff3c88b97` |
| BE-UserStory/user-stories-and-epics.md                                              | M     | `8a1cf82cca9a651a8f1e3c7a8a90e49bf4ca435769e75a79df6c3877a7505b9d` |
| BE-UserStory/src/00-head.md                                                         | M     | `b5b310520b21ed2013a1613b07f82e6f376e0172c530b081dce391d4d58e6b4e` |
| BE-UserStory/src/99-tail.md                                                         | M     | `4f61e69267bac117b6d41880646089fad2317109e437723d1810d00c509826cf` |
| BE-UserStory/src/EP-01.md                                                           | M     | `4c26fb361bd41211da0b60d39040320b702ed3a951e999c1af55d9405d5c9d0b` |
| BE-UserStory/src/EP-02.md                                                           | M     | `065908038c1c6bfcbd9d0456004082f589e7d3600043b3f7af9be242564003fe` |
| BE-UserStory/src/EP-03.md                                                           | M     | `49cc1692828b32990161de530f4b01020beda74063bbbd62070af85b2162655f` |
| BE-UserStory/src/EP-04.md                                                           | M     | `93168b563197b3236a779a170dcc32b8dc95d6f4072d8b20848845c4c1f0798f` |
| BE-UserStory/src/EP-05.md                                                           | M     | `ac3608d59d13d0afc59ac1161b1c5c1cd13287edc4cc70c45dd9aa4077ecfee6` |
| BE-UserStory/src/EP-06.md                                                           | M     | `42956fabf1777bc008c41b43b3ebd56b9e9b5c21530ba13d39bde5631427a8fb` |
| BE-UserStory/src/EP-07.md                                                           | M     | `c92c4b328e5fe0ea8c5fbfc4c0718e3201e286b36ad77712bc22d4c1e24a5b9e` |
| BE-UserStory/src/EP-08.md                                                           | M     | `6888ad034c2d402f3735d988c3c3d29c39bea6064fcd5c255c4a79d4a440ac03` |
| BE-UserStory/src/EP-09.md                                                           | M     | `61929ea750011dbc51e8845ad858e65ec05bf785f5a26196bf1e15edd863d35a` |
| BE-UserStory/src/EP-10.md                                                           | M     | `95d8867dad66cf53661454234efbdbeb4297dfc1d925429790530f584c55ba58` |
| BE-UserStory/src/EP-11.md                                                           | M     | `3ac7e300c55c1282c1bb7492f5e363d35b73a912528aefd171a5637b7ef1b2b8` |
| BE-UserStory/src/EP-12.md                                                           | M     | `2e45e33e6831be861d73e1f3062ebcfa690f3a2ce9567e5a78b5cca4e1a06641` |
| BE-UserStory/src/EP-13.md                                                           | M     | `4e9452c944671919f262e001e7bc99bc4f9640ae53427b5ed795658b3eed8912` |
| BE-UserStory/src/EP-14.md                                                           | M     | `02e2d60585012f7cfbaf93b4f7625ffeeba2b8b74623840a6da85a636aac980c` |
| BE-UserStory/src/EP-15.md                                                           | M     | `61bc0f3db1f6d839291cc3f71ab1af8c9635c1fc25f9916ce61d5f461f72e00d` |
| BE-UserStory/src/EP-16.md                                                           | M     | `fa9f17acb5948e2361d59a2325dae88b0f55a25fb6957f0417da19bc6d4f6ee5` |
| BE-UserStory/src/anchors-v0.14.json                                                 | clean | `e80edeb87fdcc0ad3ca7f2c43ec4162913ba0ab5a5014d4500c01d57beb7671a` |
| BE-UserStory/src/uc-trace.json                                                      | ??    | `e8111ab60666e029f0dbd6ac5cf834a76994592fddb55b0004197c192a251467` |
| BE-UserStory/epics/EP-01.md                                                         | M     | `c0b969fef78ddc1096a130d115b5c7dfbed8658160ac6c6d6913822c4ef6f571` |
| BE-UserStory/epics/EP-02.md                                                         | M     | `08c0889dd866ec8c3d216518765cdd7daa5e097b529eb28a26d8badb258483f4` |
| BE-UserStory/epics/EP-03.md                                                         | M     | `3c9dec2850a4871e38c0b24d98557b38170330e444cc3d2a72bd246f8e391942` |
| BE-UserStory/epics/EP-04.md                                                         | M     | `3760a71500a800f1a3ffc6fb0bb7e22b48acb34deb8d5af361be6c5f244c7358` |
| BE-UserStory/epics/EP-05.md                                                         | M     | `e22811e18b30f7a261499f305fb5c28c8f0f09acf368f9bd32a62f59b0aecc91` |
| BE-UserStory/epics/EP-06.md                                                         | M     | `34d96a9eda794dd125810524742eed643b84073ec84cc2f891756c1d7da4fbbd` |
| BE-UserStory/epics/EP-07.md                                                         | M     | `d7da25cdf2b1639c2a2660d0691081b948bcfebdc5b5fee7ef10d9af85fd5b05` |
| BE-UserStory/epics/EP-08.md                                                         | M     | `0114cc6ae27b9f60bf2c6ce52cb733b29d1a7eff0d34aa5a180e6dbdaa9bcefc` |
| BE-UserStory/epics/EP-09.md                                                         | M     | `b6e39d7bafed24b1d1dec94a276a9b831ecad3457a0036f18d7621a01dcd62ab` |
| BE-UserStory/epics/EP-10.md                                                         | M     | `893df5f6fd9ca5551d55a083c803927c8727e1e0787012763ba86f282d39d153` |
| BE-UserStory/epics/EP-11.md                                                         | M     | `defaaaccf397996ed46cb14c363f80247e464007be0dd6aa0dc8554d9deb86ae` |
| BE-UserStory/epics/EP-12.md                                                         | M     | `36a4dc942a24556ed781727604208d9bae4555987cedeafb00e7a2d46fb51df1` |
| BE-UserStory/epics/EP-13.md                                                         | M     | `63df76c6fd6dbe2a05ed7d9d6a7e6e9e18e141694038d638bfc9f9973e4ee701` |
| BE-UserStory/epics/EP-14.md                                                         | M     | `247f28236a3591a9d80d337746ea942e32665c2bcf20d919ab32d7f4799c5cfb` |
| BE-UserStory/epics/EP-15.md                                                         | M     | `669d636bd8a36f307a4ae89c8927d34b8c24948c3998f71fdb7140545d2e282a` |
| BE-UserStory/epics/EP-16.md                                                         | M     | `cdb2b07a3b46eec523b8bd4d950f8682e08d0b729e2e52ceb7cb9b71266a0b5c` |
| Diagrams/specs/WF-01.json                                                           | M     | `ac2d1adc46b6fa13b0b199a85d2b45a75a37a69cc1620bdba2b6393f73806441` |
| Diagrams/workflows-activity-diagram/WF-01-organization-initial-data-setup.md        | M     | `904f645dc79c9f8abc39814b34a81a9d4f796b43a81190097eaa5163988380b1` |
| Diagrams/specs/WF-04.json                                                           | M     | `b0df3364019b9cdf6634a8e85729a167b90611ea811188cdd7a2a2180bbb8b99` |
| Diagrams/workflows-activity-diagram/WF-04-new-employee-onboarding.md                | M     | `02af98d59ef51da7fe82b355a2e44059872b7f6d1062ea4713626256a70f31bf` |

**Tái tạo:** US canonical là `BE-UserStory/src/` + `BE-UserStory/tools/build_us.py --write`; kiểm `--check`,
`us_tools.py check-refs BE-UserStory/epics/*.md`, `check_links.py` trên `user-stories-and-epics.md` + `epics/*.md`;
workflow sinh từ `Diagrams/specs/*.json` bằng `Diagrams/tools/flowkit.py build`. Không chép BRD vào spec.

## Snapshot `S-2026-10-14` (lịch sử — thay bởi `S-2026-10-14b`)

Lập 14/10/2026 cho các lát sau G0/1a/1b (đầu vào refinement 1c và G2 đầu). Docs HEAD `0e0bb83` **cộng thay đổi chưa
commit**: BRD v3.39, Phạm vi v1.27, sổ `QĐ-01` → `QĐ-73`, User Stories v0.15 (147 mã, 143 dùng, 1 408 AC), Conceptual
v5.1 (không đổi). **Không có commit** để tái lập: hash dưới chỉ chứng minh đúng tệp đã đọc; người nhận chỉ dùng khi
nhận được tệp có hash khớp. **Trước khi giao code** phải commit Docs và pin snapshot mới bằng commit (thay mục này).
Hash: SHA-256 nội dung chuẩn hóa LF, bỏ BOM (45 files); cột _Git_ là trạng thái so với `0e0bb83` (`M` sửa, `??` mới).

| Tệp (tính từ gốc Docs)                                                              | Git   | SHA-256 (LF, không BOM)                                            |
| ----------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md | M     | `06953364c289dcbd2aed23d2b4d7a87e0bce7fd2aedb39411563cba485aeee5a` |
| Requiments/Định nghĩa phạm vi & nghiệp vụ.md                                        | M     | `0c8823cf6a1b4e70ffdd251d94d7773e072993702a6368d2c5cd1013f3141ce7` |
| Decisions/project-decisions.md                                                      | M     | `778fbd22ead508a957f37322cd4f234907c349447a4860fed63c41b07fa9a205` |
| ERD/CONCEPTUAL ERD - DANH SÁCH ENTITY.md                                            | M     | `86a2d4ef7cd7a9e0d770ee3ea39848f2a3658ee7bbf4ee7a658f8b216a77feb1` |
| BE-UserStory/README.md                                                              | clean | `e37a97f4a2491fb77f59f852de7026d0cfbdfe4204e47c8bd1a52381aee838de` |
| BE-UserStory/tools/build_us.py                                                      | M     | `6944ca804947fa45edd3291a4d0f0da2d8be638f2155eeb4fcab16fb7fb8c269` |
| BE-UserStory/tools/us_tools.py                                                      | clean | `744ae613dc0e7c2701835eb66678a833803714c45fd80169c71d48b7dec5d990` |
| BE-UserStory/tools/check_links.py                                                   | clean | `1fb8477dc6de4e5bd54618059921633a48ace3aaf014b6ea5abdb9aff3c88b97` |
| BE-UserStory/user-stories-and-epics.md                                              | M     | `8a1cf82cca9a651a8f1e3c7a8a90e49bf4ca435769e75a79df6c3877a7505b9d` |
| BE-UserStory/src/00-head.md                                                         | M     | `b5b310520b21ed2013a1613b07f82e6f376e0172c530b081dce391d4d58e6b4e` |
| BE-UserStory/src/99-tail.md                                                         | M     | `4f61e69267bac117b6d41880646089fad2317109e437723d1810d00c509826cf` |
| BE-UserStory/src/EP-01.md                                                           | M     | `4c26fb361bd41211da0b60d39040320b702ed3a951e999c1af55d9405d5c9d0b` |
| BE-UserStory/src/EP-02.md                                                           | M     | `7127c639d1bd05b752f7d9f85b77d33fecb534e189dbc590d917bd3221129aba` |
| BE-UserStory/src/EP-03.md                                                           | M     | `49cc1692828b32990161de530f4b01020beda74063bbbd62070af85b2162655f` |
| BE-UserStory/src/EP-04.md                                                           | M     | `93168b563197b3236a779a170dcc32b8dc95d6f4072d8b20848845c4c1f0798f` |
| BE-UserStory/src/EP-05.md                                                           | M     | `ac3608d59d13d0afc59ac1161b1c5c1cd13287edc4cc70c45dd9aa4077ecfee6` |
| BE-UserStory/src/EP-06.md                                                           | M     | `42956fabf1777bc008c41b43b3ebd56b9e9b5c21530ba13d39bde5631427a8fb` |
| BE-UserStory/src/EP-07.md                                                           | M     | `c92c4b328e5fe0ea8c5fbfc4c0718e3201e286b36ad77712bc22d4c1e24a5b9e` |
| BE-UserStory/src/EP-08.md                                                           | M     | `6888ad034c2d402f3735d988c3c3d29c39bea6064fcd5c255c4a79d4a440ac03` |
| BE-UserStory/src/EP-09.md                                                           | M     | `61929ea750011dbc51e8845ad858e65ec05bf785f5a26196bf1e15edd863d35a` |
| BE-UserStory/src/EP-10.md                                                           | M     | `95d8867dad66cf53661454234efbdbeb4297dfc1d925429790530f584c55ba58` |
| BE-UserStory/src/EP-11.md                                                           | M     | `3ac7e300c55c1282c1bb7492f5e363d35b73a912528aefd171a5637b7ef1b2b8` |
| BE-UserStory/src/EP-12.md                                                           | M     | `2e45e33e6831be861d73e1f3062ebcfa690f3a2ce9567e5a78b5cca4e1a06641` |
| BE-UserStory/src/EP-13.md                                                           | M     | `4e9452c944671919f262e001e7bc99bc4f9640ae53427b5ed795658b3eed8912` |
| BE-UserStory/src/EP-14.md                                                           | M     | `02e2d60585012f7cfbaf93b4f7625ffeeba2b8b74623840a6da85a636aac980c` |
| BE-UserStory/src/EP-15.md                                                           | M     | `61bc0f3db1f6d839291cc3f71ab1af8c9635c1fc25f9916ce61d5f461f72e00d` |
| BE-UserStory/src/EP-16.md                                                           | M     | `fa9f17acb5948e2361d59a2325dae88b0f55a25fb6957f0417da19bc6d4f6ee5` |
| BE-UserStory/src/anchors-v0.14.json                                                 | clean | `e80edeb87fdcc0ad3ca7f2c43ec4162913ba0ab5a5014d4500c01d57beb7671a` |
| BE-UserStory/src/uc-trace.json                                                      | ??    | `e8111ab60666e029f0dbd6ac5cf834a76994592fddb55b0004197c192a251467` |
| BE-UserStory/epics/EP-01.md                                                         | M     | `c0b969fef78ddc1096a130d115b5c7dfbed8658160ac6c6d6913822c4ef6f571` |
| BE-UserStory/epics/EP-02.md                                                         | M     | `ce5e76ea5bc6559a2441ee15a6bee684887e96e5677da0a4e35feb797a55267a` |
| BE-UserStory/epics/EP-03.md                                                         | M     | `3c9dec2850a4871e38c0b24d98557b38170330e444cc3d2a72bd246f8e391942` |
| BE-UserStory/epics/EP-04.md                                                         | M     | `3760a71500a800f1a3ffc6fb0bb7e22b48acb34deb8d5af361be6c5f244c7358` |
| BE-UserStory/epics/EP-05.md                                                         | M     | `e22811e18b30f7a261499f305fb5c28c8f0f09acf368f9bd32a62f59b0aecc91` |
| BE-UserStory/epics/EP-06.md                                                         | M     | `34d96a9eda794dd125810524742eed643b84073ec84cc2f891756c1d7da4fbbd` |
| BE-UserStory/epics/EP-07.md                                                         | M     | `d7da25cdf2b1639c2a2660d0691081b948bcfebdc5b5fee7ef10d9af85fd5b05` |
| BE-UserStory/epics/EP-08.md                                                         | M     | `0114cc6ae27b9f60bf2c6ce52cb733b29d1a7eff0d34aa5a180e6dbdaa9bcefc` |
| BE-UserStory/epics/EP-09.md                                                         | M     | `b6e39d7bafed24b1d1dec94a276a9b831ecad3457a0036f18d7621a01dcd62ab` |
| BE-UserStory/epics/EP-10.md                                                         | M     | `893df5f6fd9ca5551d55a083c803927c8727e1e0787012763ba86f282d39d153` |
| BE-UserStory/epics/EP-11.md                                                         | M     | `defaaaccf397996ed46cb14c363f80247e464007be0dd6aa0dc8554d9deb86ae` |
| BE-UserStory/epics/EP-12.md                                                         | M     | `36a4dc942a24556ed781727604208d9bae4555987cedeafb00e7a2d46fb51df1` |
| BE-UserStory/epics/EP-13.md                                                         | M     | `63df76c6fd6dbe2a05ed7d9d6a7e6e9e18e141694038d638bfc9f9973e4ee701` |
| BE-UserStory/epics/EP-14.md                                                         | M     | `247f28236a3591a9d80d337746ea942e32665c2bcf20d919ab32d7f4799c5cfb` |
| BE-UserStory/epics/EP-15.md                                                         | M     | `669d636bd8a36f307a4ae89c8927d34b8c24948c3998f71fdb7140545d2e282a` |
| BE-UserStory/epics/EP-16.md                                                         | M     | `cdb2b07a3b46eec523b8bd4d950f8682e08d0b729e2e52ceb7cb9b71266a0b5c` |

**Tái tạo:** nguồn canonical là `BE-UserStory/src/` + `BE-UserStory/tools/build_us.py --write`; kiểm `--check`
(parity), `us_tools.py check-refs BE-UserStory/epics/*.md`, `check_links.py` trên `user-stories-and-epics.md` + `epics/*.md`.
Không chép BRD vào spec; spec dẫn mục/AC theo hash này. `S-2026-10-12b` giữ nguyên làm baseline của G0/1a/1b.

## Delta sau baseline: `QĐ-68` (chưa thay snapshot của G0/1a/1b)

[Review G0/G1](../reviews/g0-g1-remediation-2026-10-15/README.md) ghi nhận working tree Docs
BRD v3.37, Phạm vi v1.25 và `QĐ-68a`→`68f`; phần này đang được chỉnh riêng, chưa được pin thành
snapshot bàn giao mới tại đây. EP-01 và các định nghĩa yêu cầu của ba spec được kiểm trong báo cáo
vẫn khớp baseline. Không coi toàn bộ working tree đã được review hoặc đã được BE hiện thực.

- R-10: trước G2, refine JobTitle theo `QĐ-68a/b/d`: danh mục chung, chuẩn hóa khoảng trắng thừa,
  không phân biệt hoa/thường nhưng giữ dấu, có trạng thái ngừng dùng.
- R-11: review lại I-2 theo `QĐ-66ak` và `QĐ-68f`: thời điểm ghi nhận thành viên phòng khác thời điểm
  bắt đầu quyền theo ngày vào. Theo dõi `OQ-A-26` cho ngày vào đã qua; không tự chốt.
  Ngoại lệ placement khởi tạo từ ngày vào của `QĐ-67a`/`QĐ-68f` giữ nguyên.
- Khi thiết kế G2, pin commit/hash mới, lập impact/migration/test plan và dev review trước phần phụ thuộc.
  Xem [review G0/G1](../reviews/g0-g1-remediation-2026-10-15/README.md).

## Snapshot `S-2026-10-12` (lịch sử)

Lập lúc Docs HEAD là `583fc22` cộng thay đổi chưa commit; nay **đã commit ở `982ea92`** — tám tệp đã pin (BRD v3.35, Phạm vi v1.24, sổ quyết định QĐ-01 → QĐ-66, US v0.15 và `epics/EP-01`→`EP-03`, Conceptual v5.1) khớp hash với commit đó (kiểm 12/10/2026). Dùng `git show 982ea92:<tệp>` để đọc lại. Spec nào còn dẫn `S-2026-10-12` phải đánh giá lại theo `QĐ-67` trước khi review.

## Lưu ý về thiết kế cũ

BE ADR-0006/0008/0009/0010 và `docs/architecture/native-*.md` chỉ còn trong lịch sử Git (bản cuối ở `1e8d0a1`, bị dọn ở `6396bbf`); nhánh `feat/native-schema` chưa merge. Chúng viết theo cây `manager_id`, không phải gói code-ready. Có thể đọc để tham khảo khi review, ghi rõ revision; không restore source hay plan cũ. ADR mới không dùng lại các số này. Quyết định nghiệp vụ `QĐ-46`/`QĐ-47` ở sổ quyết định vẫn hiệu lực, đọc cùng `QĐ-67`.
