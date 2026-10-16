# Translation quality spike: summary

Run date: 2026-10-14. Synthetic fixtures; references are AI drafts (not human gold); one machine. See README.md for definitions and caveats.

Environment: Windows_NT 10.0.26200 (win32 x64), 11th Gen Intel(R) Core(TM) i7-11800H @ 2.30GHz (16 logical CPUs, 15.7 GB RAM), Node v24.0.1, @huggingface/transformers 3.8.1.

## vi-en

| Metric                                       |         raw |   protected |
| -------------------------------------------- | ----------: | ----------: |
| Items                                        |          84 |          84 |
| Corpus chrF                                  |        35.8 |        36.6 |
| Items with all protected terms preserved (%) |        34.3 |       100.0 |
| Meaning checks passed (%)                    |        43.5 |        71.0 |
| negation checks passed (%)                   | 47.4 (n=19) | 73.7 (n=19) |
| approve checks passed (%)                    |  22.2 (n=9) |  55.6 (n=9) |
| reject checks passed (%)                     | 60.0 (n=10) | 80.0 (n=10) |
| revoke checks passed (%)                     | 20.0 (n=10) | 50.0 (n=10) |
| Segments fallen back to original (%)         |         0.0 |        24.2 |
| Silent meaning failures (items)              |          35 |           6 |
| Silent polarity failures (items)             |          29 |           5 |
| Latency p50 per item (ms)                    |         704 |         666 |
| Latency p95 per item (ms)                    |        2746 |        1619 |
| Model load time (s)                          |        3.64 |        3.64 |
| Peak RSS of process (MB)                     |         658 |         658 |

### vi-en raw: per category

| Category   | Items | chrF | Protected preserved % | Meaning passed % | Fallback seg % |
| ---------- | ----: | ---: | --------------------: | ---------------: | -------------: |
| approve    |     9 | 49.3 |                  25.0 |             22.2 |            0.0 |
| code       |     8 | 49.5 |                  50.0 |             20.0 |            0.0 |
| collision  |     3 | 63.7 |                  66.7 |            100.0 |            0.0 |
| date       |    14 | 44.7 |                   7.7 |             40.0 |            0.0 |
| email      |     3 | 43.7 |                   0.0 |             50.0 |            0.0 |
| glossary   |    42 | 44.0 |                  28.6 |             28.6 |            0.0 |
| long       |     4 | 28.5 |                   0.0 |              n/a |            0.0 |
| mixed      |     3 | 43.5 |                  50.0 |             33.3 |            0.0 |
| name       |    17 | 43.4 |                   0.0 |             50.0 |            0.0 |
| negation   |    19 | 49.5 |                  54.5 |             47.4 |            0.0 |
| number     |    12 | 39.9 |                  20.0 |             36.4 |            0.0 |
| plain      |     7 | 57.2 |                   0.0 |             83.3 |            0.0 |
| reject     |    10 | 46.5 |                  66.7 |             60.0 |            0.0 |
| revoke     |    10 | 42.4 |                   0.0 |             20.0 |            0.0 |
| software   |    34 | 48.8 |                  50.0 |             53.6 |            0.0 |
| unaccented |     4 | 16.1 |                  33.3 |              0.0 |            0.0 |

### vi-en protected: per category

| Category   | Items | chrF | Protected preserved % | Meaning passed % | Fallback seg % |
| ---------- | ----: | ---: | --------------------: | ---------------: | -------------: |
| approve    |     9 | 56.7 |                 100.0 |             55.6 |           22.2 |
| code       |     8 | 70.6 |                 100.0 |             80.0 |           12.5 |
| collision  |     3 | 77.1 |                 100.0 |            100.0 |            0.0 |
| date       |    14 | 61.6 |                 100.0 |             80.0 |           17.6 |
| email      |     3 | 79.7 |                 100.0 |            100.0 |            0.0 |
| glossary   |    42 | 49.5 |                 100.0 |             66.7 |           29.8 |
| long       |     4 | 23.7 |                 100.0 |              n/a |          100.0 |
| mixed      |     3 | 55.7 |                 100.0 |            100.0 |           66.7 |
| name       |    17 | 55.9 |                 100.0 |             64.3 |           26.3 |
| negation   |    19 | 46.8 |                 100.0 |             73.7 |           21.1 |
| number     |    12 | 42.7 |                 100.0 |             63.6 |           33.3 |
| plain      |     7 | 59.7 |                 100.0 |             83.3 |            0.0 |
| reject     |    10 | 51.4 |                 100.0 |             80.0 |            8.3 |
| revoke     |    10 | 37.8 |                 100.0 |             50.0 |           50.0 |
| software   |    34 | 48.5 |                 100.0 |             67.9 |           26.8 |
| unaccented |     4 | 30.9 |                 100.0 |             33.3 |           25.0 |

