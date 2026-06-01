# CamerasNYC Backend/Admin Design

## Goal

Convert the current static CamerasNYC site into a full backend application hosted on the existing Hetzner dedicated server, backed by PostgreSQL, with an authenticated admin panel for editing wording, photos, shared business data, SEO fields, and quote leads.

## Current Site Context

The project is currently a static six-page site:

- `index.html`
- `residential.html`
- `commercial.html`
- `services.html`
- `about.html`
- `contact.html`
- `css/styles.css`
- `js/main.js`
- `assets/images/`

There is no package manager, no build step, no backend, and no configured form handler. The contact form still posts to a placeholder Formspree endpoint. The public design is good enough to preserve; the backend work should move the content behind it without redesigning the public site.

## Confirmed Direction

Use a custom Node.js/Express application with PostgreSQL.

Reasons:

- Hetzner and PostgreSQL/pgAdmin are already available.
- The site needs first-party admin login, uploads, and lead storage.
- The public site can keep its current visual design.
- A custom app avoids the extra operational weight of Strapi, Directus, or a larger framework.

## High-Level Architecture

The app will be a server-rendered Express application.

Public visitors receive HTML rendered from EJS templates and database content. Admin users log into `/admin`, edit records through forms, upload images, and review quote submissions. PostgreSQL stores editable content, media metadata, lead submissions, admin users, and sessions.

The current CSS and JavaScript stay mostly intact. Express serves `/css/styles.css`, `/js/main.js`, existing images, and uploaded media. Public page routes preserve existing URLs such as `/residential.html` while also allowing clean equivalents such as `/residential`.

## Tech Stack

- Runtime: Node.js LTS
- Server: Express
- Templates: EJS
- Database: PostgreSQL
- DB driver: `pg`
- Migrations: SQL files run by a local Node migration script
- Validation: `zod`
- Auth: `express-session`, PostgreSQL-backed session store, `bcrypt`
- Uploads: `multer`, local server filesystem storage
- Security: `helmet`, login/contact rate limiting, CSRF tokens for admin forms, MIME and extension validation for images
- Tests: Node test runner, Supertest, focused repository/service tests, Playwright smoke checks for browser flows if available

## URL Structure

Public routes:

- `GET /`
- `GET /index.html`
- `GET /residential`
- `GET /residential.html`
- `GET /commercial`
- `GET /commercial.html`
- `GET /services`
- `GET /services.html`
- `GET /about`
- `GET /about.html`
- `GET /contact`
- `GET /contact.html`
- `POST /contact/quote`

Admin routes:

- `GET /admin/login`
- `POST /admin/login`
- `POST /admin/logout`
- `GET /admin`
- `GET /admin/settings`
- `POST /admin/settings`
- `GET /admin/pages`
- `GET /admin/pages/:slug`
- `POST /admin/pages/:slug`
- `GET /admin/pages/:slug/blocks/:blockKey/items/new`
- `POST /admin/pages/:slug/blocks/:blockKey/items`
- `GET /admin/pages/:slug/blocks/:blockKey/items/:itemId/edit`
- `POST /admin/pages/:slug/blocks/:blockKey/items/:itemId`
- `POST /admin/pages/:slug/blocks/:blockKey/items/:itemId/delete`
- `GET /admin/media`
- `POST /admin/media`
- `POST /admin/media/:id/delete`
- `GET /admin/leads`
- `GET /admin/leads/:id`
- `POST /admin/leads/:id/status`

## Database Model

### `admin_users`

Stores admin accounts.

Fields:

- `id uuid primary key`
- `email text unique not null`
- `password_hash text not null`
- `display_name text not null`
- `is_active boolean not null default true`
- `last_login_at timestamptz`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `site_settings`

Stores shared business data used across pages.

Fields:

- `key text primary key`
- `value jsonb not null`
- `updated_at timestamptz not null`

Core keys:

- `business`
- `navigation`
- `footer`
- `trust_bar`
- `contact`
- `seo_defaults`

### `pages`

Stores top-level page metadata and header content.

Fields:

