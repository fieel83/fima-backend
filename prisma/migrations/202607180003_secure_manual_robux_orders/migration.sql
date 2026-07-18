-- Account-bound Robux orders with server-owned pricing, replay protection,
-- one pending order per account, and atomic license fulfillment linkage.
ALTER TABLE "payment_submissions"
ADD COLUMN "license_id" TEXT,
ADD COLUMN "pricing_version" TEXT,
ADD COLUMN "idempotency_key_hash" TEXT,
ADD COLUMN "pending_key" TEXT;

CREATE UNIQUE INDEX "payment_submissions_idempotency_key_hash_key"
ON "payment_submissions"("idempotency_key_hash");

CREATE UNIQUE INDEX "payment_submissions_pending_key_key"
ON "payment_submissions"("pending_key");

CREATE INDEX "payment_submissions_license_id_idx"
ON "payment_submissions"("license_id");

ALTER TABLE "payment_submissions"
ADD CONSTRAINT "payment_submissions_license_id_fkey"
FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