## en-vi

| Metric                                       |         raw |    protected |
| -------------------------------------------- | ----------: | -----------: |
| Items                                        |          84 |           84 |
| Corpus chrF                                  |        28.9 |         40.9 |
| Items with all protected terms preserved (%) |        16.2 |        100.0 |
| Meaning checks passed (%)                    |        33.3 |         88.3 |
| negation checks passed (%)                   | 52.9 (n=17) | 100.0 (n=17) |
| approve checks passed (%)                    |  33.3 (n=9) |   77.8 (n=9) |
| reject checks passed (%)                     |  77.8 (n=9) |  100.0 (n=9) |
| revoke checks passed (%)                     |  22.2 (n=9) |   88.9 (n=9) |
| Segments fallen back to original (%)         |         0.0 |         12.1 |
| Silent meaning failures (items)              |          40 |            1 |
| Silent polarity failures (items)             |          23 |            1 |
| Latency p50 per item (ms)                    |         622 |          756 |
| Latency p95 per item (ms)                    |        1535 |         1493 |
| Model load time (s)                          |        2.15 |         2.15 |
| Peak RSS of process (MB)                     |         653 |          653 |

### en-vi raw: per category

| Category  | Items | chrF | Protected preserved % | Meaning passed % | Fallback seg % |
| --------- | ----: | ---: | --------------------: | ---------------: | -------------: |
| approve   |     9 | 35.0 |                  14.3 |             33.3 |            0.0 |
| code      |     7 | 40.3 |                   0.0 |             33.3 |            0.0 |
| collision |     3 | 70.5 |                  33.3 |            100.0 |            0.0 |
| date      |    13 | 49.9 |                  25.0 |             22.2 |            0.0 |
| email     |     3 | 44.7 |                   0.0 |              0.0 |            0.0 |
| glossary  |    39 | 41.1 |                  15.6 |              0.0 |            0.0 |
| long      |     4 | 14.1 |                   0.0 |              n/a |            0.0 |
| mixed     |     3 | 27.7 |                   0.0 |              0.0 |            0.0 |
| name      |    15 | 42.4 |                   6.7 |             18.2 |            0.0 |
| negation  |    17 | 55.9 |                  42.9 |             52.9 |            0.0 |
| number    |    13 | 39.8 |                  18.2 |              0.0 |            0.0 |
| plain     |    10 | 55.9 |                  50.0 |             88.9 |            0.0 |
| reject    |     9 | 51.7 |                  12.5 |             77.8 |            0.0 |
| revoke    |     9 | 41.8 |                   0.0 |             22.2 |            0.0 |
| software  |    34 | 47.4 |                  20.6 |             28.6 |            0.0 |

### en-vi protected: per category

| Category  | Items | chrF | Protected preserved % | Meaning passed % | Fallback seg % |
| --------- | ----: | ---: | --------------------: | ---------------: | -------------: |
| approve   |     9 | 55.6 |                 100.0 |             77.8 |           11.1 |
| code      |     7 | 72.0 |                 100.0 |            100.0 |            0.0 |
| collision |     3 | 77.3 |                 100.0 |            100.0 |            0.0 |
| date      |    13 | 59.8 |                 100.0 |             77.8 |           12.5 |
| email     |     3 | 82.1 |                 100.0 |            100.0 |            0.0 |
| glossary  |    39 | 60.0 |                 100.0 |             82.0 |           13.6 |
| long      |     4 | 25.8 |                 100.0 |              n/a |          100.0 |
| mixed     |     3 | 57.1 |                 100.0 |             66.7 |           33.3 |
| name      |    15 | 64.7 |                 100.0 |             81.8 |           11.8 |
| negation  |    17 | 65.2 |                 100.0 |            100.0 |            0.0 |
| number    |    13 | 53.2 |                 100.0 |             91.7 |           12.5 |
| plain     |    10 | 58.8 |                 100.0 |            100.0 |            0.0 |
| reject    |     9 | 59.1 |                 100.0 |            100.0 |            0.0 |
| revoke    |     9 | 56.4 |                 100.0 |             88.9 |            9.1 |
| software  |    34 | 59.3 |                 100.0 |             78.6 |           12.2 |

