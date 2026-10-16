# Spike cô lập: dịch EN–VI

Code nghiên cứu, **không phải code product**. Spike không import gì từ `src/` và không nằm trong gate của product: Jest chỉ quét `src`/`test`, ESLint quét `{src,test,scripts}`, `tsc` không include `docs/`. Mỗi thư mục con có README riêng, ghi lệnh tái chạy, evidence đã lọc và giới hạn.

| Thư mục                      | Người viết / review          | Nội dung                                                                                                        |
| ---------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [deps](deps/README.md)       | Sonnet 5.5 / Opus 5.5 review | T-1: audit, ma trận 3.8.1/4.3.1/A1, Linux install + smoke `--network none`, parity, regression `>>vie<<`        |
| [quality](quality/README.md) | Sonnet 5.5 / Opus 5.5 review | Benchmark 2 × 84 câu giả lập, raw và có bảo vệ; chrF (đối chiếu sacreBLEU), kiểm nghĩa/cực tính, ngưỡng đề xuất |
| [runtime](runtime/README.md) | Sonnet 5.5 / Opus 5.5 review | T-2/T-5: tiến trình con, supervisor, single-flight, cache, đo trên Linux                                        |

## Trạng thái 15/10/2026

- `quality/lib/generate-adapter.mjs` là adapter dùng chung cho cả quality và runtime. Chỉ quality là writer; runtime import read-only.
  - Adapter tra id token ngôn ngữ từ vocab, fail closed, gọi `model.generate` với `forced_eos_token_id: null` và trả `finishReason`.
- Kết quả vòng cuối trên 4.3.1 là **âm tính**: vi→en không đạt, en→vi chưa đạt để bật. Xem [research](../research.md#vòng-cuối-trên-431-15102026).
- Baseline 3.8.1 được giữ nguyên trong `quality/results/`; kết quả 4.3.1 nằm ở các file riêng (`4.3.1`, `4.3.1b`).
- `runtime/run-linux.sh` dùng run id và label, từ chối ghi đè volume, không xóa `spike-runtime-deps`. Volume này giữ lại từ 14/10 và chỉ được mount read-only.

## Quy ước

- **Dependency:** chỉ cài trong scratch, không cài vào `node_modules` của product, với `--ignore-scripts`. Mỗi runner nhận đường dẫn qua biến môi trường mô tả trong README của nó: thư mục chứa `node_modules/@huggingface/transformers` và thư mục model.
- **Model:** dùng read-only từ `.models/translation` (ignore, không commit) với revision đã pin. Hash đã khớp nguồn Hugging Face công bố ([research T-6](../research.md#t-6--toàn-vẹn-offline-đóng-gói)). Spike không tải model mới. Muốn có model trên checkout sạch, chạy `node scripts/dev/download-translation-models.mjs` từ gốc BE (script của phiên khác, chưa commit), rồi đối chiếu hash với bảng ở research.
- **Dữ liệu:** chỉ dữ liệu giả lập. Evidence không chứa đường dẫn home, secret hay lockfile lớn.
- **Kết luận:** coordinator đã kiểm và tổng hợp vào [research](../research.md) và [spec](../spec.md). Spike không thay review của dev hay test của implementation.
