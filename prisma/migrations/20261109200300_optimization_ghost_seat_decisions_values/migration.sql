-- qd103-ghost-seat-manager-decision Task 1 (1/2): giá trị enum mới. Không dùng được trong cùng transaction nên tách riêng.
-- PAUSED, KEPT, NEGATED, TRANSFER_SEAT_REVOKED đã được khai ở 20261109200100 (không thêm lại).
-- LEFT_TO_EXPIRE: cũng thuộc g3-g4 nhưng quyết định "Thu hồi" quyền sắp hết hạn cần đóng với lý do này (xem TẠM CHỌN ở plan.md).
ALTER TYPE "GhostSeatState" ADD VALUE IF NOT EXISTS 'AWAITING_DECISION';
ALTER TYPE "GhostSeatState" ADD VALUE IF NOT EXISTS 'WAITING_FOR_HEAD';
ALTER TYPE "GhostSeatState" ADD VALUE IF NOT EXISTS 'RETURNED_TO_HEAD';
ALTER TYPE "GhostSeatCloseReason" ADD VALUE IF NOT EXISTS 'EXEMPTED';
ALTER TYPE "GhostSeatCloseReason" ADD VALUE IF NOT EXISTS 'LEFT_TO_EXPIRE';