## Worst observed errors, protected mode (automatic ranking; silent = not caught by fallback)

|   # | Direction / mode | Item   | Category | Failure                                                                                              | Source                                                                                | Output                                                                                |
| --: | ---------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
|   1 | en-vi protected  | en-015 | approve  | missing: duyệt \| chấp thuận \| đồng ý \| chấp nhận                                                  | The department head approved the exception for Notion.                                | trưởng phòng tán thành ngoại lệ cho Notion.                                           |
|   2 | vi-en protected  | vi-017 | approve  | missing: approv                                                                                      | Đã duyệt: gia hạn Slack thêm 12 tháng.                                                | Browseed: renew Slack extra 12 Month.                                                 |
|   3 | vi-en protected  | vi-018 | approve  | missing: approv                                                                                      | Chúng tôi chấp thuận đề xuất của Phạm Quỳnh Anh về việc dùng Figma thay cho Adobe XD. | We're accepting the proposition of Phạm Quỳnh Anh on using Figma instead of Adobe XD. |
|   4 | vi-en protected  | vi-019 | approve  | missing: approv                                                                                      | Yêu cầu hợp lệ nên tôi duyệt ngay.                                                    | The request was valid, so I immediately did the review.                               |
|   5 | vi-en protected  | vi-069 | negation | missing: not \| n't \| no \| never \| cannot \| unable \| without \| nobody \| none \| neither       | Yeu cau chua duoc duyet vi thieu ly do chi tiet.                                      | The sour lemur lecom permort because of the tiet.                                     |
|   6 | vi-en protected  | vi-070 | reject   | missing: reject \| declin \| denied \| deny \| refus \| turned down \| not approv \| disapprov \| n… | Truong phong tu choi yeu cau REQ-2026-0042 vi vuot ngan sach.                         | Department head tui yeu suu REQ-2026-0042 vivan sach.                                 |
|   7 | vi-en protected  | vi-067 | glossary | missing: room                                                                                        | Phòng họp tầng 3 đã được đặt cho buổi duyệt ngân sách.                                | The floor conference 3 has been reserved for the budget review.                       |

## Worst observed errors, raw mode (top 10)

