CREATE TABLE "licenses" (
  "id" TEXT NOT NULL,
  "license_key" TEXT NOT NULL,
  "customer_email" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "hwid" TEXT,
  "expires_at" TIMESTAMP(3),
  "lifetime" BOOLEAN NOT NULL DEFAULT false,
  "stripe_session_id" TEXT,
  "stripe_payment_intent_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
  "id" TEXT NOT NULL,
  "stripe_session_id" TEXT NOT NULL,
  "stripe_payment_intent_id" TEXT,
  "customer_email" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "license_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "licenses_license_key_key" ON "licenses"("license_key");
CREATE UNIQUE INDEX "licenses_stripe_session_id_key" ON "licenses"("stripe_session_id");
CREATE INDEX "licenses_customer_email_idx" ON "licenses"("customer_email");
CREATE INDEX "licenses_plan_status_idx" ON "licenses"("plan", "status");

CREATE UNIQUE INDEX "orders_stripe_session_id_key" ON "orders"("stripe_session_id");
CREATE INDEX "orders_customer_email_idx" ON "orders"("customer_email");
CREATE INDEX "orders_plan_status_idx" ON "orders"("plan", "status");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_license_id_fkey"
  FOREIGN KEY ("license_id") REFERENCES "licenses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
