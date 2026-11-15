import type { InitialPolicy } from './initial-policies.types';

/** POL-SAAS: the text of the first version, from the approved set of policies (`QĐ-112b`, `Bộ chính sách khởi tạo.md` 1.0). */
export const POL_SAAS: InitialPolicy = {
  code: 'POL-SAAS',
  title: 'Chính sách danh mục, mua sắm, chứng từ và kho phần mềm dùng chung',
  applicableRoles: ['IT_ADMIN', 'FINANCE'],
  content: {
    sections: [
      {
        heading: 'Mục đích',
        body: 'chỉ phần mềm đã đánh giá mới vào danh mục; mỗi gói dùng chung có một chủ trách nhiệm, đủ người quản trị; mọi khoản mua có chứng từ hợp lệ và được Finance ký trước khi xuất tiền.',
      },
      {
        heading: 'Phạm vi',
        body: 'đánh giá và đưa phần mềm mới vào danh mục (`SBF-15`), mua, hóa đơn, nguồn tiền (`SBF-19`), kho `K2`/`K4`, thuê bao, admin nhà cung cấp, điểm điều chỉnh (`SBF-20`).',
      },
      {
        heading: 'Vai trò',
        body: 'IT Admin — đánh giá case B, tạo mục, phụ trách thuê bao, mua và nộp hóa đơn; Finance — đối chiếu, ký xác nhận xuất tiền hoặc trả lại; Super Admin — phân công IT Admin phụ trách phòng.',
      },
      {
        heading: 'Quy định',
        body: '1. **Đánh giá case B** do IT Admin làm **sau** khi trưởng phòng duyệt nhu cầu: điều khoản, giá, kiểu cấp, mức kiểm soát, loại dữ liệu; kết luận nội bộ / trả phí / không đủ điều kiện (kèm phương án thay thế); case B rút gọn chỉ đánh giá gói (`QĐ-111a`, `FR-3.19`). — _Đối chiếu:_ Khớp chuẩn · [CSF GV.SC](https://csf.tools/reference/nist-cybersecurity-framework/v2-0/gv/gv-sc/); [CU](https://cu.edu/security/security-guidance-software-service)\n2. **Khai mục mới** = một thao tác tạo ứng dụng + gói; ô _Loại_ = nhóm chức năng bắt buộc (7 nhóm, _Liên lạc_ và _Khác_ cố định); kiểu cấp quyết mô hình giá; giá nhập VND (`QĐ-111d`, `QĐ-111f`, `QĐ-111bf`, `QĐ-111an`, B-5). — _Đối chiếu:_ Nội bộ — QĐ\n3. **Chống trùng:** IT tạo ứng dụng/gói trùng ⟹ bị từ chối kèm mục đã có, Request gắn vào mục đó (`QĐ-111b`, R-25). — _Đối chiếu:_ Tương tự thực tế · [CIS 2.1](https://cas8.docs.cisecurity.org/en/latest/source/Controls2/); [Loughborough](https://lboro.ac.uk/services/it/topics/saas-guide-5-users-or-more/)\n4. **Người phụ trách:** người tạo mục là IT Admin phụ trách, đổi bằng _chuyển phụ trách_; không có Business Owner; mỗi IT Admin phụ trách **tối đa 4 phòng** (`QĐ-111g`, `QĐ-110l`). — _Đối chiếu:_ Khớp chuẩn · [CIS 15.1](https://cas8.docs.cisecurity.org/en/latest/source/Controls15/)\n5. **Kho dùng chung:** mỗi (ứng dụng, gói) `K2`/`K4` là một thuê bao có một IT Admin phụ trách; thuê bao trùng bị chặn khi vận hành; hợp đồng chỉ liên kết thuê bao kho (`C-03`, `QĐ-104k`, `QĐ-111t`). — _Đối chiếu:_ Tương tự thực tế · [Ramp](https://ramp.com/blog/brex-vs-expensify-vs-ramp)\n6. **Hồ sơ thuê bao:** tài khoản công ty sở hữu thuê bao là **email công ty** (vd. `it-saas@cty.vn`), không lưu mật khẩu; danh sách admin nhà cung cấp **≥ 2 IT Admin đang làm việc** với `K2` và `K4` có trang quản trị; < 2 ⟹ cờ, 0 ⟹ hàng việc IT (`QĐ-110k`, `QĐ-110u`, `QĐ-111r`, R-53). — _Đối chiếu:_ Tương tự thực tế · [Google offboarding](https://knowledge.workspace.google.com/admin/users/maintain-data-security-after-an-employee-leaves); [NIST PS-4](https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-4/)\n7. **Cấp từ kho trước khi mua;** số seat thuê bao `K2`/`K4` tăng ⟹ báo IT Admin phụ trách thuê bao, không thêm bước duyệt (`C-13`, `QĐ-110v`, S-4). — _Đối chiếu:_ Tương tự thực tế · [Flexera](https://www.flexera.com/media/pdfs/solution-brief-request-reharvest-servicenow.pdf) (S); [Ramp](https://ramp.com/blog/brex-vs-expensify-vs-ramp)\n8. **Điểm điều chỉnh** (gói tháng 7 ngày trước ngày thanh toán, gói năm 30 ngày trước hạn báo hủy): gia hạn **đúng số seat hệ thống tính**, không seat đệm, chỉ vượt khi nhà cung cấp buộc tối thiểu kèm bằng chứng; không có quyết định _không gia hạn_ khi còn quyền đang gán (`C-12`, `QĐ-104d`). — _Đối chiếu:_ Tương tự thực tế · [Zylo workflows](https://zylo.com/blog/zylo-tips-using-workflows-to-reclaim-unused-saas-licenses)\n9. **Mua và nộp hóa đơn:** IT thực hiện mọi lần mua, nộp **mỗi hóa đơn một đề nghị** kèm yêu cầu tiền trong **5 ngày làm việc**, tick nguồn tiền **Thẻ công ty** hoặc **IT ứng tiền trước**, ghi số VND thực bị trừ, tách tiền hàng và thuế (`QĐ-111u`, `QĐ-111an`, `QĐ-103w`). — _Đối chiếu:_ Nội bộ — QĐ (tách tiền hàng–thuế theo NĐ 70/2025)\n10. **Chứng từ hợp lệ.** Nhà cung cấp trong nước: hóa đơn ghi tên, địa chỉ, mã số thuế của công ty (NĐ 123/2020/NĐ-CP, sửa đổi bởi NĐ 70/2025/NĐ-CP). Nhà cung cấp nước ngoài không phát hành hóa đơn GTGT Việt Nam: lưu hóa đơn/biên nhận của nhà cung cấp, ghi tên công ty khi trang cho phép, theo hướng dẫn của kế toán. Khoản mua từ **5 triệu đồng** trở lên thanh toán không dùng tiền mặt và lưu chứng từ thẻ/chuyển khoản (Luật Thuế GTGT 48/2024/QH15 Điều 14 khoản 2 điểm b; NĐ 181/2025/NĐ-CP Điều 26; NĐ 320/2025/NĐ-CP Điều 9 khoản 1 điểm c). Không chia một lần mua thành nhiều hóa đơn để tránh ngưỡng. Finance kiểm bằng mắt lúc ký (quy định 12), hệ thống không ép (R12B §1, §3). — _Đối chiếu:_ Khớp chuẩn (đã sửa DX-02) · [MOF Hỏi đáp](https://portal.mof.gov.vn/hoidapcstc/home/cthoidap/157371) (BT); [LuatVietnam NĐ 320](https://luatvietnam.vn/tin-van-ban-moi/hoa-don-tu-5-trieu-dong-phai-thanh-toan-khong-tien-mat-de-duoc-tru-thue-tndn-186-106006-article.html) (BT)\n11. **IT ứng tiền trước** chỉ trong phạm vi Request đã duyệt; Request đã duyệt là văn bản giao việc cho IT mua thay công ty. IT thanh toán bằng thẻ hoặc chuyển khoản, không dùng tiền mặt. Công ty hoàn lại bằng chuyển khoản ngoài hệ thống; không có bước IT xác nhận nhận tiền hay danh sách nợ IT. Khoản lặp hằng tháng ưu tiên Thẻ công ty _(đề xuất)_ (`QĐ-111v`; R12B §3). — _Đối chiếu:_ Khớp chuẩn (đã sửa DX-03) · [LuatVietnam NĐ 320](https://luatvietnam.vn/tin-van-ban-moi/hoa-don-tu-5-trieu-dong-phai-thanh-toan-khong-tien-mat-de-duoc-tru-thue-tndn-186-106006-article.html) (BT); [CV 730/TNI-QLDN3](https://thuvienphapluat.vn/cong-van/Thue-Phi-Le-Phi/Cong-van-730-TNI-QLDN3-2026-giai-dap-thu-tuc-thue-Tay-Ninh-696234.aspx) (S)\n12. **Finance** đối chiếu trong 5 ngày làm việc ⟹ **ký xác nhận xuất tiền** (cả hai nguồn tiền) hoặc trả lại kèm lý do; người nộp và người ký là hai người khác nhau; thực chi vào tháng của kỳ dịch vụ (`QĐ-111u`, `QĐ-111w`, `SoD-3`). — _Đối chiếu:_ Khớp chuẩn · [NIST AC-5](https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-5/); [GAO](https://dof.ca.gov/media/docs/budget/Standards-for-Internal-Control-in-the-Federal-Government.pdf)\n13. Hóa đơn trùng (nhà cung cấp + số hóa đơn) bị chặn lúc nộp; lệch số lượng/đơn giá theo tiền gốc ⟹ xác nhận theo số đã nhận và mở `SBF-11a` song song; gói tháng quá 5 ngày làm việc sau ngày thanh toán chưa có hóa đơn ⟹ cờ (`QĐ-111x`, R-30, R-44). — _Đối chiếu:_ Nội bộ — QĐ\n14. **Không** nhập sao kê; bằng chứng ngoài là hóa đơn nhà cung cấp và danh sách tài khoản xuất từ trang quản trị (`QĐ-111y`). — _Đối chiếu:_ Nội bộ — QĐ',
      },
      {
        heading: 'Ngoại lệ',
        body: 'thuê bao trùng chỉ được ghi ở bước khởi tạo, kèm cảnh báo _nên gộp_ (`SBF-01`) · thuê bao cũ thiếu email sở hữu hoặc admin ⟹ gắn cờ, không chặn (`QĐ-110` G3) · Finance xác nhận hóa đơn có người thụ hưởng là chính mình ⟹ cờ audit (`QĐ-104h`) · `K1` không thuộc kho: gói tháng gắn email từng người.',
      },
      {
        heading: 'Căn cứ',
        body: 'Luật Thuế GTGT số 48/2024/QH15; Nghị định 181/2025/NĐ-CP (khấu trừ GTGT); Nghị định 320/2025/NĐ-CP (chi phí được trừ TNDN); Nghị định 123/2020/NĐ-CP sửa đổi bởi Nghị định 70/2025/NĐ-CP (hóa đơn, chứng từ). Nhãn _(đề xuất)_ ở quy định 10 và 11 (trừ vế khoản lặp ưu tiên Thẻ công ty) bỏ theo QĐ ban hành bộ chính sách (DX-02, DX-03), đã ghi sổ `QĐ-112c` (Docs `Bộ chính sách khởi tạo.md` 1.0). Nội bộ `QĐ-103l`, `QĐ-103w`, `QĐ-104d`, `QĐ-104k`, `QĐ-110k`, `QĐ-110l`, `QĐ-110u`, `QĐ-110v`, `QĐ-111b`→`QĐ-111g`, `QĐ-111r`, `QĐ-111t`→`QĐ-111y`, `FR-1.1`, `FR-1.9`, `FR-3.19`, `FR-5.3`, `FR-5.4`.',
      },
      {
        heading: 'Tham chiếu',
        body: 'QT `1.3`, C.1, C.2; `BM-02`, `BM-05`.',
      },
    ],
    steps: [
      {
        code: '1.3',
        title: 'Đánh giá phần mềm mới (case B) · IT Admin',
        checklist: [
          {
            code: '1.3-01',
            text: 'Trưởng phòng đã duyệt nhu cầu trước bước đánh giá',
            check: 'SYSTEM',
          },
          {
            code: '1.3-02',
            text: 'Không trùng mục đã có (tên chuẩn hóa, tên miền trang chủ); trùng thì Request đã gắn vào mục đã có',
            check: 'SYSTEM',
          },
          {
            code: '1.3-03',
            text: 'Không có phần mềm trong danh mục đáp ứng cùng nhu cầu với chi phí thấp hơn',
            check: 'PERSON',
          },
          {
            code: '1.3-04',
            text: 'Điều khoản nhà cung cấp cho phép dùng cho doanh nghiệp và cách cấp dự kiến (mỗi người một tài khoản, không dùng chung đăng nhập); khi ngừng dùng, công ty xuất được dữ liệu của mình và yêu cầu nhà cung cấp xóa được dữ liệu',
            check: 'PERSON',
          },
          {
            code: '1.3-05',
            text: 'Đã xác định loại dữ liệu đưa vào; dữ liệu cá nhân hoặc thông tin mật chỉ khi nhà cung cấp có bằng chứng bảo mật (chứng nhận SOC 2/ISO 27001 hoặc điều khoản xử lý dữ liệu)',
            check: 'PERSON',
          },
          {
            code: '1.3-06',
            text: 'Kiểm soát được: có trang quản trị hoặc xuất được danh sách thành viên/usage; tài khoản quản trị dùng SSO hoặc MFA nếu nhà cung cấp hỗ trợ',
            check: 'PERSON',
          },
          {
            code: '1.3-07',
            text: 'Kiểu cấp đúng bản chất (`K1` gói tháng cá nhân; `K2`/`K4` kho dùng chung; `K4` chỉ khóa vĩnh viễn, đã tick _có trang quản trị_ nếu có)',
            check: 'PERSON',
          },
          {
            code: '1.3-08',
            text: 'Giá gói hoặc báo giá còn hiệu lực, bằng VND (`K2`: giá tháng quy đổi), đã đối chiếu với nguồn của nhà cung cấp',
            check: 'PERSON',
          },
        ],
      },
    ],
  },
};