|   # | Direction / mode | Item   | Category | Failure                                                                                              | Source                                                                                      | Output                                                                                                                 |
| --: | ---------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
|   1 | en-vi raw        | en-018 | approve  | missing: duyệt \| chấp thuận \| đồng ý \| chấp nhận \| protected term altered: Phạm Quỳnh Anh; Figm… | We approve Phạm Quỳnh Anh's proposal to use Figma instead of Adobe XD.                      | Chúng tôi phê chuẩn đề xuất của Phạm Án An Ninh Quốc Gia Phạm thay vì của người XD.                                    |
|   2 | en-vi raw        | en-034 | revoke   | missing: thu hồi; seat; trưởng phòng \| protected term altered: Đỗ Thế Vinh; Figma                   | The revocation of Đỗ Thế Vinh's Figma seat was confirmed by the department head.            | Việc tái thiết lại ghế của công ty ở Wemhan đã được xác nhận bởi trưởng khoa.                                          |
|   3 | en-vi raw        | en-016 | approve  | missing: duyệt \| chấp thuận \| đồng ý \| chấp nhận; người duyệt chi \| protected term altered: 2,4… | The Spending Approver approved an expense of 2,400,000 VND for the Postman license.         | Hội Phụ trách chi tiêu đã phê chuẩn chi phí cho việc chi trả cho việc đăng ký giấy phép.                               |
|   4 | en-vi raw        | en-029 | revoke   | missing: thu hồi; seat \| protected term altered: Võ Thanh Hà; GitHub                                | Revoke Võ Thanh Hà's GitHub seat because she resigned.                                      | Revoke Võa Thanh Hà ngồi ghế của người dân vì bà ấy đã từ chức.                                                        |
|   5 | en-vi raw        | en-024 | reject   | missing: trưởng phòng \| protected term altered: REQ-2026-0107; Cost Center                          | The department head rejected request REQ-2026-0107: no Cost Center was provided.            | Bộ trưởng bộ phận từ chối yêu cầu ReQ-26-0107: không có trung tâm Chi phí nào được cung cấp.                           |
|   6 | en-vi raw        | en-032 | revoke   | missing: seat \| protected term altered: Hoàng Ngọc Lan; Slack                                       | Hoàng Ngọc Lan moved to Sales, so her old Slack seat must be revoked and a new seat issued. | Hoàng kỳ Ngọc Ngọc La chuyển đến chỗ bán hàng, nên ghế của cô ta phải được thu hồi và một chỗ ngồi mới được phát hành. |
|   7 | vi-en raw        | vi-029 | revoke   | missing: revok \| revocation \| protected term altered: Võ Thanh Hà; GitHub                          | Thu hồi seat GitHub của Võ Thanh Hà vì nghỉ việc.                                           | Returned to seat Ghehub of Wu Qingxia for quitting.                                                                    |
|   8 | vi-en raw        | vi-073 | approve  | missing: approv \| protected term altered: REQ-2026-0042; 15/11/2026                                 | Please approve giúp em yêu cầu REQ-2026-0042 nhé, deadline là 15/11/2026.                   | Please, sweetie, help me with the red-hot 2026-0042, the C.S. is November 15th, 2026.                                  |
|   9 | en-vi raw        | en-015 | approve  | missing: duyệt \| chấp thuận \| đồng ý \| chấp nhận; trưởng phòng \| protected term altered: Notion  | The department head approved the exception for Notion.                                      | Trưởng khoa đã phê chuẩn ngoại lệ cho lễ tôn giáo.                                                                     |
|  10 | en-vi raw        | en-031 | revoke   | missing: bàn giao; phòng \| protected term altered: Adobe Photoshop                                  | The Adobe Photoshop license has been revoked and handed over to the IT department.          | Giấy phép của đài phát thanh đã bị thu hồi và giao cho bộ phận IT.                                                     |

<!-- BEGIN 4.3.1 (generated by tools/summary-431.mjs) -->

## 4.3.1 (shared generate adapter, whole-field fallback)

Run date 2026-10-14. Environment: Windows_NT 10.0.26200 (win32 x64), 11th Gen Intel(R) Core(TM) i7-11800H @ 2.30GHz (16 logical CPUs, 15.7 GB RAM), Node v24.0.1, @huggingface/transformers 4.3.1. Lockfile sha256 `1492a4edda12069377a4972716d869cc51826f2fe077d5a5fb381a36bf3231e5` (@huggingface/transformers 4.3.1, onnxruntime-node 1.30.0, sharp 0.35.5, @huggingface/tokenizers 0.2.0). Synthetic fixtures, AI-draft references (not human gold). "Automatic flags" are keyword / exact-string checks, not a judgement of quality, and nothing here is human reviewed.

### [4.3.1b] final run, after the two polarity-lexicon bug fixes: vi-en, main fixtures

| Metric                                                      |                raw |          protected |
| ----------------------------------------------------------- | -----------------: | -----------------: |
| Fields                                                      |                 84 |                 84 |
| Fields translated (%)                                       |               98.8 |               67.9 |
| Fields fallen back to the exact original (%)                |                1.2 |               32.1 |
| &nbsp;&nbsp;fallback: placeholder (fields)                  |                  0 |                 18 |
| &nbsp;&nbsp;fallback: polarity (fields)                     |                  0 |                  8 |
| &nbsp;&nbsp;fallback: too_long (fields)                     |                  0 |                  0 |
| &nbsp;&nbsp;fallback: max_new_tokens (fields)               |                  0 |                  1 |
| &nbsp;&nbsp;fallback: other (fields)                        |                  1 |                  0 |
| Corpus chrF, all fields (fallback = source text)            |               36.9 |               35.5 |
| chrF, translated fields only                                |               39.7 |               63.9 |
| Protected terms preserved, translated fields (%)            |        33.3 (n=69) |       100.0 (n=49) |
| Automatic flags: keyword check failed on translated fields  |           34 of 83 |            1 of 57 |
| &nbsp;&nbsp;automatic flags, negation items                 |           10 of 19 |            0 of 14 |
| &nbsp;&nbsp;automatic flags, approve items                  |             6 of 9 |             1 of 6 |
| &nbsp;&nbsp;automatic flags, reject items                   |            4 of 10 |             0 of 6 |
| &nbsp;&nbsp;automatic flags, revoke items                   |            8 of 10 |             0 of 5 |
| Automatic flags: protected term altered (translated fields) |                 46 |                  0 |
| Latency per field p50 / p95 (ms)                            |         667 / 1574 |        1015 / 3103 |
| Latency per segment p50 / p95 (ms)                          | 629 / 1189 (n=273) | 966 / 2828 (n=267) |
| Model load (s)                                              |               1.65 |               1.68 |
| Peak RSS of process (MB)                                    |                667 |                585 |

