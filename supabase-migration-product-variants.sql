-- ============================================================================
-- Aryal Store - Product variants & per-variant stock
-- Project: srlejludttajosnrfkca
--
-- Run ONCE in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run: only CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--
-- Existing products keep their current `products.stock` value and keep
-- working exactly as before. They become variant-managed only when an admin
-- saves the colour/size stock table for that product.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. VARIANT TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT '',
  size           TEXT NOT NULL DEFAULT '',
  sku            TEXT NOT NULL DEFAULT '',
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  price          NUMERIC,
  image_url      TEXT DEFAULT '',
  color_hex      TEXT DEFAULT '',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- The table may already exist from a partial run; make sure every column is present.
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS product_id TEXT NOT NULL DEFAULT '';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT '';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sku TEXT NOT NULL DEFAULT '';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS price NUMERIC;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_hex TEXT DEFAULT '';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- One row per product + colour + size (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_combo
  ON product_variants (product_id, lower(color), lower(size));
CREATE INDEX IF NOT EXISTS idx_product_variants_product
  ON product_variants (product_id, is_active);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku
  ON product_variants (lower(sku)) WHERE sku <> '';

-- The storefront reads variants through the API. Keep the same access posture
-- as the existing catalogue tables.
ALTER TABLE product_variants DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE product_variants TO anon, authenticated;

-- Record on the order whether its stock has already been taken. This makes the
-- reserve/release operations idempotent.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. ATOMIC STOCK RESERVE
-- Deducts every line in one database transaction. If any variant is short,
-- the whole order is rolled back, so two customers can never oversell stock.
-- The order's private tracking token is required so the RPC cannot be abused
-- with a guessed order id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reserve_order_stock(p_order_id UUID, p_token TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order       orders%ROWTYPE;
  v_item        RECORD;
  v_variant     product_variants%ROWTYPE;
  v_updated     INTEGER;
  v_product_id  TEXT;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF COALESCE(v_order.tracking_token, '') <> COALESCE(p_token, '') THEN
    RAISE EXCEPTION 'INVALID_ORDER_TOKEN';
  END IF;
  IF COALESCE(v_order.stock_reserved, 0) = 1 THEN
    RETURN jsonb_build_object('ok', true, 'already_reserved', true);
  END IF;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    SELECT * INTO v_variant
      FROM product_variants
     WHERE product_id = v_item.product_id::text
       AND lower(color) = lower(COALESCE(v_item.color, ''))
       AND lower(size) = lower(COALESCE(v_item.size, ''))
       AND is_active = TRUE
     FOR UPDATE;

    IF FOUND THEN
      IF v_variant.stock_quantity < v_item.quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%:%', v_item.product_name, v_variant.stock_quantity;
      END IF;
      UPDATE product_variants
         SET stock_quantity = stock_quantity - v_item.quantity,
             updated_at = NOW()
       WHERE id = v_variant.id;
    ELSE
      -- If this product has variant rows, the selected combination must exist.
      IF EXISTS (SELECT 1 FROM product_variants WHERE product_id = v_item.product_id::text) THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%:0', v_item.product_name;
      END IF;

      -- Legacy product (no variants): keep using the old single stock column.
      UPDATE products
         SET stock = COALESCE(stock, 0) - v_item.quantity
       WHERE id::text = v_item.product_id::text
         AND COALESCE(stock, 0) >= v_item.quantity;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%:0', v_item.product_name;
      END IF;
    END IF;
  END LOOP;

  -- Sales counters (once per product).
  FOR v_item IN
    SELECT product_id::text AS product_id, SUM(quantity) AS qty
      FROM order_items WHERE order_id = p_order_id GROUP BY product_id
  LOOP
    UPDATE products
       SET sold_count = COALESCE(sold_count, 0) + v_item.qty
     WHERE id::text = v_item.product_id;
  END LOOP;

  -- Keep products.stock equal to the sum of its active variants so catalogue
  -- cards and low-stock alerts stay correct.
  FOR v_item IN
    SELECT DISTINCT product_id::text AS product_id FROM order_items WHERE order_id = p_order_id
  LOOP
    IF EXISTS (SELECT 1 FROM product_variants WHERE product_id = v_item.product_id) THEN
      UPDATE products p
         SET stock = (
           SELECT COALESCE(SUM(stock_quantity), 0)
             FROM product_variants v
            WHERE v.product_id = p.id::text AND v.is_active = TRUE
         )
       WHERE p.id::text = v_item.product_id;
    END IF;
  END LOOP;

  UPDATE orders SET stock_reserved = 1, updated_at = NOW() WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. ATOMIC STOCK RELEASE
-- Used when a stock-reserved order is cancelled/refunded.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_order_stock(p_order_id UUID, p_token TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order      orders%ROWTYPE;
  v_item       RECORD;
  v_variant    product_variants%ROWTYPE;
  v_has_variant BOOLEAN;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF COALESCE(v_order.tracking_token, '') <> COALESCE(p_token, '') THEN
    RAISE EXCEPTION 'INVALID_ORDER_TOKEN';
  END IF;
  IF COALESCE(v_order.stock_reserved, 0) <> 1 THEN
    RETURN jsonb_build_object('ok', true, 'already_released', true);
  END IF;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    SELECT EXISTS (
      SELECT 1 FROM product_variants WHERE product_id = v_item.product_id::text
    ) INTO v_has_variant;

    SELECT * INTO v_variant
      FROM product_variants
     WHERE product_id = v_item.product_id::text
       AND lower(color) = lower(COALESCE(v_item.color, ''))
       AND lower(size) = lower(COALESCE(v_item.size, ''))
     ORDER BY is_active DESC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      UPDATE product_variants
         SET stock_quantity = stock_quantity + v_item.quantity,
             updated_at = NOW()
       WHERE id = v_variant.id;
    ELSIF NOT v_has_variant THEN
      UPDATE products
         SET stock = COALESCE(stock, 0) + v_item.quantity
       WHERE id::text = v_item.product_id::text;
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT product_id::text AS product_id, SUM(quantity) AS qty
      FROM order_items WHERE order_id = p_order_id GROUP BY product_id
  LOOP
    UPDATE products
       SET sold_count = GREATEST(0, COALESCE(sold_count, 0) - v_item.qty)
     WHERE id::text = v_item.product_id;
  END LOOP;

  FOR v_item IN
    SELECT DISTINCT product_id::text AS product_id FROM order_items WHERE order_id = p_order_id
  LOOP
    IF EXISTS (SELECT 1 FROM product_variants WHERE product_id = v_item.product_id) THEN
      UPDATE products p
         SET stock = (
           SELECT COALESCE(SUM(stock_quantity), 0)
             FROM product_variants v
            WHERE v.product_id = p.id::text AND v.is_active = TRUE
         )
       WHERE p.id::text = v_item.product_id;
    END IF;
  END LOOP;

  UPDATE orders SET stock_reserved = 0, updated_at = NOW() WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION reserve_order_stock(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION release_order_stock(UUID, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- DONE.
-- Existing products are untouched. Open a product in Admin -> Products,
-- choose colours/sizes and save the stock table to start managing variants.
-- ---------------------------------------------------------------------------
