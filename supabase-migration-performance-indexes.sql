-- Indexes that keep the storefront and admin product list fast.
-- Safe to run repeatedly: every statement uses IF NOT EXISTS.

-- Catalogue listing / sorting
create index if not exists products_status_created_idx on public.products (status, created_at desc);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_sold_count_idx on public.products (sold_count desc);

-- Homepage showcase rows
create index if not exists products_is_featured_idx on public.products (created_at desc) where is_featured = 1;
create index if not exists products_is_new_idx on public.products (created_at desc) where is_new = 1;
create index if not exists products_is_best_seller_idx on public.products (sold_count desc) where is_best_seller = 1;
create index if not exists products_is_trending_idx on public.products (sold_count desc) where is_trending = 1;

-- Product detail / delete dependants
create index if not exists product_images_product_idx on public.product_images (product_id);
create index if not exists wishlist_product_idx on public.wishlist (product_id);
create index if not exists recently_viewed_product_idx on public.recently_viewed (product_id);
create index if not exists reviews_product_idx on public.reviews (product_id, status);
create index if not exists flash_sale_products_product_idx on public.flash_sale_products (product_id);