### [4.3.1b] final run, after the two polarity-lexicon bug fixes: en-vi, main fixtures

| Metric                                                      |                raw |          protected |
| ----------------------------------------------------------- | -----------------: | -----------------: |
| Fields                                                      |                 84 |                 84 |
| Fields translated (%)                                       |               98.8 |               83.3 |
| Fields fallen back to the exact original (%)                |                1.2 |               16.7 |
| &nbsp;&nbsp;fallback: placeholder (fields)                  |                  0 |                 13 |
| &nbsp;&nbsp;fallback: polarity (fields)                     |                  0 |                  1 |
| &nbsp;&nbsp;fallback: too_long (fields)                     |                  0 |                  0 |
| &nbsp;&nbsp;fallback: max_new_tokens (fields)               |                  0 |                  0 |
| &nbsp;&nbsp;fallback: other (fields)                        |                  1 |                  0 |
| Corpus chrF, all fields (fallback = source text)            |               32.5 |               39.7 |
| chrF, translated fields only                                |               34.0 |               66.0 |
| Protected terms preserved, translated fields (%)            |        16.4 (n=67) |       100.0 (n=54) |
| Automatic flags: keyword check failed on translated fields  |           40 of 83 |            3 of 70 |
| &nbsp;&nbsp;automatic flags, negation items                 |            8 of 17 |            0 of 17 |
| &nbsp;&nbsp;automatic flags, approve items                  |             6 of 9 |             1 of 8 |
| &nbsp;&nbsp;automatic flags, reject items                   |             2 of 9 |             0 of 9 |
| &nbsp;&nbsp;automatic flags, revoke items                   |             7 of 9 |             0 of 8 |
| Automatic flags: protected term altered (translated fields) |                 56 |                  0 |
| Latency per field p50 / p95 (ms)                            |         652 / 1832 |         999 / 2611 |
| Latency per segment p50 / p95 (ms)                          | 638 / 1106 (n=273) | 939 / 2254 (n=267) |
| Model load (s)                                              |               1.27 |               1.71 |
| Peak RSS of process (MB)                                    |                583 |                550 |

### [4.3.1b] final run, after the two polarity-lexicon bug fixes: vi-en, held-out fixtures (written before the run, no tuning)

| Metric                                                      |                raw |          protected |
| ----------------------------------------------------------- | -----------------: | -----------------: |
| Fields                                                      |                 54 |                 54 |
| Fields translated (%)                                       |              100.0 |               68.5 |
| Fields fallen back to the exact original (%)                |                0.0 |               31.5 |
| &nbsp;&nbsp;fallback: placeholder (fields)                  |                  0 |                  6 |
| &nbsp;&nbsp;fallback: polarity (fields)                     |                  0 |                 10 |
| &nbsp;&nbsp;fallback: too_long (fields)                     |                  0 |                  0 |
| &nbsp;&nbsp;fallback: max_new_tokens (fields)               |                  0 |                  1 |
| &nbsp;&nbsp;fallback: other (fields)                        |                  0 |                  0 |
| Corpus chrF, all fields (fallback = source text)            |               45.9 |               39.7 |
| chrF, translated fields only                                |               45.9 |               59.6 |
| Protected terms preserved, translated fields (%)            |        40.5 (n=37) |       100.0 (n=26) |
| Automatic flags: keyword check failed on translated fields  |           26 of 54 |            2 of 37 |
| &nbsp;&nbsp;automatic flags, negation items                 |            9 of 22 |            1 of 14 |
| &nbsp;&nbsp;automatic flags, approve items                  |            6 of 11 |             0 of 7 |
| &nbsp;&nbsp;automatic flags, reject items                   |            6 of 10 |             1 of 5 |
| &nbsp;&nbsp;automatic flags, revoke items                   |           10 of 11 |             1 of 7 |
| Automatic flags: protected term altered (translated fields) |                 22 |                  0 |
| Latency per field p50 / p95 (ms)                            |         795 / 2227 |         985 / 2212 |
| Latency per segment p50 / p95 (ms)                          | 777 / 1870 (n=180) | 929 / 2185 (n=180) |
| Model load (s)                                              |               2.04 |               2.04 |
| Peak RSS of process (MB)                                    |                543 |                580 |

