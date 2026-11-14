CREATE TABLE admins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL UNIQUE CHECK(length(username) BETWEEN 3 AND 80),
 password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL REFERENCES admins(id),
 token_hash text NOT NULL UNIQUE, csrf_token text NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON admin_sessions(expires_at);
CREATE INDEX sessions_admin ON admin_sessions(admin_id);
CREATE TABLE service_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, sort_order integer NOT NULL DEFAULT 0
);
INSERT INTO service_categories(name,sort_order) VALUES ('剪髮設計',1),('燙髮造型',2),('染髮設計',3),('護髮修護',4),('頭皮 SPA',5);
CREATE TABLE services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid NOT NULL REFERENCES service_categories(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80), description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 price integer CHECK(price BETWEEN 0 AND 1000000), minutes integer NOT NULL CHECK(minutes BETWEEN 5 AND 540),
 sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT active OR price IS NOT NULL)
);
CREATE INDEX services_category ON services(category_id);
CREATE INDEX services_display ON services(active,sort_order);
CREATE TABLE business_settings (
 id integer PRIMARY KEY CHECK(id=1), capacity integer NOT NULL DEFAULT 1 CHECK(capacity BETWEEN 1 AND 20),
 slot_interval integer NOT NULL DEFAULT 30 CHECK(slot_interval BETWEEN 5 AND 120),
 advance_days integer NOT NULL DEFAULT 60 CHECK(advance_days BETWEEN 1 AND 365),
 timezone text NOT NULL DEFAULT 'Asia/Taipei' CHECK(timezone='Asia/Taipei'),
 currency text NOT NULL DEFAULT 'TWD' CHECK(currency='TWD'), revision bigint NOT NULL DEFAULT 0
);
INSERT INTO business_settings(id) VALUES(1);
CREATE TABLE business_hours (
 weekday integer PRIMARY KEY CHECK(weekday BETWEEN 0 AND 6), closed boolean NOT NULL DEFAULT false,
 opens time NOT NULL DEFAULT '11:00', closes time NOT NULL DEFAULT '20:00', CHECK(opens<closes)
);
INSERT INTO business_hours(weekday,closed) SELECT i,i=3 FROM generate_series(0,6) i;
CREATE TABLE closed_dates (date date PRIMARY KEY, reason text NOT NULL DEFAULT '' CHECK(length(reason)<=200));
CREATE TABLE bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text NOT NULL UNIQUE,
 request_key uuid NOT NULL UNIQUE, request_hash text NOT NULL,
 customer_name text NOT NULL CHECK(length(customer_name) BETWEEN 1 AND 60),
 phone text NOT NULL CHECK(phone ~ '^[0-9+() -]{7,24}$'), notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 total_price integer NOT NULL CHECK(total_price BETWEEN 0 AND 20000000), total_minutes integer NOT NULL CHECK(total_minutes BETWEEN 5 AND 540),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at=starts_at+total_minutes*interval '1 minute')
);
CREATE INDEX bookings_time ON bookings(starts_at,ends_at) WHERE status<>'cancelled';
CREATE INDEX bookings_status ON bookings(status,starts_at);
CREATE INDEX bookings_phone ON bookings(phone);
CREATE TABLE booking_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
 service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
 service_name text NOT NULL, price integer NOT NULL CHECK(price>=0), minutes integer NOT NULL CHECK(minutes>0),
 UNIQUE(booking_id,service_id)
);
CREATE INDEX booking_items_service ON booking_items(service_id);
CREATE TABLE audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid REFERENCES admins(id),
 action text NOT NULL, entity_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_time ON audit_logs(created_at);
CREATE INDEX audit_admin ON audit_logs(admin_id);
CREATE TABLE login_attempts (
 key_hash text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 1 CHECK(attempts>0)
);

-- 強一致性容量約束：所有寫入先 UPDATE 同一 settings 列取得互斥鎖。
-- PostgreSQL READ COMMITTED 下，volatile trigger 後續查詢取得新 snapshot；
-- REPEATABLE READ / SERIALIZABLE 的競爭交易則由 PostgreSQL 中止，無法繞過容量約束。
-- 半開區間 [start,end)，逐起點計算同時占用數，支援任意多服務時長與容量。
CREATE FUNCTION enforce_booking_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cap integer;
BEGIN
 UPDATE business_settings SET revision=revision+1 WHERE id=1 RETURNING capacity INTO cap;
 IF EXISTS (
   SELECT 1 FROM bookings a
   WHERE a.status<>'cancelled' AND a.ends_at>now() AND
     (SELECT count(*) FROM bookings b WHERE b.status<>'cancelled'
       AND b.starts_at<=a.starts_at AND b.ends_at>a.starts_at)>cap
 ) THEN
   RAISE EXCEPTION 'booking_capacity_exceeded' USING ERRCODE='23P01';
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER booking_capacity AFTER INSERT OR UPDATE OF starts_at,ends_at,status ON bookings
FOR EACH ROW EXECUTE FUNCTION enforce_booking_capacity();
CREATE FUNCTION enforce_capacity_setting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.capacity < OLD.capacity AND EXISTS (
   SELECT 1 FROM bookings a WHERE a.status<>'cancelled' AND a.ends_at>now() AND
    (SELECT count(*) FROM bookings b WHERE b.status<>'cancelled' AND b.starts_at<=a.starts_at AND b.ends_at>a.starts_at)>NEW.capacity
 ) THEN RAISE EXCEPTION 'existing_bookings_exceed_capacity' USING ERRCODE='23P01'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER settings_capacity BEFORE UPDATE OF capacity ON business_settings
FOR EACH ROW EXECUTE FUNCTION enforce_capacity_setting();
