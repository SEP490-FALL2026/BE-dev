#!/bin/sh
exec node /app/dist/installation-cli.js \
  --timezone Asia/Ho_Chi_Minh --currency VND \
  --organization-name "Cong ty Thu nghiem Review" \
  --cost-center-code CC-IT --cost-center-name "Khoi Cong nghe" \
  --department-code IT --department-name "Phong Cong nghe Thong tin" \
  --job-title "Chuyen vien Cong nghe" \
  --admin-code SA001 --admin-name "Quan tri Gia lap" --admin-email sa.review@example.test --admin-hire-date 2026-01-05 \
  --it-code IT001 --it-name "Ky thuat Gia lap" --it-email it.review@example.test --it-hire-date 2026-02-02 \
  --operator-reference REVIEW-G0G1-20261014 --environment LOCAL_TEST "$@"