### [4.3.1b] final run, after the two polarity-lexicon bug fixes: en-vi, held-out fixtures (written before the run, no tuning)

| Metric                                                      |                raw |          protected |
| ----------------------------------------------------------- | -----------------: | -----------------: |
| Fields                                                      |                 51 |                 51 |
| Fields translated (%)                                       |              100.0 |               64.7 |
| Fields fallen back to the exact original (%)                |                0.0 |               35.3 |
| &nbsp;&nbsp;fallback: placeholder (fields)                  |                  0 |                 10 |
| &nbsp;&nbsp;fallback: polarity (fields)                     |                  0 |                  8 |
| &nbsp;&nbsp;fallback: too_long (fields)                     |                  0 |                  0 |
| &nbsp;&nbsp;fallback: max_new_tokens (fields)               |                  0 |                  0 |
| &nbsp;&nbsp;fallback: other (fields)                        |                  0 |                  0 |
| Corpus chrF, all fields (fallback = source text)            |               49.5 |               40.7 |
| chrF, translated fields only                                |               49.5 |               63.5 |
| Protected terms preserved, translated fields (%)            |        30.0 (n=30) |       100.0 (n=18) |
| Automatic flags: keyword check failed on translated fields  |           27 of 51 |            2 of 33 |
| &nbsp;&nbsp;automatic flags, negation items                 |            7 of 19 |            1 of 16 |
| &nbsp;&nbsp;automatic flags, approve items                  |            8 of 11 |             1 of 6 |
| &nbsp;&nbsp;automatic flags, reject items                   |             5 of 8 |             1 of 6 |
| &nbsp;&nbsp;automatic flags, revoke items                   |            9 of 10 |             0 of 5 |
| Automatic flags: protected term altered (translated fields) |                 21 |                  0 |
| Latency per field p50 / p95 (ms)                            |         786 / 1775 |         888 / 2895 |
| Latency per segment p50 / p95 (ms)                          | 730 / 1097 (n=174) | 856 / 1726 (n=171) |
| Model load (s)                                              |               1.83 |               1.87 |
| Peak RSS of process (MB)                                    |                538 |                557 |

### [4.3.1] run 1, before the fixes (kept): vi-en, main fixtures

| Metric                                                      |                raw |          protected |
| ----------------------------------------------------------- | -----------------: | -----------------: |
| Fields                                                      |                 84 |                 84 |
| Fields translated (%)                                       |               98.8 |               66.7 |
| Fields fallen back to the exact original (%)                |                1.2 |               33.3 |
| &nbsp;&nbsp;fallback: placeholder (fields)                  |                  0 |                 18 |
| &nbsp;&nbsp;fallback: polarity (fields)                     |                  0 |                  9 |
| &nbsp;&nbsp;fallback: too_long (fields)                     |                  0 |                  0 |
| &nbsp;&nbsp;fallback: max_new_tokens (fields)               |                  0 |                  1 |
| &nbsp;&nbsp;fallback: other (fields)                        |                  1 |                  0 |
| Corpus chrF, all fields (fallback = source text)            |               36.9 |               35.2 |
| chrF, translated fields only                                |               39.7 |               63.9 |
| Protected terms preserved, translated fields (%)            |        33.3 (n=69) |       100.0 (n=48) |
| Automatic flags: keyword check failed on translated fields  |           34 of 83 |            1 of 56 |
| &nbsp;&nbsp;automatic flags, negation items                 |           10 of 19 |            0 of 13 |
| &nbsp;&nbsp;automatic flags, approve items                  |             6 of 9 |             1 of 6 |
| &nbsp;&nbsp;automatic flags, reject items                   |            4 of 10 |             0 of 6 |
| &nbsp;&nbsp;automatic flags, revoke items                   |            8 of 10 |             0 of 5 |
| Automatic flags: protected term altered (translated fields) |                 46 |                  0 |
| Latency per field p50 / p95 (ms)                            |         697 / 2526 |         559 / 1700 |
| Latency per segment p50 / p95 (ms)                          | 684 / 1611 (n=273) | 536 / 1326 (n=267) |
| Model load (s)                                              |               0.81 |               0.97 |
| Peak RSS of process (MB)                                    |                648 |                569 |

