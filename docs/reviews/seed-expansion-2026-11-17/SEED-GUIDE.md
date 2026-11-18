# Seed demo `shared-demo-v4` — dùng thế nào (18/11/2026)

Bản tóm tắt cho Owner và người chạy demo. Chi tiết từng bản ghi: [README fixture](../../../src/cli/seed/fixture/shared-demo-v4/README.md);
lệnh và mã thoát: [seed.md](../../guides/seed.md). Nhánh `feat/seed-v4-expand` (chưa vào `dev`).

## 1. Seed gồm gì

| Nhóm                     | Có gì                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tổ chức                  | Công ty Cổ phần Công nghệ Sao Việt; 9 phòng phẳng + phòng `ADMIN` của Super Admin (phòng khởi đầu, cố ý không trưởng phòng/IT/Cost Center). LGL không trưởng phòng, OPS không Cost Center                                                                                                                                                                                                                                               |
| Người                    | 62 nhân viên, 44 tài khoản (mỗi tài khoản một vai): Super Admin, Finance (NV-FIN1), Người duyệt chi (NV-CEO), 4 IT Admin, 8 trưởng phòng, nhân viên. Có 1 tài khoản **bị khóa** (NV-BOD3), 1 **lời mời chưa kích hoạt** (NV-NEW3), 1 nhân viên **chưa xếp phòng** (NV-NEW2), 3 người **nhập từ file** (NV-IMP1–3) và một lần nhập chỉ xem trước có 2 dòng lỗi                                                                           |
| Danh mục                 | 25 ứng dụng / 32 gói / 30 dòng thuê bao, tên SaaS thật (Microsoft 365, Zoom, Notion, Confluence, Adobe, Claude, GitHub Copilot, Visio, HubSpot, Jira, Slack, Figma…), **giá mô phỏng bằng VND**, đủ K1/K2/K4/K5, gói tháng và gói năm, kho khóa Visio/Sublime/JetBrains; Skype for Business **đã ngừng**                                                                                                                                |
| Ghế                      | Ghế nền của mọi thuê bao (có ghế Trống), 2 ghế đã hết hạn chờ thu hồi, ghế tài khoản máy (Slack của IT)                                                                                                                                                                                                                                                                                                                                 |
| Request (MF-1)           | 50 Request ở mọi trạng thái: nháp, chờ trưởng phòng (nhiều phòng), chờ thẩm định IT, IT từ chối (gợi ý gói khác), trả về người gửi (3 nguồn: nhu cầu / thẩm định / duyệt chi), chờ trình lô, chờ duyệt chi (8 dòng ở NV-CEO), dùng dự phòng (MKT xác nhận, DES chưa xác nhận), **bị chặn** ngân sách (SAL), duyệt chi từ chối, Request nhóm có 1 dòng bị từ chối, đang cấp, cấp thất bại, chờ IT đóng, hoàn tất, Request tiếp tục (R33) |
| Nhân sự (MF-2, MF-3)     | Nghỉ dài (DES7; ITO2 quay lại sau 5 ngày), nghỉ việc chặn ngay (OFF1, DEV7 nghỉ đột ngột với Request còn mở), IT Admin nghỉ có ngày cuối (ITA4), điều chuyển DEV4 ENG → ITO hiệu lực **ngày mai**; BM-09: chờ xác minh, đã gắn, bị từ chối, đã ghi                                                                                                                                                                                      |
| Hoàn trả, báo lỗi        | 2 hoàn trả (1 xong, 1 chờ IT); 6 báo lỗi SaaS: mới, đang xử lý (1 đã mở lại), đã giải quyết, chờ nhà cung cấp, bản trùng                                                                                                                                                                                                                                                                                                                |
| Usage, ghost seat (MF-5) | 6 nguồn usage (Figma, Jira, Canva, Adobe, HubSpot, Notion); khuyến nghị G1–G4; trưởng phòng DES đã quyết một phần (Giữ/Thu hồi/Miễn trừ/tự quyết); hàng chờ mới ở NV-DEP (≥ 3) và NV-SALH (≥ 1)                                                                                                                                                                                                                                         |
| Thuê bao (SBF-20)        | Thuê bao trong và ngoài cửa sổ điều chỉnh, Adobe **báo động đỏ**, Claude Team thiếu ngày (không điểm điều chỉnh); 2 lượt đã ghi: Adobe giảm 7 → 4, Zoom nhà cung cấp từ chối (ghi bởi IT Admin không phụ trách)                                                                                                                                                                                                                         |
| Thiết bị, collector      | Thông báo giám sát, allowlist (Claude Code, Codex), 7 máy: 4 đã xác nhận, 1 chờ xác nhận, 1 đổi người giữ, 1 ngừng dùng; 3 máy gửi usage AI và trạng thái công cụ; 1 yêu cầu dừng đang chờ, 1 đã dừng                                                                                                                                                                                                                                   |
| Ngân sách (MF-4)         | Năm nay: mọi phòng có trưởng phòng + Cost Center có phiên bản **đã duyệt** (BM-10 XLSX đúng mẫu + tệp giải thích của Finance); chốt tháng 1–10, ký quý 3 và 6, quý 9 có 2 giải trình; đèn: **SAL đỏ**, FIN/DES/MKT vàng, BOD xanh, ENG/ITO dưới mức. Năm sau: ENG đã duyệt, ITO BM-10 chờ Finance, MKT chờ Người duyệt chi, SAL bị trả về. Năm sau nữa: kỳ nháp                                                                         |
| Hóa đơn, hợp đồng        | 5 hợp đồng PDF; 13 hóa đơn (chờ ký, đã ký, bị trả, đã nộp lại `SV-INV-007R`, 1 hóa đơn cố ý lệch số lượng); hồ sơ thuế 6 nhà cung cấp; 1 ca chi ngoài quy trình (Sales tự mua Jira, Finance ghi 400.000 vào CC-SAL)                                                                                                                                                                                                                     |
| AI                       | Bật ở `SIMULATED` (trả câu giả lập có nhãn), 3 lần gọi tóm tắt mẫu; Super Admin tự đổi sang `MODEL` khi có Modal                                                                                                                                                                                                                                                                                                                        |
| Chính sách               | Thư viện chính sách, 1 chính sách xuất bản lại chờ xác nhận lại                                                                                                                                                                                                                                                                                                                                                                         |
| Tệp thật                 | Mọi PDF (hợp đồng, hóa đơn, biên nhận, BM-06) mở được, chữ tiếng Việt có dấu, copy/tìm chữ đúng; mọi XLSX (BM-10, tệp Finance) có số khớp với hệ thống                                                                                                                                                                                                                                                                                  |

