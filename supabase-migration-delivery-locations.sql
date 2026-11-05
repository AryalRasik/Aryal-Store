-- Admin-managed delivery locations.
-- Customers may only select one of these addresses when saving an address or
-- placing an order.

CREATE TABLE IF NOT EXISTS delivery_locations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE delivery_locations DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE delivery_locations TO anon, authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

ALTER TABLE IF EXISTS user_addresses ADD COLUMN IF NOT EXISTS delivery_location_id BIGINT;
ALTER TABLE IF EXISTS saved_addresses ADD COLUMN IF NOT EXISTS delivery_location_id BIGINT;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS delivery_location_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_delivery_locations_active ON delivery_locations(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_user_addresses_delivery_location ON user_addresses(delivery_location_id);
CREATE INDEX IF NOT EXISTS idx_saved_addresses_delivery_location ON saved_addresses(delivery_location_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_location ON orders(delivery_location_id);