- `id uuid primary key`
- `slug text unique not null`
- `template text not null`
- `path text not null`
- `title text not null`
- `meta_description text not null`
- `og_title text not null`
- `og_description text not null`
- `og_image_media_id uuid references media_assets(id)`
- `canonical_path text not null`
- `header_eyebrow text not null`
- `header_title text not null`
- `header_lede text not null`
- `schema_type text`
- `schema_data jsonb not null default '{}'::jsonb`
- `is_published boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `content_blocks`

Stores editable page sections.

Fields:

- `id uuid primary key`
- `page_id uuid not null references pages(id) on delete cascade`
- `block_key text not null`
- `block_type text not null`
- `eyebrow text`
- `title text`
- `lede text`
- `body text`
- `settings jsonb not null default '{}'::jsonb`
- `sort_order integer not null`
- `is_enabled boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Unique constraint:

- `(page_id, block_key)`

Block types:

- `hero`
- `page_header`
- `feature_grid`
- `two_track`
- `pricing_packages`
- `process_steps`
- `faq`
- `case_studies`
- `cta_band`
- `rich_text`
- `contact_info`
- `form_intro`

### `content_items`

Stores repeated items inside blocks.

Fields:

- `id uuid primary key`
- `block_id uuid not null references content_blocks(id) on delete cascade`
- `item_key text`
- `title text`
- `subtitle text`
- `body text`
- `image_media_id uuid references media_assets(id)`
- `link_label text`
- `link_url text`
- `price text`
- `badge text`
- `metadata jsonb not null default '{}'::jsonb`
- `sort_order integer not null`
- `is_featured boolean not null default false`
- `is_enabled boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Examples:

- Pricing package includes are stored in `metadata.includes`.
- FAQ answer is stored in `body`.
- Case study KPI is stored in `metadata.kpi`.
- Photo placeholder style fallback is stored in `metadata.placeholder_class`.

### `media_assets`

Stores uploaded image metadata.

Fields:

- `id uuid primary key`
- `original_name text not null`
- `stored_name text unique not null`
- `mime_type text not null`
- `size_bytes integer not null`
- `width integer`
- `height integer`
- `alt_text text not null default ''`
- `caption text`
- `public_path text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Files are stored under `uploads/media/YYYY/MM/`. The database stores metadata and public path. Images are served from `/uploads/media/...`.

### `leads`

Stores quote form submissions.

Fields:

- `id uuid primary key`
- `name text not null`
- `phone text not null`
- `email text not null`
- `zip text not null`
- `property_type text not null`
- `camera_count text`
- `notes text`
- `status text not null default 'new'`
- `source_path text not null default '/contact'`
- `ip_address inet`
- `user_agent text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Allowed statuses:

- `new`
- `contacted`
- `quoted`
- `won`
- `lost`
- `spam`

### `admin_audit_log`

Stores important admin changes.

Fields:

- `id uuid primary key`
- `admin_user_id uuid references admin_users(id)`
- `action text not null`
- `entity_type text not null`
- `entity_id text`
- `summary text not null`
- `created_at timestamptz not null`

The first implementation should log logins, page saves, settings saves, media uploads/deletes, and lead status changes.

## Public Rendering

Each public page uses:

- Shared layout
- Shared trust bar partial
- Shared navigation partial
- Page template
- Shared CTA/footer partial on pages that currently have a `cta-band` section
- SEO head partial
- JSON-LD partial

The templates read from a normalized `pageViewModel` assembled by the public controller. EJS templates should avoid querying the database directly. Repositories fetch rows, services shape them for views, and route handlers render templates.

Existing `.html` files remain as legacy reference files during the first migration but are no longer served by Express. Once the backend output is verified against them, they can be archived or removed in a later cleanup.

## Admin Experience

The admin panel should be practical, dense, and simple.

Screens:

- Dashboard: quick counts for leads, pages, media, and last updated content.
- Login: email/password.
- Settings: business name, phone, WhatsApp number/message, rating, review count, service areas, credentials, office copy, hours.
- Pages list: one row per public page with title, path, published status, updated time, and edit action.
- Page editor: SEO fields, header fields, blocks, and repeated items.
- Block item editor: add/edit/delete pricing packages, FAQs, features, case studies, service tiers, and process steps.
- Media library: upload image, edit alt text/caption, view image, delete unused image.
- Leads: list submissions, filter by status, inspect details, update status.

V1 does not need drag-and-drop layout building. It should allow editing the content shapes that already exist.

## Media Handling

Admin uploads support:

- JPG
- PNG
- WebP

Limits:

- Max file size: 8 MB
- Reject SVG uploads in V1
- Reject files whose MIME type and extension disagree
- Generate randomized stored filenames
- Store alt text with every upload

Image assignment:

- Hero and section images are selected from the media library.
- If no image is assigned, the existing CSS placeholder class renders as a fallback.
- Existing `data-img-placeholder` concepts become stable admin-facing image slots.

## Quote Lead Handling

The public contact form posts to `POST /contact/quote`.

Validation:

- Name required, max 120 characters
- Phone required, max 40 characters
- Email required, valid email, max 180 characters
- Zip required, exactly 5 digits
- Property type required, selected from the existing option list
- Camera count optional, selected from the existing option list
- Notes optional, max 3000 characters
- Honeypot field must be empty

On success:

- Insert lead
- Show a success page or success state on contact page
- Do not email in V1 unless SMTP credentials are available

On validation failure:

- Re-render contact page with field-level errors and previous input
- Do not lose user-entered data

## Security

Required controls:

- Passwords hashed with bcrypt
- Session cookie is HTTP-only and SameSite=Lax
- Session cookie uses Secure in production
- Sessions stored in PostgreSQL
- Admin routes require authentication
- Admin forms use CSRF protection
- Login route is rate limited
- Contact form is rate limited
- Inputs are validated with zod before database writes
- EJS escapes public text by default
- Admin rich HTML editing is not included in V1
- File uploads are validated by extension, MIME type, size, and randomized filename
- Database credentials and session secret live in `.env`

## Deployment Shape

Hetzner production process:

1. Install Node.js LTS.
2. Clone or pull the repo.
3. Create a PostgreSQL database and user.
4. Configure `.env`.
5. Run migrations.
6. Run seed script to load current site content.
7. Create the first admin account.
8. Start the app with a process manager such as PM2 or a systemd service.
9. Put Nginx/Caddy in front with HTTPS.

Required environment variables:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `SESSION_SECRET`
- `PUBLIC_BASE_URL`
- `UPLOAD_ROOT`

## Testing And Verification

Before calling the work done, verify:

- Migrations run cleanly on a fresh PostgreSQL database.
- Seed script creates all six pages and required blocks/items.
- Public routes render 200 responses for `/`, every `.html` URL, and clean aliases.
- Public pages include expected title/meta/canonical fields.
- Contact form rejects invalid input and stores valid leads.
- Admin login rejects bad credentials and accepts a real admin.
- Admin page edits persist and show on the public page.
- Admin media upload accepts valid images, rejects invalid files, and public pages render assigned images.
- Lead status changes persist and are audit logged.
- Existing mobile navigation still works.
- Browser smoke test confirms admin and public pages are not blank.

## Non-Goals For First Backend Pass

- Online payments
- Customer accounts
- Scheduling calendar
- Multi-admin roles/permissions beyond active admin users
- Drag-and-drop page builder
- WYSIWYG arbitrary HTML editor
- Cloud object storage
- Email/SMS notifications unless credentials are provided before implementation

## Rollback Strategy

The current static HTML files stay in the repository during the first backend build. If the backend deployment has an issue, the existing static site can still be deployed while backend fixes continue. Database migrations should be additive during V1 so rollback risk stays low.

## Acceptance Criteria

The backend/admin system is acceptable when:

- A logged-in admin can change public wording without editing code.
- A logged-in admin can upload and assign a site image without editing code.
- A visitor can submit the quote form and the lead appears in admin.
- Public pages preserve the current site design and main content.
- Existing URLs keep working.
- The app can be configured for Hetzner using documented environment variables.
- Verification commands have been run and their results recorded in `tasks/todo.md`.