## 2. Tài khoản

Mật khẩu: Super Admin dùng `SEED_SUPER_ADMIN_PASSWORD`, mọi tài khoản khác dùng `SEED_DEMO_ACCOUNT_PASSWORD` (do người chạy seed đặt).

| Vai              | Email                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Super Admin      | `system.admin@saoviet.example`                                                                                                 |
| Finance          | `phuc.trinh@saoviet.example` (NV-FIN1)                                                                                         |
| Người duyệt chi  | `an.nguyen@saoviet.example` (NV-CEO)                                                                                           |
| IT Admin         | `quan.ly@saoviet.example` (ITA1: ENG, ITO, SAL, LGL), `rang.mai@saoviet.example` (ITA2: BOD, DES, FIN, MKT)                    |
| Trưởng phòng     | `cuong.le@` (ENG), `thanh.tran@` (ITO), `bich.tran@` (BOD), `khanh.bui@` (DES), `yen.truong@` (SAL) … đủ bảng ở README fixture |
| Nhân viên có máy | `tuan.pham@` (DEV5), `hai.ngo@` (ITO1), `khai.tran@` (BOD1), `nga.phung@` (BOD4)                                               |

## 3. Cách chạy

- **Local:** `pnpm seed:local` (Enter = thoát, gõ tên DB = reset rồi seed, `c` = chạy tiếp). Tự động: `pnpm seed:local -- --confirm-reset <db>`
  hoặc `-- --continue`. API/worker phải tắt; khoảng **3 phút**.
