# Kho khóa bản quyền: cấu hình, xoay khóa, sao lưu

Dành cho người vận hành. Hành vi nghiệp vụ nằm ở [spec](../workspace/items/g3-license-key-vault/spec.md); lệnh kiểm tra và
biến môi trường ở [containers](containers.md) và `.env.example`.

## Khóa được giữ thế nào

- Mỗi khóa bản quyền được niêm bằng AES-256-GCM với một IV ngẫu nhiên mỗi lần, ràng buộc vào dòng và vào id khóa
  (`license-key|<rowId>|<keyId>`): chép dữ liệu niêm sang dòng khác, hoặc gán nhãn id khóa khác, thì không mở được.
- Mỗi dòng ghi `cipher_key_id` — khóa nào đã niêm nó. Khóa thật chỉ nằm ở biến môi trường, không bao giờ trong CSDL,
  nhật ký hay audit; mỗi lần xem đủ giá trị ghi một sự kiện audit cùng giao dịch.
- Dấu vân tay (HMAC của khóa với `LICENSE_KEY_FINGERPRINT_PEPPER`) chỉ để nhận ra khóa nhập hai lần. **Không bao giờ đổi
  pepper**: đổi nó là mất khả năng nhận ra khóa trùng với những khóa đã nhập.

## Ba điều kiện khởi động

API từ chối chạy (ngoài `NODE_ENV=test`) khi:

1. `LICENSE_KEY_VAULT_KEY` không phải base64 của đúng 32 byte, hoặc trùng `OUTBOX_PAYLOAD_KEY`, hoặc là giá trị công khai
   trong repo.
2. `LICENSE_KEY_VAULT_KEY_ID` không có hình `[A-Za-z0-9._-]{1,32}`.
3. `LICENSE_KEY_VAULT_PREVIOUS_KEYS` có cặp không phải `id:base64`, khóa không đủ 32 byte, id sai hình, id trùng id hiện
   tại hoặc trùng nhau, khóa trùng khóa hiện tại, hoặc là khóa công khai.

## Xoay khóa

1. Sinh khóa mới (lệnh sinh ở `.env.example`) và một id mới chưa từng dùng.
2. Đặt `LICENSE_KEY_VAULT_KEY` và `LICENSE_KEY_VAULT_KEY_ID` thành khóa mới; chuyển khóa cũ vào
   `LICENSE_KEY_VAULT_PREVIOUS_KEYS` dưới dạng `idCu:base64Cu` (nhiều cặp cách nhau bằng dấu phẩy). Triển khai.
3. Khóa nhập từ lúc này dùng khóa mới; khóa đã nhập vẫn mở được bằng khóa cũ. Kiểm tra bằng
   `SELECT cipher_key_id, count(*) FROM license_keys GROUP BY 1`.

**Giới hạn hiện tại:** chưa có lệnh niêm lại các dòng cũ bằng khóa mới, nên **không được xóa** khóa cũ khỏi
`LICENSE_KEY_VAULT_PREVIOUS_KEYS` khi còn dòng mang `cipher_key_id` của nó — những dòng đó sẽ không mở được nữa. Việc
cần lệnh niêm lại là một câu hỏi mở cho Owner ([review 21/10/2026](../reviews/g2-g4-completion-2026-10-21/README.md), Q8).

## Sao lưu và mất khóa

- Khóa niêm và dải khóa cũ phải được lưu ở nơi tách khỏi bản sao lưu CSDL (kho bí mật của tổ chức). Mất khóa là mất mọi
  khóa bản quyền đã niêm: không có đường nào lấy lại.
- Sao lưu CSDL không chứa khóa ở dạng đọc được; mở một bản sao lưu cần cả khóa niêm.
