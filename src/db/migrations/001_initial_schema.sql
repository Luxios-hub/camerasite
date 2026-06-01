create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_email_not_blank check (length(btrim(email)) > 0),
  constraint admin_users_password_hash_not_blank check (length(btrim(password_hash)) > 0),
  constraint admin_users_display_name_not_blank check (length(btrim(display_name)) > 0)
);

create unique index if not exists admin_users_email_lower_unique
  on admin_users (lower(email));

create index if not exists admin_users_active_idx
  on admin_users (is_active);

create table if not exists site_settings (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_settings_key_not_blank check (length(btrim(key)) > 0)
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  original_name text not null,
  stored_name text not null unique,
  mime_type text not null,
  size_bytes integer not null,
  width integer,
  height integer,
  alt_text text not null default '',
  caption text,
  public_path text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_original_name_not_blank check (length(btrim(original_name)) > 0),
  constraint media_assets_stored_name_not_blank check (length(btrim(stored_name)) > 0),
  constraint media_assets_mime_type_not_blank check (length(btrim(mime_type)) > 0),
  constraint media_assets_size_bytes_nonnegative check (size_bytes >= 0),
  constraint media_assets_width_positive check (width is null or width > 0),
  constraint media_assets_height_positive check (height is null or height > 0),
  constraint media_assets_public_path_not_blank check (length(btrim(public_path)) > 0)
);

create index if not exists media_assets_created_at_idx
  on media_assets (created_at desc);

create table if not exists pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  template text not null,
  path text not null unique,
  title text not null,
  meta_description text not null,
  og_title text not null,
  og_description text not null,
  og_image_media_id uuid references media_assets(id) on delete set null,
  canonical_path text not null,
  header_eyebrow text not null,
  header_title text not null,
  header_lede text not null,
  schema_type text,
  schema_data jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pages_slug_not_blank check (length(btrim(slug)) > 0),
  constraint pages_template_not_blank check (length(btrim(template)) > 0),
  constraint pages_path_not_blank check (length(btrim(path)) > 0),
  constraint pages_title_not_blank check (length(btrim(title)) > 0),
  constraint pages_meta_description_not_blank check (length(btrim(meta_description)) > 0),
  constraint pages_canonical_path_not_blank check (length(btrim(canonical_path)) > 0)
);

create index if not exists pages_published_idx
  on pages (is_published);

create table if not exists content_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  block_key text not null,
  block_type text not null,
  eyebrow text,
  title text,
  lede text,
  body text,
  settings jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_blocks_page_block_key_unique unique (page_id, block_key),
  constraint content_blocks_block_key_not_blank check (length(btrim(block_key)) > 0),
  constraint content_blocks_block_type_check check (
    block_type in (
      'hero',
      'page_header',
      'feature_grid',
      'two_track',
      'pricing_packages',
      'process_steps',
      'faq',
      'case_studies',
      'cta_band',
      'rich_text',
      'contact_info',
      'form_intro'
    )
  )
);

create index if not exists content_blocks_page_sort_idx
  on content_blocks (page_id, sort_order);

create index if not exists content_blocks_enabled_idx
  on content_blocks (is_enabled);

create table if not exists content_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references content_blocks(id) on delete cascade,
  item_key text,
  title text,
  subtitle text,
  body text,
  image_media_id uuid references media_assets(id) on delete set null,
  link_label text,
  link_url text,
  price text,
  badge text,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_featured boolean not null default false,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists content_items_block_item_key_unique
  on content_items (block_id, item_key)
  where item_key is not null;

create index if not exists content_items_block_sort_idx
  on content_items (block_id, sort_order);

create index if not exists content_items_media_idx
  on content_items (image_media_id);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  zip text not null,
  property_type text not null,
  camera_count text,
  notes text,
  status text not null default 'new',
  source_path text not null default '/contact',
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_name_not_blank check (length(btrim(name)) > 0),
  constraint leads_phone_not_blank check (length(btrim(phone)) > 0),
  constraint leads_email_not_blank check (length(btrim(email)) > 0),
  constraint leads_zip_not_blank check (length(btrim(zip)) > 0),
  constraint leads_property_type_not_blank check (length(btrim(property_type)) > 0),
  constraint leads_status_check check (
    status in ('new', 'contacted', 'quoted', 'won', 'lost', 'spam')
  )
);

create index if not exists leads_status_idx
  on leads (status);

create index if not exists leads_created_at_idx
  on leads (created_at desc);

create index if not exists leads_email_idx
  on leads (lower(email));

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references admin_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  created_at timestamptz not null default now(),
  constraint admin_audit_log_action_not_blank check (length(btrim(action)) > 0),
  constraint admin_audit_log_entity_type_not_blank check (length(btrim(entity_type)) > 0),
  constraint admin_audit_log_summary_not_blank check (length(btrim(summary)) > 0)
);

create index if not exists admin_audit_log_admin_user_idx
  on admin_audit_log (admin_user_id);

create index if not exists admin_audit_log_entity_idx
  on admin_audit_log (entity_type, entity_id);

create index if not exists admin_audit_log_created_at_idx
  on admin_audit_log (created_at desc);

create table if not exists session (
  sid varchar not null collate "default",
  sess json not null,
  expire timestamp(6) not null,
  constraint session_pkey primary key (sid)
);

create index if not exists session_expire_idx
  on session (expire);
