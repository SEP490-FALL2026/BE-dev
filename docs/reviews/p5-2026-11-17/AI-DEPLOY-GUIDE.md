# Hướng dẫn deploy AI service (Modal) rồi nối BE

AI service dùng bản WDP: repo `WDP301-FA26-GR8/AI-service`, nhánh `main` (đã có commit `9da11e1`). Cùng một service phục vụ cả
BE WDP lẫn BE đồ án. Model Qwen3.5-4B Q4_K_M (GGUF) chạy trên GPU L4 của Modal. Phần front chạy CPU, kiểm Bearer token rồi mới
đánh thức GPU.

## 0. Chuẩn bị (một lần)
- Có tài khoản Modal (modal.com) và đã có credit GPU.
- Cài `uv`:
  - Windows PowerShell: `powershell -c "irm https://astral.sh/uv/install.ps1 | iex"`
  - Git Bash: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Tự sinh một token bí mật, ví dụ `openssl rand -hex 32`. Token này phải **giống hệt** ở Modal và ở BE. Không commit, không dán vào chat.

## 1. Lấy code sạch
Thư mục `Code/Ai-service-WDP` đang cũ hơn `origin/main` và có file sửa dở, nên clone mới ra một thư mục riêng:
```bash
git clone git@github.com:WDP301-FA26-GR8/AI-service.git ai-service-deploy
cd ai-service-deploy
uv sync
```
Kiểm nhanh không cần GPU (tùy chọn): `uv run pytest -q --basetemp=./.pytest_temp`

## 2. Đăng nhập Modal và tạo secret
```bash
uv run modal setup                                                     # mở trình duyệt để đăng nhập
uv run modal secret create saas-sentry-ai AI_SERVICE_TOKEN=<token-bí-mật>
```
- Muốn đổi token về sau: `uv run modal secret create saas-sentry-ai AI_SERVICE_TOKEN=<token-mới> --force`, rồi deploy lại và sửa
  `.env.app` trên VPS.

## 3. Tải model vào Volume (một lần, vài phút)
```bash
uv run modal run modal_app.py::download_model --model qwen3.5-4b-q4_k_m
```
Lệnh tạo Volume `saas-sentry-models` và ghi file GGUF cùng `model-manifest.json`.

## 4. Deploy
```bash
# Ngày demo: giữ 1 GPU ấm để lần gọi đầu không phải chờ khởi động lạnh (~110 s). Tốn credit liên tục, tắt sau buổi demo.
AI_DEMO_WARM=1 uv run modal deploy modal_app.py
# Ngày thường: GPU tự tắt sau 60 s không dùng.
uv run modal deploy modal_app.py
```
- Trên PowerShell, đặt biến môi trường bằng `$env:AI_DEMO_WARM="1"; uv run modal deploy modal_app.py`.
- **KHÔNG** deploy bằng `AI_DEPLOY_GPU=0`. Cấu hình đó chỉ chạy câu mẫu (stub). BE prompt 5 sẽ từ chối câu stub: lần gọi kết thúc
  `FAILED`, mã `AI.PROVIDER_UNAVAILABLE`.
- Lệnh deploy in ra URL dạng `https://<workspace>--saas-sentry-ai-web.modal.run`. Ghi lại URL này.

## 5. Kiểm service
```bash
curl https://<workspace>--saas-sentry-ai-web.modal.run/healthz
```
- Kết quả mong đợi: JSON có `modelId` là tên model Qwen, **không phải** `stub`.
- Có thể gọi `POST /v1/warmup` để đánh thức GPU trước buổi demo.
- Theo dõi log và chi phí ở dashboard Modal, app `saas-sentry-ai`.

## 6. Nối BE (VPS)
Thêm vào `.env.app` trên VPS, cạnh các biến MongoDB của WDP:
```
AI_SERVICE_BASE_URL=https://<workspace>--saas-sentry-ai-web.modal.run
AI_SERVICE_TOKEN=<token-bí-mật giống bước 2>
AI_SERVICE_TIMEOUT_MS=120000
```
- `120000` ms vì hạn của service là 105 s và GPU khởi động lạnh mất khoảng 110 s.
- Deploy BE (merge `main` của repo WDP). Khi API đã lên, Super Admin vào màn **Tham số vận hành**:
  1. bật `AI_ENABLED` = `ON` và `AI_ACCESS_REQUEST_SUMMARY_ENABLED` = `ON`;
  2. đặt `AI_PROVIDER_MODE` = `MODEL` (mặc định là `SIMULATED`, chỉ trả câu giả lập có nhãn).
- Thử: đăng nhập trưởng phòng hoặc Người duyệt chi có hàng chờ, mở **tóm tắt AI**. Lần đầu có thể mất tới ~2 phút nếu GPU đang tắt.
  Super Admin xem lịch sử gọi AI ở màn lịch sử AI.

## 7. Sự cố thường gặp
| Hiện tượng | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| BE báo dịch vụ AI không khả dụng | URL hoặc token sai, hoặc GPU đang khởi động | Kiểm `/healthz`; token ở Modal và `.env.app` phải trùng nhau |
| Câu trả lời có nhãn *Giả lập* | `AI_PROVIDER_MODE` còn `SIMULATED` | Super Admin đổi sang `MODEL` |
| `FAILED` với `AI.PROVIDER_UNAVAILABLE` ngay khi gọi | Service đang chạy stub (`modelId: stub`) | Deploy lại không kèm `AI_DEPLOY_GPU=0`, kiểm Volume đã có model |
| Hết thời gian chờ ở lần gọi đầu | GPU khởi động lạnh | Deploy với `AI_DEMO_WARM=1`, hoặc gọi `/v1/warmup` trước |

## 8. Sau buổi demo
Deploy lại không có `AI_DEMO_WARM=1` để GPU tự tắt, tránh tốn credit.