- **VPS:** Owner chạy `scripts/ops/seed.sh --app-dir <dir> --config <file 600> --confirm-reset <POSTGRES_DB>` với `SEED_ALLOW_RESET=true`
  trong file cấu hình; chạy tiếp: `--continue`. Script lấy khóa deploy, không chạy cùng lúc với deploy.
- **Mã thoát:** 0 đã ghi · 2 không còn gì cần ghi · 3 bị từ chối trước khi ghi · 4 có bước xung đột/bị chặn · 1 lỗi.

## 4. Lưu ý khi dùng tới 30/12

1. **Seed lại ngày trước mỗi buổi demo, trong cùng tháng với buổi demo.** Dữ liệu đúng tới hết tháng seed: sang tháng mới, job ghế-tháng tính
   chi phí tháng vừa hết cho phòng người giữ ghế, ngân sách DES (308.000) không đủ nên R21 thành _bị chặn_ khi trưởng phòng xác nhận dự phòng, và
   Budget vs Actual đổi số. Nhiều ca neo theo ngày seed (DEV4 điều chuyển ngày mai, ITA4 nghỉ ngày làm việc thứ 3, R33 hết sau 7 ngày, cửa sổ
   SBF-20, Adobe tới hạn báo hủy sau 5 ngày).
2. **Sáng ngày demo chạy `--continue` một lần:** thêm điều chỉnh ngân sách DEMO-14 (kỳ khóa từ ngày sau hạn nộp) và một ngày usage AI.
3. **Chờ khoảng 10 phút sau khi API chạy** trước khi demo các ca do job tạo: hàng chờ ghost seat của NV-DEP/NV-SALH, R57 bị hủy khi DEV7 bị
   chặn, cảnh báo gia hạn đỏ, `AUTO_RENEWAL_INCIDENT` của Zoom Business.
4. **Thao tác trong buổi demo không làm hỏng lượt chạy tiếp:** đổi AI sang `MODEL`, xếp phòng cho NV-NEW2 vẫn chạy tiếp được. Thao tác khác làm
   dữ liệu lệch fixture thì seed báo xung đột: khi đó **reset** rồi seed lại.
5. **Không có chi phí các tháng trước** (hệ thống tính từ ngày đưa vào dùng): báo cáo không có xu hướng qua tháng; đèn dựa trên cam kết, chờ
   duyệt và khoản chi ngoài quy trình. Nhập dữ liệu lịch sử của công ty trước khi có hệ thống là việc làm sau (cần QĐ).
6. **Giá là mô phỏng**, hóa đơn/hợp đồng/BM-06 là chứng từ mô phỏng (ghi rõ trên tệp). Không gửi email thật; lời mời nằm trong outbox.
7. **Chỉ số "tỷ lệ chi phí ghế Trống" (FR-5.10)** chưa có màn/route: nợ prompt 4b.
8. Seed 31/12 rồi chạy tiếp 01/01 bị từ chối (exit 3): sang năm mới phải seed lại.

## 5. Đã kiểm (18/11/2026)

| Kiểm                                                           | Kết quả                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Seed DB trống / chạy lại cùng ngày                             | exit 0 (98 bước ghi) / exit 2 (99 "đã có")                        |
| Giả lập ngày 30/11 → `--continue` 01/12                        | exit 0 / exit 0, chỉ ghi usage AI 2 máy + DEMO-14                 |
| Giả lập ngày 30/12 → `--continue` 31/12                        | exit 0 / exit 0                                                   |
| `count.mjs` (đếm mọi checkpoint)                               | TẤT CẢ ĐẠT                                                        |
| `check-finance.mjs` (ngân sách ↔ thực chi ↔ chốt tháng ↔ XLSX) | 1100 pass / 0 fail; đủ 4 đèn                                      |
| `test:flows`                                                   | 70 pass / 9 skip / 0 fail                                         |
| Tệp thật                                                       | 24 PDF mở được, chữ có dấu đúng khi copy; BM-10 tổng = số đề nghị |
| Hóa đơn                                                        | Không cờ ngoài ý muốn (chỉ `SV-INV-004` cố ý lệch số lượng)       |
