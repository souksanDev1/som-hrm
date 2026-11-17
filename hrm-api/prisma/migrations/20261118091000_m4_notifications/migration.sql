-- M4 notifications (FR-NOTI-01.1 push receipts, FR-NOTI-02.3 per-recipient SMS text) on the delivery outbox.
-- Only new nullable columns on an existing table: its RLS policy (tenant_isolation) is unchanged, no data is rewritten.

-- AlterTable
ALTER TABLE "NotificationDelivery" ADD COLUMN     "message" TEXT,
ADD COLUMN     "pushTickets" JSONB,
ADD COLUMN     "receiptsCheckedAt" TIMESTAMP(3);
