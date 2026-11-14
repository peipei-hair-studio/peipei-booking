CREATE TABLE site_settings (
 id integer PRIMARY KEY CHECK(id=1), content jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(content)='object'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO site_settings(id) VALUES(1);
CREATE TABLE promotions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 starts_on date NOT NULL,ends_on date NOT NULL CHECK(ends_on>=starts_on),kind text NOT NULL CHECK(kind IN ('fixed','percent')),
 value integer NOT NULL CHECK(value BETWEEN 1 AND 1000000),minimum integer NOT NULL DEFAULT 0 CHECK(minimum BETWEEN 0 AND 20000000),
 active boolean NOT NULL DEFAULT false,sort_order integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind<>'percent' OR value<=100)
);
CREATE TABLE promotion_services (
 promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
 service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,PRIMARY KEY(promotion_id,service_id)
);
CREATE INDEX promotion_services_service ON promotion_services(service_id);
CREATE INDEX promotions_display ON promotions(active,sort_order,ends_on);
ALTER TABLE bookings ADD COLUMN subtotal integer;
UPDATE bookings SET subtotal=total_price;
ALTER TABLE bookings ALTER COLUMN subtotal SET NOT NULL;
ALTER TABLE bookings ADD COLUMN discount integer NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN promotion_snapshot jsonb;
ALTER TABLE bookings ADD CONSTRAINT booking_discount CHECK(subtotal BETWEEN 0 AND 20000000 AND discount BETWEEN 0 AND subtotal AND total_price=subtotal-discount);
-- 支援發布過渡期間舊 Function 尚未傳入 subtotal 的無優惠預約。
CREATE FUNCTION booking_subtotal_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.subtotal IS NULL THEN NEW.subtotal=NEW.total_price+NEW.discount; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER booking_subtotal BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION booking_subtotal_default();
