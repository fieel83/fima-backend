CREATE TABLE "desktop_login_requests" (
    "id" TEXT NOT NULL,
    "device_code_hash" TEXT NOT NULL,
    "user_code_hash" TEXT NOT NULL,
    "pkce_challenge" TEXT NOT NULL,
    "device_id_hash" TEXT NOT NULL,
    "state_hash" TEXT NOT NULL,
    "app_version" TEXT NOT NULL,
    "device_name" TEXT,
    "device_platform" TEXT,
    "user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "desktop_login_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "desktop_login_requests_device_code_hash_key" ON "desktop_login_requests"("device_code_hash");
CREATE UNIQUE INDEX "desktop_login_requests_user_code_hash_key" ON "desktop_login_requests"("user_code_hash");
CREATE INDEX "desktop_login_requests_status_expires_at_idx" ON "desktop_login_requests"("status", "expires_at");
CREATE INDEX "desktop_login_requests_user_id_idx" ON "desktop_login_requests"("user_id");

ALTER TABLE "desktop_login_requests"
ADD CONSTRAINT "desktop_login_requests_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