### [4.3.1] run 1, before the fixes (kept): en-vi, main fixtures

| Metric                                                      |                raw |          protected |
| ----------------------------------------------------------- | -----------------: | -----------------: |
| Fields                                                      |                 84 |                 84 |
| Fields translated (%)                                       |               98.8 |               83.3 |
| Fields fallen back to the exact original (%)                |                1.2 |               16.7 |
| &nbsp;&nbsp;fallback: placeholder (fields)                  |                  0 |                 13 |
| &nbsp;&nbsp;fallback: polarity (fields)                     |                  0 |                  1 |
| &nbsp;&nbsp;fallback: too_long (fields)                     |                  0 |                  0 |
| &nbsp;&nbsp;fallback: max_new_tokens (fields)               |                  0 |                  0 |
| &nbsp;&nbsp;fallback: other (fields)                        |                  1 |                  0 |
| Corpus chrF, all fields (fallback = source text)            |               32.5 |               39.7 |
| chrF, translated fields only                                |               34.0 |               66.0 |
| Protected terms preserved, translated fields (%)            |        16.4 (n=67) |       100.0 (n=54) |
| Automatic flags: keyword check failed on translated fields  |           40 of 83 |            3 of 70 |
| &nbsp;&nbsp;automatic flags, negation items                 |            8 of 17 |            0 of 17 |
| &nbsp;&nbsp;automatic flags, approve items                  |             6 of 9 |             1 of 8 |
| &nbsp;&nbsp;automatic flags, reject items                   |             2 of 9 |             0 of 9 |
| &nbsp;&nbsp;automatic flags, revoke items                   |             7 of 9 |             0 of 8 |
| Automatic flags: protected term altered (translated fields) |                 56 |                  0 |
| Latency per field p50 / p95 (ms)                            |         683 / 1581 |         868 / 3203 |
| Latency per segment p50 / p95 (ms)                          | 664 / 1198 (n=273) | 863 / 2003 (n=267) |
| Model load (s)                                              |               1.37 |               2.08 |
| Peak RSS of process (MB)                                    |                572 |                558 |

### [4.3.1] run 1, before the fixes (kept): vi-en, held-out fixtures (written before the run, no tuning)

| Metric                                                      |                raw |          protected |
| ----------------------------------------------------------- | -----------------: | -----------------: |
| Fields                                                      |                 54 |                 54 |
| Fields translated (%)                                       |              100.0 |               63.0 |
| Fields fallen back to the exact original (%)                |                0.0 |               37.0 |
| &nbsp;&nbsp;fallback: placeholder (fields)                  |                  0 |                  6 |
| &nbsp;&nbsp;fallback: polarity (fields)                     |                  0 |                 13 |
| &nbsp;&nbsp;fallback: too_long (fields)                     |                  0 |                  0 |
| &nbsp;&nbsp;fallback: max_new_tokens (fields)               |                  0 |                  1 |
| &nbsp;&nbsp;fallback: other (fields)                        |                  0 |                  0 |
| Corpus chrF, all fields (fallback = source text)            |               45.9 |               37.0 |
| chrF, translated fields only                                |               45.9 |               58.6 |
| Protected terms preserved, translated fields (%)            |        40.5 (n=37) |       100.0 (n=25) |
| Automatic flags: keyword check failed on translated fields  |           26 of 54 |            1 of 34 |
| &nbsp;&nbsp;automatic flags, negation items                 |            9 of 22 |            0 of 11 |
| &nbsp;&nbsp;automatic flags, approve items                  |            6 of 11 |             0 of 7 |
| &nbsp;&nbsp;automatic flags, reject items                   |            6 of 10 |             1 of 5 |
| &nbsp;&nbsp;automatic flags, revoke items                   |           10 of 11 |             0 of 6 |
| Automatic flags: protected term altered (translated fields) |                 22 |                  0 |
| Latency per field p50 / p95 (ms)                            |         587 / 1350 |         639 / 1615 |
| Latency per segment p50 / p95 (ms)                          | 562 / 1256 (n=180) | 616 / 1594 (n=177) |
| Model load (s)                                              |               1.32 |               1.32 |
| Peak RSS of process (MB)                                    |                553 |                556 |

