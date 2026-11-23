# FIX-TEST — Đợt 1 thiết kế lại, làn `biz`

Các test http / integration / flow cũ khẳng định hành vi trước Wave 1, không xóa, không skip. Toàn bộ 16 mục của Phần A (8 suite integration cũ, 3 flow spec cũ và 5 suite `ops:seed` theo `D-1`) đã được cập nhật assertion đúng hành vi Wave 1 hoặc mở cửa sổ khóa kỳ cho `ops:seed` trước khi vào Phần B.

| Gói | File test | Ca | Lý do |
| --- | --------- | -- | ----- |
