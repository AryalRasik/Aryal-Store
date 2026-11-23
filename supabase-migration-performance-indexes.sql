-- Indexes that keep the storefront and admin product list fast.
-- Safe to run repeatedly: every statement uses IF NOT EXISTS.

-- Catalogue listing / sorting
create index if not exists products_status_created_idx on public.products (status, created_at desc);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_sold_count_idx on public.products (sold_count desc);
create index if not exists products_created_idx on public.products (created_at desc);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'rating'
  ) THEN
    EXECUTE 'create index if not exists products_rating_idx on public.products (rating desc)';
  END IF;
END $$;

-- Homepage showcase rows
create index if not exists products_is_featured_idx on public.products (created_at desc) where is_featured = 1;
create index if not exists products_is_new_idx on public.products (created_at desc) where is_new = 1;
create index if not exists products_is_best_seller_idx on public.products (sold_count desc) where is_best_seller = 1;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_trending'
  ) THEN
    EXECUTE 'create index if not exists products_is_trending_idx on public.products (sold_count desc) where is_trending = 1';
  END IF;
END $$;

-- Common filter/search helpers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'brand'
  ) THEN
    EXECUTE 'create index if not exists products_brand_idx on public.products (brand)';
  END IF;
END $$;
create index if not exists products_status_category_created_idx on public.products (status, category, created_at desc);
create index if not exists products_name_idx on public.products using gin (to_tsvector('simple', coalesce(name,'')));

-- Product detail / delete dependants
create index if not exists product_images_product_idx on public.product_images (product_id);
create index if not exists wishlist_product_idx on public.wishlist (product_id);
create index if not exists recently_viewed_product_idx on public.recently_viewed (product_id);
create index if not exists reviews_product_idx on public.reviews (product_id, status);
create index if not exists flash_sale_products_product_idx on public.flash_sale_products (product_id);