### [4.3.1] run 1, before the fixes (kept): en-vi, held-out fixtures (written before the run, no tuning)

| Metric                                                      |               raw |          protected |
| ----------------------------------------------------------- | ----------------: | -----------------: |
| Fields                                                      |                51 |                 51 |
| Fields translated (%)                                       |             100.0 |               62.8 |
| Fields fallen back to the exact original (%)                |               0.0 |               37.3 |
| &nbsp;&nbsp;fallback: placeholder (fields)                  |                 0 |                 10 |
| &nbsp;&nbsp;fallback: polarity (fields)                     |                 0 |                  9 |
| &nbsp;&nbsp;fallback: too_long (fields)                     |                 0 |                  0 |
| &nbsp;&nbsp;fallback: max_new_tokens (fields)               |                 0 |                  0 |
| &nbsp;&nbsp;fallback: other (fields)                        |                 0 |                  0 |
| Corpus chrF, all fields (fallback = source text)            |              49.5 |               39.0 |
| chrF, translated fields only                                |              49.5 |               62.1 |
| Protected terms preserved, translated fields (%)            |       30.0 (n=30) |       100.0 (n=17) |
| Automatic flags: keyword check failed on translated fields  |          27 of 51 |            2 of 32 |
| &nbsp;&nbsp;automatic flags, negation items                 |           7 of 19 |            1 of 15 |
| &nbsp;&nbsp;automatic flags, approve items                  |           8 of 11 |             1 of 6 |
| &nbsp;&nbsp;automatic flags, reject items                   |            5 of 8 |             1 of 6 |
| &nbsp;&nbsp;automatic flags, revoke items                   |           9 of 10 |             0 of 5 |
| Automatic flags: protected term altered (translated fields) |                21 |                  0 |
| Latency per field p50 / p95 (ms)                            |        662 / 1690 |         676 / 1948 |
| Latency per segment p50 / p95 (ms)                          | 627 / 934 (n=174) | 633 / 1009 (n=168) |
| Model load (s)                                              |              1.28 |               1.28 |
| Peak RSS of process (MB)                                    |               547 |                593 |

### 3.8.1 baseline versus 4.3.1 (main fixtures, tag 4.3.1b)

The baseline pipeline translated per sentence with partial fallback (segments that failed a gate kept the original); 4.3.1 uses whole-field fallback, polarity gate, 128-token segments. Baseline numbers come from the 2026-10-14 result files.

**vi-en**

| Metric                                                       |  3.8.1 raw | 3.8.1 protected |  4.3.1 raw | 4.3.1 protected |
| ------------------------------------------------------------ | ---------: | --------------: | ---------: | --------------: |
| Corpus chrF                                                  |       35.8 |            36.6 |       36.9 |            35.5 |
| Items with all protected terms preserved (%)                 |       34.3 |           100.0 |       34.3 |           100.0 |
| Silent polarity failures (items, keyword check, no fallback) |         29 |               5 |         28 |               1 |
| Fallback (% segments for 3.8.1, % fields for 4.3.1)          |        0.0 |            24.2 |        1.2 |            32.1 |
| Latency per item/field p50 / p95 (ms)                        | 704 / 2746 |      666 / 1619 | 667 / 1574 |     1015 / 3103 |

**en-vi**

| Metric                                                       |  3.8.1 raw | 3.8.1 protected |  4.3.1 raw | 4.3.1 protected |
| ------------------------------------------------------------ | ---------: | --------------: | ---------: | --------------: |
| Corpus chrF                                                  |       28.9 |            40.9 |       32.5 |            39.7 |
| Items with all protected terms preserved (%)                 |       16.2 |           100.0 |       17.6 |           100.0 |
| Silent polarity failures (items, keyword check, no fallback) |         23 |               1 |         23 |               1 |
| Fallback (% segments for 3.8.1, % fields for 4.3.1)          |        0.0 |            12.1 |        1.2 |            16.7 |
| Latency per item/field p50 / p95 (ms)                        | 622 / 1535 |      756 / 1493 | 652 / 1832 |      999 / 2611 |

<!-- END 4.3.1 -->
