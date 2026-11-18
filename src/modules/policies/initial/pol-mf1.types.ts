import type { InitialPolicy } from './initial-policies.types';

/** POL-MF1: the text of the first version, from the approved set of policies (`QĐ-112b`, `Bộ chính sách khởi tạo.md` 1.0). */
export const POL_MF1: InitialPolicy = {
  code: 'POL-MF1',
  title: 'Chính sách cấp phát quyền dùng phần mềm',
  applicableRoles: ['MANAGER', 'SPENDING_APPROVER', 'IT_ADMIN'],
  content: {
    sections: [
      {
        heading: 'Mục đích',
        body: 'nhân viên có đúng công cụ cho công việc hiện tại, trên tài khoản công ty, với chi phí đã được người có thẩm quyền duyệt và ghi khoản cam kết. Ba quyết định, ba vai: nhu cầu — Trưởng phòng; chi — Người duyệt chi; kỹ thuật — IT Admin.',
      },
      {
        heading: 'Phạm vi',
        body: 'mọi Request cấp mới (case A/B) và tiếp tục sử dụng, cá nhân hoặc nhóm, từ lúc gửi tới khi tác vụ cấp hoàn tất (`MF-1`).',
      },
      {
        heading: 'Vai trò',
        body: 'Trưởng phòng — quyết nhu cầu, trình lô, xác nhận dùng dự phòng; Người duyệt chi — duyệt chi từng Request hoặc cả lô; IT Admin — đánh giá case B (`POL-SAAS`), chọn nguồn cấp và cấp; Hệ thống — tính tiền, kiểm ngân sách, giới hạn.',
      },
      {
        heading: 'Quy định',
        body: '1. **Một form _Xin phần mềm_, tìm danh mục trước:** case A — gói đã có (kể cả chỉ phòng khác dùng) ⟹ cấp từ kho cho từng người; case B — cả công ty chưa có ⟹ Trưởng phòng duyệt nhu cầu ⟹ IT đánh giá ⟹ ngân sách ⟹ Người duyệt chi; ứng dụng có mà gói chưa có ⟹ case B rút gọn (`QĐ-111a`, `FR-3.4`). — _Đối chiếu:_ Tương tự thực tế · [Loughborough](https://lboro.ac.uk/services/it/topics/saas-guide-5-users-or-more/); [ServiceNow community](https://www.servicenow.com/community/sam-articles/sam-office-hours-q-amp-a-april-2026-emea-apac-session/ta-p/3576818) (S)\n2. **Kiểm trùng ở cửa case B:** tên chuẩn hóa hoặc tên miền trang chủ khớp mục đã có ⟹ từ chối kèm mục đã có, người xin chuyển sang case A (`QĐ-111b`). — _Đối chiếu:_ Tương tự thực tế · [CIS 2.1](https://cas8.docs.cisecurity.org/en/latest/source/Controls2/); [Loughborough](https://lboro.ac.uk/services/it/topics/saas-guide-5-users-or-more/)\n3. **Ai gửi:** mọi tài khoản trừ Super Admin, Người duyệt chi và nhân viên chưa xếp phòng; Request cho một người chỉ do chính người đó gửi; Trưởng phòng gửi nhóm từ 2 người, không gồm mình; Employee gửi nhóm tối đa 10 người cùng phòng, không gồm Trưởng phòng (`QĐ-103b`, `QĐ-100t`, `QĐ-100aa`, `QĐ-103u`). — _Đối chiếu:_ Nội bộ — QĐ\n4. **Giới hạn:** `GH-1`, `GH-2` (10 Request cấp mới/tuần lịch) kiểm khi gửi với từng người thụ hưởng; không còn `GH-3`; Request nhóm vi phạm ở dòng nào thì trả về cả danh sách, không gửi một phần (`C-19`, `QĐ-111h`, `QĐ-106g`). — _Đối chiếu:_ Nội bộ — QĐ\n5. **_Thời gian dùng_ (số tháng):** `K1` bắt buộc 1–9 tháng · `K2`/`K5` 1–12 tháng hoặc _Dùng lâu dài_ · `K4` không hỏi; nhà thầu/thực tập vượt ngày hết hợp đồng ⟹ tự cắt tại ngày đó, mỗi tháng đã bắt đầu tính một tháng (`QĐ-111i`, `FR-2.8`, R-38, R-39). — _Đối chiếu:_ Tương tự thực tế · [Zluri](https://help.zluri.com/docs/access-request-workflows)\n6. **Gói cá nhân `K1` chỉ mua kỳ trả tháng:** chỉ mua gói **tháng** trên email công ty của chính người dùng, không mua gói năm cho cá nhân, tối đa 9 tháng mỗi Request và mỗi lần tiếp tục; nhu cầu dài hạn hoặc nhiều người cùng phần mềm ⟹ ưu tiên gói Team/Business trong kho dùng chung `K2` có trang quản trị (`C-11`, `QĐ-103d`, `QĐ-108a`, `QĐ-111i`; thông lệ R12B §1). — _Đối chiếu:_ Nội bộ — QĐ (đã sửa DX-20)\n7. **Số tiền** = giá tháng × số tháng × số người, giá gốc chưa thuế, bằng VND; phần thuộc năm sau hiện sẵn và **lưu lúc duyệt** (`C-08`, `QĐ-111j`, `QĐ-111k`, `QĐ-111an`). — _Đối chiếu:_ Nội bộ — QĐ\n8. **Định tuyến:** Request trả phí của Trưởng phòng không vào lô, Người duyệt chi quyết một bước; phòng chưa có Trưởng phòng ⟹ Request trả phí và case B đứng chờ; phần mềm nội bộ không phí đã có trong danh mục của Trưởng phòng hoặc phòng chưa có Trưởng phòng ⟹ IT cấp thẳng, cờ audit (`QĐ-103b`, `QĐ-103o`, `QĐ-110i`, `QĐ-111bc`, R-43). — _Đối chiếu:_ Nội bộ — QĐ\n9. **Kiểm tra ngân sách ba kết quả:** trong số cơ sở ⟹ Người duyệt chi · vượt số cơ sở còn trong dự phòng ⟹ Trưởng phòng xác nhận kèm một dòng lý do · vượt dự phòng, chưa có ngân sách hiệu lực hoặc báo giá hết hạn ⟹ **chặn**; không override; kiểm lại lúc duyệt (`C-09`, `FR-3.20`, `QĐ-100u`). — _Đối chiếu:_ Tương tự thực tế · [Oracle Fusion](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25c/fapma/budgetary-control-and-encumberance-accounting.html) (S); [Infor LN](https://docs.infor.com/ln/2024.x/en-us/lnolh/tfbgcug/tdom000022.html) (S)\n10. **Checklist** ở `1.2`, `1.6`, `1.7`: phải trả lời hết, tất cả _Có_ mới duyệt được; lô và Request nhóm dùng một bộ trả lời ghi vào từng Request; quyết định lưu câu trả lời và số phiên bản chính sách (`QĐ-111ap`, `QĐ-111aq`, `QĐ-111be`, `FR-8.13`). — _Đối chiếu:_ Nội bộ — QĐ; phần lưu vết · [ISO A.5.18](https://www.isms.online/iso-27001/annex-a-2022/5-18-access-rights-2022/) (TT)\n11. **Cấp từ kho trước khi mua:** IT Admin phụ trách phòng người nhận gán seat/khóa _Trống_ cùng gói; kho hết ⟹ mua thêm trong phạm vi đã duyệt; `K1` cấp theo checklist `K1` trong thẻ việc (email chính chủ; email/số điện thoại khôi phục và MFA nếu có chỉ dùng phương thức do công ty kiểm soát, không gắn số điện thoại, email hay ứng dụng xác thực cá nhân — `POL-GEN` quy định 3) và bằng chứng (`C-13`, `QĐ-111m`, `QĐ-111az`). — _Đối chiếu:_ Tương tự thực tế (đã sửa DX-01) · [Flexera](https://www.flexera.com/media/pdfs/solution-brief-request-reharvest-servicenow.pdf) (S); [CIS 6](https://cas8.docs.cisecurity.org/en/latest/source/Controls6/)\n12. **Tiếp tục sử dụng:** chỉ cho quyền có thời hạn, cùng gói, cửa sổ 30 ngày trước ngày hết; không tính `GH-2`; duyệt trước hạn ⟹ giữ seat, không mở thu hồi (`QĐ-111l`, `FR-3.22`). — _Đối chiếu:_ Nội bộ — QĐ; cơ chế gần · [Zluri](https://help.zluri.com/docs/access-request-workflows)\n13. **Hạn:** mỗi bước duyệt 2 ngày làm việc, cấp 2 ngày làm việc sau duyệt cuối; quá hạn chỉ nhắc, không tự quyết (`FR-3.8`, `QĐ-100j`, `QĐ-94j`). — _Đối chiếu:_ Nội bộ — QĐ',
      },
      {
        heading: 'Ngoại lệ',
        body: 'quyền theo vai của Super Admin, Người duyệt chi (`QĐ-104g`) · Request xin lại trong ân hạn điều chuyển không bị `GH-1`/`GH-2` chặn (`QĐ-110q`) · seat còn trong ân hạn thu hồi được mua thay khi chờ sẽ vượt SLA, IT ghi lý do (`C-13`) · Request đã duyệt chưa cấp tới 31/12 không hết hiệu lực (`C-10`).',
      },
      {
        heading: 'Căn cứ',
        body: 'Quy chế tài chính nội bộ; nội bộ `QĐ-103b`, `QĐ-103o`, `QĐ-110i`, `QĐ-111a`→`QĐ-111c`, `QĐ-111h`→`QĐ-111m`, `QĐ-111ap`, `QĐ-111aq`, `FR-3.2`→`FR-3.4`, `FR-3.20`→`FR-3.23`, `FR-8.13`.',
      },
      {
        heading: 'Tham chiếu',
        body: 'QT `1.1`→`1.11`; `BM-01`, `BM-02`; sơ đồ `MF-1`, `SBF-15`, `SBF-17`, `SBF-19`.',
      },
    ],
    steps: [
      {
        code: '1.2',
        title: 'Xác nhận nhu cầu · Trưởng phòng',
        checklist: [
          {
            code: '1.2-01',
            text: 'Người quyết là trưởng phòng hiệu lực của phòng người yêu cầu và không phải người thụ hưởng',
            check: 'SYSTEM',
          },
          {
            code: '1.2-02',
            text: 'Không người thụ hưởng nào vướng `GH-1`/`GH-2`; phần mềm case B không trùng mục đã có',
            check: 'SYSTEM',
          },
          {
            code: '1.2-03',
            text: 'Phòng có Cost Center hiện hành; số tiền và cam kết về Cost Center của chính phòng này',
            check: 'SYSTEM',
          },
          {
            code: '1.2-04',
            text: 'Nhu cầu gắn với công việc hiện tại của từng người thụ hưởng (đặc quyền tối thiểu)',
            check: 'PERSON',
          },
          {
            code: '1.2-05',
            text: 'Công cụ người thụ hưởng đang có và danh sách phần mềm của phòng không đáp ứng được nhu cầu này',
            check: 'PERSON',
          },
          {
            code: '1.2-06',
            text: 'Gói và _Thời gian dùng_ không vượt nhu cầu (`K1` là gói tháng; hệ thống đã giới hạn 1–9 tháng)',
            check: 'PERSON',
          },
          {
            code: '1.2-07',
            text: 'Đã xem lịch sử quyền của người thụ hưởng với phần mềm này (Request tiếp tục: Request cũ được liên kết)',
            check: 'PERSON',
          },
        ],
      },
      {
        code: '1.6',
        title: 'Xác nhận dùng dự phòng · Trưởng phòng',
        checklist: [
          {
            code: '1.6-01',
            text: 'Số tiền vượt số cơ sở nhưng còn trong dự phòng của phòng',
            check: 'SYSTEM',
          },
          {
            code: '1.6-02',
            text: 'Người xác nhận không phải người thụ hưởng của Request',
            check: 'SYSTEM',
          },
          {
            code: '1.6-03',
            text: 'Đã xem phần vượt, phần dự phòng còn lại sau khi dùng và đèn ngân sách của phòng',
            check: 'PERSON',
          },
          {
            code: '1.6-04',
            text: 'Đã cân nhắc giảm số người, số tháng, số lượng mà vẫn không đáp ứng được nhu cầu',
            check: 'PERSON',
          },
          {
            code: '1.6-05',
            text: 'Nhu cầu không thể chờ tới khi Finance lập điều chỉnh ngân sách hoặc tới năm sau',
            check: 'PERSON',
          },
        ],
      },
      {
        code: '1.7',
        title: 'Duyệt chi · Người duyệt chi',
        checklist: [
          {
            code: '1.7-01',
            text: 'Người duyệt chi không phải người yêu cầu hay người thụ hưởng',
            check: 'SYSTEM',
          },
          {
            code: '1.7-02',
            text: 'Số tiền tính từ giá gói hoặc báo giá còn hiệu lực, giá gốc chưa thuế, bằng VND',
            check: 'SYSTEM',
          },
          {
            code: '1.7-03',
            text: 'Kiểm lại lúc duyệt: trong số cơ sở, hoặc dùng dự phòng đã được Trưởng phòng xác nhận (Request một bước: cờ đã hiện)',
            check: 'SYSTEM',
          },
          {
            code: '1.7-04',
            text: 'Đã xem nhu cầu đã xác nhận (Request một bước: lý do của người yêu cầu) và lý do dùng dự phòng nếu có',
            check: 'PERSON',
          },
          {
            code: '1.7-05',
            text: 'Đã xem mức kiểm soát và kết luận đánh giá của IT cho gói; chấp nhận rủi ro còn lại theo kết luận của IT',
            check: 'PERSON',
          },
          {
            code: '1.7-06',
            text: 'Đã xem số tiền năm nay, số tiền năm sau và cảnh báo mềm (nếu qua năm), tiền trả nhà cung cấp cả năm (nếu lần đầu mua gói năm)',
            check: 'PERSON',
          },
          {
            code: '1.7-07',
            text: 'Kiểu cấp hợp lý về chi phí: `K1` cho nhu cầu cá nhân ngắn hạn; nhu cầu dài hạn hoặc nhiều người đã cân nhắc kho dùng chung `K2`',
            check: 'PERSON',
          },
        ],
      },
    ],
  },
};
