ALTER TABLE "licenses"
  ADD COLUMN IF NOT EXISTS "validation_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "download_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_validated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_downloaded_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "country" TEXT,
  ADD COLUMN IF NOT EXISTS "locale" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

CREATE TABLE IF NOT EXISTS "customers" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "total_spent" INTEGER NOT NULL DEFAULT 0,
  "total_orders" INTEGER NOT NULL DEFAULT 0,
  "first_purchase_at" TIMESTAMP(3),
  "last_purchase_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "validation_logs" (
  "id" TEXT NOT NULL,
  "license_id" TEXT,
  "license_key" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "reason" TEXT,
  "hwid_hash" TEXT,
  "app_version" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "validation_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "download_logs" (
  "id" TEXT NOT NULL,
  "license_id" TEXT,
  "license_key" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "reason" TEXT,
  "version" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "download_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" TEXT NOT NULL,
  "stripe_event_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "error_message" TEXT,
  "related_order_id" TEXT,
  "related_license_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "plan" TEXT,
  "amount" INTEGER,
  "currency" TEXT,
  "mode" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "coupons" (
  "id" TEXT NOT NULL,
  "stripe_promotion_code_id" TEXT,
  "code" TEXT NOT NULL,
  "percent_off" INTEGER,
  "amount_off" INTEGER,
  "currency" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expires_at" TIMESTAMP(3),
  "max_redemptions" INTEGER,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customers_email_key" ON "customers"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_stripe_event_id_key" ON "webhook_events"("stripe_event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_key" ON "coupons"("code");

CREATE INDEX IF NOT EXISTS "licenses_hwid_idx" ON "licenses"("hwid");
CREATE INDEX IF NOT EXISTS "licenses_expires_at_idx" ON "licenses"("expires_at");
CREATE INDEX IF NOT EXISTS "orders_currency_idx" ON "orders"("currency");
CREATE INDEX IF NOT EXISTS "orders_mode_idx" ON "orders"("mode");
CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders"("created_at");
CREATE INDEX IF NOT EXISTS "validation_logs_license_id_idx" ON "validation_logs"("license_id");
CREATE INDEX IF NOT EXISTS "validation_logs_license_key_idx" ON "validation_logs"("license_key");
CREATE INDEX IF NOT EXISTS "validation_logs_result_reason_idx" ON "validation_logs"("result", "reason");
CREATE INDEX IF NOT EXISTS "validation_logs_created_at_idx" ON "validation_logs"("created_at");
CREATE INDEX IF NOT EXISTS "download_logs_license_id_idx" ON "download_logs"("license_id");
CREATE INDEX IF NOT EXISTS "download_logs_license_key_idx" ON "download_logs"("license_key");
CREATE INDEX IF NOT EXISTS "download_logs_result_reason_idx" ON "download_logs"("result", "reason");
CREATE INDEX IF NOT EXISTS "download_logs_created_at_idx" ON "download_logs"("created_at");
CREATE INDEX IF NOT EXISTS "webhook_events_type_idx" ON "webhook_events"("type");
CREATE INDEX IF NOT EXISTS "webhook_events_processed_idx" ON "webhook_events"("processed");
CREATE INDEX IF NOT EXISTS "webhook_events_created_at_idx" ON "webhook_events"("created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX IF NOT EXISTS "analytics_events_type_idx" ON "analytics_events"("type");
CREATE INDEX IF NOT EXISTS "analytics_events_plan_idx" ON "analytics_events"("plan");
CREATE INDEX IF NOT EXISTS "analytics_events_created_at_idx" ON "analytics_events"("created_at");
CREATE INDEX IF NOT EXISTS "coupons_active_idx" ON "coupons"("active");

ALTER TABLE "validation_logs"
  ADD CONSTRAINT "validation_logs_license_id_fkey"
  FOREIGN KEY ("license_id") REFERENCES "licenses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "download_logs"
  ADD CONSTRAINT "download_logs_license_id_fkey"
  FOREIGN KEY ("license_id") REFERENCES "licenses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
