import type { InitialPolicy } from './initial-policies.types';

/** POL-MF4: the text of the first version, from the approved set of policies (`QĐ-112b`, `Bộ chính sách khởi tạo.md` 1.0). */
export const POL_MF4: InitialPolicy = {
  code: 'POL-MF4',
  title: 'Chính sách ngân sách phần mềm năm và rà soát trong năm',
  applicableRoles: ['FINANCE', 'MANAGER', 'SPENDING_APPROVER'],
  content: {
    sections: [
      {
        heading: 'Mục đích',
        body: 'mỗi phòng có một ngân sách phần mềm cả năm do Người duyệt chi duyệt, nằm trong Trần năm lãnh đạo giao; trong năm số liệu được chốt hằng tháng, rà soát hằng quý và chỉ thay đổi qua điều chỉnh có duyệt.',
      },
      {
        heading: 'Phạm vi',
        body: 'kỳ lập ngân sách (`MF-4` B1→B7) và phần trong năm (`SBF-11`: `4.11`→`4.14`), quy tắc qua năm `X-1`→`X-4`.',
      },
      {
        heading: 'Vai trò',
        body: 'Finance — mở kỳ, chốt số, chốt tháng, ký rà soát quý, lập điều chỉnh (không quyết); Trưởng phòng — nộp `BM-10`, giải trình; Người duyệt chi — quyết phiên bản và điều chỉnh, không đặt Trần, không ký rà soát (`SoD-3`, `SoD-8`).',
      },
      {
        heading: 'Quy định',
        body: '1. Năm tài chính là năm dương lịch; **mọi** năm phải có kỳ lập ngân sách trước khi có phiên bản (`FR-5.1`, `QĐ-104e`, `QĐ-109f`). — _Đối chiếu:_ Tương tự thực tế · [FinOps](https://www.finops.org/framework/capabilities/budgeting/)\n2. **Kỳ:** _Nháp_ ⟹ **Mở kỳ** (báo trưởng phòng kèm file mẫu và số liệu nền) ⟹ hết hạn nộp là **khóa**, không mở lại; Finance nhập Trần năm và Dự phòng kho dùng chung (`QĐ-111z`, `QĐ-111aa`). — _Đối chiếu:_ Tương tự thực tế · [FinOps](https://www.finops.org/framework/capabilities/budgeting/)\n3. `BM-10` = ≥ 1 file theo mẫu + một số tiền đề nghị + ghi chú tùy chọn, nộp trước hạn (`QĐ-111ab`). — _Đối chiếu:_ Nội bộ — QĐ\n4. Finance chốt từng phòng: **số cơ sở** (điền sẵn cam kết sẽ chạy sang năm sau) + **dự phòng** (mặc định 10 %, khác thì có lý do) + ≥ 1 file; thấp hơn cam kết chạy sang ⟹ cờ đỏ, không chặn; phòng không nộp ⟹ chốt từ số liệu nền, có cờ (`QĐ-111ac`, `QĐ-111bb`). — _Đối chiếu:_ Tương tự thực tế; 10 % là nội bộ (DX-21) · [FinOps](https://www.finops.org/framework/capabilities/budgeting/); [Luật NSNN Đ10](https://hethongphapluat.com/luat-ngan-sach-nha-nuoc-2015/dieu-10) (S)\n5. Tổng (số cơ sở + dự phòng) các phòng ≤ **Trần năm − Dự phòng kho dùng chung**, kiểm khi Finance gửi; không chia quý (`QĐ-111aa`, `QĐ-111ac`). — _Đối chiếu:_ Tương tự thực tế · [Sussex virements](https://www.sussex.ac.uk:443/finance/documents/virements-policy---final-approved14dec20.pdf) (S)\n6. Người duyệt chi **bắt buộc** quyết từng phiên bản: chỉ _Duyệt_ hoặc _Trả về sửa_ (lý do bắt buộc); duyệt ⟹ hiện hành, **bất biến cả năm** (`QĐ-111ad`). — _Đối chiếu:_ Tương tự thực tế · [FinOps](https://www.finops.org/framework/capabilities/budgeting/)\n7. **Chốt số hằng tháng** ngày làm việc thứ 5: ảnh chụp không sửa, **không khóa dữ liệu** (hóa đơn muộn vẫn ghi); Finance ký đóng kỳ tháng (`QĐ-111ae`, R-2). — _Đối chiếu:_ Tương tự thực tế · [APQC](https://www.cfo.com/news/metric-of-the-month-cycle-time-for-monthly-close/) (S); [FinOps](https://www.finops.org/framework/capabilities/budgeting/)\n8. **Ngưỡng và đèn** cố định: phần đã dùng chạm 80 %/100 % số cơ sở ⟹ báo trưởng phòng và Finance; _Vàng_/_Đỏ_/_Dưới mức_ theo dự kiến cuối năm; **chặn cứng** khi duyệt Request giữ nguyên, đèn chỉ cảnh báo mềm (`QĐ-111af`, `QĐ-111ai`, R-3). — _Đối chiếu:_ Tương tự thực tế · [FinOps](https://www.finops.org/framework/capabilities/budgeting/); [Cloudaware](https://docs.cloudaware.com/DOCS/finops-budgeting-forecasting-budgets) (S)\n9. **Rà soát quý** (kỳ chốt tháng 3, 6, 9): phòng _Vàng_ (dự kiến cuối năm > số cơ sở hoặc tốc độ chi > 110 % lịch), _Đỏ_ (dự kiến > số cơ sở + dự phòng) hoặc _Dưới mức_ (từ tháng 6, dự kiến < 70 % số cơ sở) giải trình trong 5 ngày làm việc (nguyên nhân, một lần hay kéo dài, hành động, nhu cầu đã biết tới cuối năm); chỉ Finance ký, ký được khi còn phòng chưa giải trình — khi đó Finance ghi danh sách phòng thiếu vào biên bản (`QĐ-111af`, `QĐ-111ah`, R-10, R-17). — _Đối chiếu:_ Tương tự thực tế (đã sửa DX-18) · [FinOps](https://www.finops.org/framework/capabilities/budgeting/)\n10. **Điều chỉnh** — bốn loại _Bổ sung_, _Chuyển_, _Trả lại_, _Giảm Trần năm_: chỉ Finance lập kèm lý do, Người duyệt chi duyệt; chỉ đổi số cơ sở; tổng ≤ Trần năm − Dự phòng kho; Trần không tăng sau khóa kỳ; nguồn không xuống dưới dự kiến cuối năm (`QĐ-111ag`, `QĐ-111bh`, R-36, R-40). — _Đối chiếu:_ Tương tự thực tế · [LSE virement](https://info.lse.ac.uk/staff/divisions/Finance-Division/assets/documents/Financial-Planning-and-Analysis/PDFs/Obsolete-PDFs/Virement-procedure.pdf) (S)\n11. **Qua năm:** số năm sau lưu lúc duyệt Request; 01/01 tự tạo cam kết năm mới; năm sau đã có ngân sách mà vượt ⟹ cảnh báo mềm; chưa có ngân sách ⟹ nhắc Finance và Người duyệt chi từ 01/12 rồi mỗi Thứ Hai (`QĐ-111k`, `QĐ-111ak`→`QĐ-111am`). — _Đối chiếu:_ Nội bộ — QĐ\n12. Phòng mới chỉ tạo trong kỳ, trước lần Finance gửi phiên bản đầu tiên; giữa năm không tạo phòng (`QĐ-111ba`, R-16). — _Đối chiếu:_ Nội bộ — QĐ',
      },
      {
        heading: 'Ngoại lệ',
        body: 'phòng chưa có Cost Center không nộp được `BM-10` · chưa có Người duyệt chi dùng được ⟹ chờ có kiểm soát · lãnh đạo lấy bớt tiền sau khóa kỳ ⟹ _Giảm Trần năm_ trong phần chưa phân bổ, không đủ thì các phòng _Trả lại_ trước (`QĐ-111ag`) · đổi Cost Center giữa năm ⟹ _Chuyển_, miễn luật sàn (`QĐ-111bh`, R-40).',
      },
      {
        heading: 'Căn cứ',
        body: 'Quy chế tài chính nội bộ; Trần ngân sách phần mềm năm do Ban lãnh đạo giao; nội bộ `QĐ-111z`→`QĐ-111am`, `QĐ-111ba`, `QĐ-111bb`, `QĐ-111bh`, `FR-5.1`, `FR-5.15`→`FR-5.18`. Các tham số 10 % dự phòng, ngưỡng 80 %/100 %, đèn 110 %/70 %, chốt tháng ngày làm việc thứ 5 và các hạn 5 ngày làm việc là mặc định nội bộ do dự án chọn, tham khảo thông lệ (ServiceNow, Zylo, FinOps); không phải chuẩn (DX-21).',
      },
      {
        heading: 'Tham chiếu',
        body: 'QT `4.1`→`4.14`; `BM-10`; sơ đồ `MF-4`, `SBF-11`.',
      },
    ],
    steps: [
      {
        code: '4.7',
        title: 'Quyết phiên bản ngân sách phòng · Người duyệt chi',
        checklist: [
          {
            code: '4.7-01',
            text: 'Người quyết khác người lập phiên bản',
            check: 'SYSTEM',
          },
          {
            code: '4.7-02',
            text: 'Tổng (số cơ sở + dự phòng) các phòng ≤ Trần năm − Dự phòng kho dùng chung',
            check: 'SYSTEM',
          },
          {
            code: '4.7-03',
            text: 'Đã xem đề nghị `BM-10` của trưởng phòng cạnh phiên bản và file giải thích của Finance',
            check: 'PERSON',
          },
          {
            code: '4.7-04',
            text: 'Ngân sách phòng không thấp hơn cam kết sẽ chạy sang năm sau, hoặc phần thiếu đã có cách xử lý trong file',
            check: 'PERSON',
          },
          {
            code: '4.7-05',
            text: 'Dự phòng hợp lý với rủi ro của phòng (mặc định 10 % số cơ sở; khác mặc định có lý do của Finance)',
            check: 'PERSON',
          },
          {
            code: '4.7-06',
            text: 'Phòng mang cờ _phòng không nộp đề nghị_ (nếu có): số chốt từ số liệu nền là hợp lý',
            check: 'PERSON',
          },
        ],
      },
    ],
  },
};
