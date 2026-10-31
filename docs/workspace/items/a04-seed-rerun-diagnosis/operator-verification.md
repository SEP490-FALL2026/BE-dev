# Kiểm chứng lỗi chạy lại `ops:demo-dataset` trên VPS (A-04)

Cho operator **đã được Owner giao quyền** chạy lệnh trên VPS dùng chung. Không reset, không nạp lại từ đầu, không đổi role,
không xóa dump/volume. Cách chạy lệnh: [runbook demo-dataset](../../../guides/demo-dataset.md). Nguyên nhân và bằng chứng:
[spec](spec.md#behavior-and-design), [evidence](evidence.md).

## 1. Đối chiếu lần chạy lại đã lỗi (chỉ đọc) — việc còn mở

**Việc còn mở của A-04.** Nguyên nhân gốc của lần chạy lại đã lỗi trên VPS **chưa được chứng minh**: repo không có log gốc, và A-04 chỉ
tái hiện hai nhánh trên Docker cục bộ. Mục này là bước duy nhất xác định lần đó rơi vào nhánh nào; chưa làm thì chưa được nói "đã
tìm ra nguyên nhân trên VPS".

Mở báo cáo đã lưu của lần đó — cách A: `/opt/slm/backend/demo-dataset/<UTC>-shared-demo-v1-apply.txt`; cách B:
`DEMO_REPORT_DIR/<UTC>-shared-demo-v1-apply-local.txt` — và đoạn stderr nếu còn trong terminal. Chỉ chép ra **dòng trạng
thái và dòng lỗi** (không chép file cấu hình, mật khẩu hay URL):

| Thấy gì                                                                                              | Nghĩa là                                                                                                 | Nhánh                  |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| `[LỖI] org.accounts … could not complete the transaction`, **không** có dòng `warning: … retired`    | transaction tài khoản demo vượt 10 s vì khứ hồi chậm (tunnel/host bận) — đã sửa ở A-04                   | code (đã sửa)          |
| `warning: A database connection was retired (client-side query timeout, …)` rồi `run failed`/`[LỖI]` | một câu lệnh không được trả lời trong 8 s: tunnel/mạng khựng, host bỏ đói tiến trình, hay DDL lúc deploy | hạ tầng                |
| `The demo dataset run failed: Error` ở cuối, các bước trước đều `ĐÃ CÓ`/`ĐÃ GHI`                     | kết nối giữ khóa đứt và lỗi nhả khóa che mất báo cáo — đã sửa ở A-04                                     | lifecycle (đã sửa)     |
| exit 3 `Another apply … is running`                                                                  | một `apply` khác đang giữ khóa                                                                           | không phải lỗi kết nối |

Ghi lại: cách chạy (A hay B), commit của image/bản build, giờ chạy, có deploy/backup nào chạy cùng lúc không.

## 2. Đo đường tới PostgreSQL (cách B)

Khi tunnel của wrapper đang mở (hoặc mở tay đúng như wrapper), đo khứ hồi từ máy local bằng một câu rỗng, ví dụ
`Measure-Command { psql -X -c "select 1" … }` lặp vài lần qua `127.0.0.1:<DEMO_LOCAL_PORT>`. Trước A-04, khứ hồi ≳ 60 ms đủ
làm lần nạp đầu hỏng và ≳ 165 ms làm lần chạy lại hỏng; sau A-04 mỗi transaction tối đa ≈ 18 round trip, nên hỏng chỉ khi khứ hồi
≳ 500 ms hoặc có khựng ≥ 8 s. (Ngưỡng gần đúng: còn phụ thuộc thời gian xử lý của host.)

## 3. Chạy lại với bản build có A-04

1. Cập nhật: cách A — image có A-04 qua CI/CD (`releases/current-image` mới); cách B — checkout có A-04, `pnpm build`
   (wrapper vẫn kiểm `prisma/` + `openapi.json` giống bản đang deploy; A-04 không đổi hai thứ đó).
2. `--mode plan` → mong đợi exit 0, các bước `ĐÃ CÓ` (hoặc `SẼ GHI` cho phần lần trước chưa xong).
3. `--mode apply` → exit 0 nếu còn phần dở, rồi **chạy lại `apply` thêm hai lần** → mỗi lần exit **2**, `Tổng: ĐÃ CÓ 24`.
4. Nếu vẫn lỗi: dòng lỗi giờ kèm mã trong ngoặc vuông, ví dụ `[P2028]` (transaction quá ngân sách), `[Query read timeout]`
   (không trả lời 8 s), `[ECONNRESET]` (kết nối bị cắt), `[P2010 57014]` (statement timeout phía server). Ghi đúng dòng đó
   vào báo cáo; không tự tăng `DB_*` trên VPS khi chưa có quyết định của Owner.

## 4. Kiểm nhanh không ghi gì

- Không còn khóa treo: cách A `docker compose … run --rm --no-deps migrate node dist/inspect-cli.js` exit 0 (kiểm cài đặt);
  khóa tự nhả khi tiến trình kết thúc, lượt `apply` kế tiếp không bị exit 3 là đủ.
- Không trùng: lần `apply` thứ hai/thứ ba exit 2 nghĩa là không bước nào ghi thêm.

Ghi kết quả (ngày, cách chạy, commit, mã thoát từng lần, dòng lỗi nếu có) vào [evidence](evidence.md#kiểm-chứng-trên-vps)
và Docs `demo/README.md` (Trạng thái nạp) như runbook mục 5.
