# Backend Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full Node/Express/PostgreSQL backend and admin panel for editing CamerasNYC wording, images, settings, and quote leads.

**Architecture:** Express renders the public site from EJS templates and PostgreSQL content records. Admin users authenticate into `/admin`, edit page/settings/media/lead data, and all public pages preserve current `.html` URLs. The current static files stay as references until backend output is verified.

**Tech Stack:** Node.js LTS, Express, EJS, PostgreSQL, `pg`, SQL migrations, `zod`, `bcrypt`, `express-session`, PostgreSQL session store, `multer`, `helmet`, rate limiting, Node test runner, Supertest, Playwright smoke checks if available.

---

## File Structure

Create:

- `package.json` - scripts and dependencies.
- `.env.example` - required environment variables.
- `server.js` - starts the HTTP server.
- `src/app.js` - creates and configures the Express app.
- `src/config/env.js` - validates environment variables.
- `src/db/pool.js` - PostgreSQL pool.
- `src/db/migrate.js` - SQL migration runner.
- `src/db/seed.js` - initial content seed runner.
- `src/db/migrations/001_initial_schema.sql` - first schema migration.
- `src/db/seeds/initialContent.js` - structured content based on current HTML.
- `src/repositories/contentRepository.js` - page/settings/block/item reads and writes.
- `src/repositories/leadRepository.js` - quote lead persistence.
- `src/repositories/adminRepository.js` - admin user persistence.
- `src/repositories/mediaRepository.js` - media metadata persistence.
- `src/repositories/auditRepository.js` - audit event persistence.
- `src/services/pageViewModel.js` - converts DB rows into public template data.
- `src/services/adminViewModel.js` - converts DB rows into admin template data.
- `src/services/mediaStorage.js` - validates and stores uploads.
- `src/services/passwords.js` - bcrypt helpers.
- `src/middleware/auth.js` - admin auth guards.
- `src/middleware/csrf.js` - CSRF token helpers for admin forms.
- `src/middleware/asyncRoute.js` - Express async wrapper.
- `src/routes/publicRoutes.js` - public page/contact routes.
- `src/routes/adminRoutes.js` - admin routes.
- `src/views/layouts/public.ejs` - public layout.
- `src/views/layouts/admin.ejs` - admin layout.
- `src/views/partials/public/head.ejs`
- `src/views/partials/public/trustBar.ejs`
- `src/views/partials/public/nav.ejs`
- `src/views/partials/public/footer.ejs`
- `src/views/partials/public/ctaBand.ejs`
- `src/views/pages/home.ejs`
- `src/views/pages/standard.ejs`
- `src/views/pages/contact.ejs`
- `src/views/admin/login.ejs`
- `src/views/admin/dashboard.ejs`
- `src/views/admin/settings.ejs`
- `src/views/admin/pages.ejs`
- `src/views/admin/pageEdit.ejs`
- `src/views/admin/itemEdit.ejs`
- `src/views/admin/media.ejs`
- `src/views/admin/leads.ejs`
- `src/views/admin/leadDetail.ejs`
- `admin/css/admin.css` - admin-only styling.
- `scripts/create-admin.js` - creates or updates the first admin.
- `tests/helpers/testApp.js` - app/test setup helpers.
- `tests/db/migration.test.js`
- `tests/public/publicRoutes.test.js`
- `tests/public/contactLead.test.js`
- `tests/admin/auth.test.js`
- `tests/admin/pageEditing.test.js`
- `tests/admin/media.test.js`
- `tests/admin/leads.test.js`

Modify:

- `tasks/todo.md` - track backend phases and verification results.
- `.gitignore` - ignore `.env`, `node_modules/`, uploaded media, logs, and coverage.
- `contact.html` remains as legacy reference until backend verification is complete.
- Existing root HTML files remain as legacy references until backend verification is complete.

---

### Task 1: Bootstrap Node App

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `server.js`
- Create: `src/app.js`
- Create: `src/config/env.js`
- Modify: `.gitignore`
- Test: `tests/helpers/testApp.js`

- [ ] **Step 1: Add Node package scripts and dependencies**

Create `package.json` with scripts:

```json
{
  "name": "camerasnyc-backend",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js",
    "test": "node --test",
    "db:migrate": "node src/db/migrate.js",
    "db:seed": "node src/db/seed.js",
    "admin:create": "node scripts/create-admin.js"
  }
}
```

Install runtime packages:

```powershell
npm install express ejs pg dotenv zod bcrypt express-session connect-pg-simple multer helmet express-rate-limit cookie-parser
npm install --save-dev nodemon supertest
```

Expected: `package-lock.json` is created and `npm test` runs with zero tests or passing tests.

- [ ] **Step 2: Add environment validation**

Create `.env.example` with:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://camerasnyc:change-me@localhost:5432/camerasnyc
SESSION_SECRET=replace-with-a-long-random-string
PUBLIC_BASE_URL=http://localhost:3000
UPLOAD_ROOT=uploads
```

Create `src/config/env.js` that loads `dotenv`, validates these fields with `zod`, and exports `env`.

- [ ] **Step 3: Create the Express app skeleton**

Create `src/app.js` exporting `createApp()` with:

- `helmet()`
- URL-encoded form parsing
- JSON parsing
- cookie parsing
- EJS view engine
- static serving for `/css`, `/js`, `/assets`, `/uploads`, and `/admin/css`
- health route `GET /healthz` returning `{ ok: true }`

Create `server.js` that imports `createApp()`, listens on `env.PORT`, and logs the local URL.

- [ ] **Step 4: Verify app starts**

Run:

```powershell
npm run start
```

Expected: server starts without crashing. Open or request `http://localhost:3000/healthz`; expected JSON includes `"ok":true`.

- [ ] **Step 5: Add test helper**

Create `tests/helpers/testApp.js` that imports `createApp()` and returns the app without listening on a port.

Run:

```powershell
npm test
```

Expected: tests pass.

---

### Task 2: Database Schema And Migrations

**Files:**
- Create: `src/db/pool.js`
- Create: `src/db/migrate.js`
- Create: `src/db/migrations/001_initial_schema.sql`
- Test: `tests/db/migration.test.js`

- [ ] **Step 1: Add PostgreSQL pool**

Create `src/db/pool.js` exporting a `pg.Pool` configured with `env.DATABASE_URL`.

- [ ] **Step 2: Add migration runner**

Create `src/db/migrate.js` that:

- Ensures a `schema_migrations` table exists.
- Reads `.sql` files from `src/db/migrations` in filename order.
- Runs each new migration inside a transaction.
- Inserts the migration filename into `schema_migrations`.
- Logs applied or skipped migrations.

- [ ] **Step 3: Add initial schema migration**

Create `001_initial_schema.sql` with tables from the design spec:

- `admin_users`
- `site_settings`
- `pages`
- `content_blocks`
- `content_items`
- `media_assets`
- `leads`
- `admin_audit_log`
- `session`
- `schema_migrations`

Enable UUIDs with `CREATE EXTENSION IF NOT EXISTS pgcrypto;`.

- [ ] **Step 4: Verify migration against PostgreSQL**

Run:

```powershell
npm run db:migrate
```

Expected: migration applies once. Run it again; expected: migration is skipped without changing the schema.

- [ ] **Step 5: Add migration smoke test**

Create `tests/db/migration.test.js` that asserts the migration module exports a callable migration function. If a test database URL is available, run migrations and assert core tables exist.

Run:

```powershell
npm test
```

Expected: PASS. If no test database is configured, the DB integration section is skipped with an explicit message.

---

### Task 3: Seed Current Site Content

**Files:**
- Create: `src/db/seeds/initialContent.js`
- Create: `src/db/seed.js`
- Create: `src/repositories/contentRepository.js`
- Test: `tests/public/publicRoutes.test.js`

- [ ] **Step 1: Model current content as structured data**

Create `initialContent.js` with:

- `settings.business`
- `settings.navigation`
- `settings.footer`
- `settings.trust_bar`
- `settings.contact`
- `pages.home`
- `pages.residential`
- `pages.commercial`
- `pages.services`
- `pages.about`
- `pages.contact`

Each page includes SEO fields, header fields, block definitions, and block items matching the current static site wording.

- [ ] **Step 2: Add content repository writes**

Implement repository functions:

- `upsertSiteSetting(key, value)`
- `upsertPage(page)`
- `upsertBlock(pageId, block)`
- `upsertItem(blockId, item)`
- `getPageBySlug(slug)`
- `getPageWithBlocks(slug)`
- `getSiteSettings()`

- [ ] **Step 3: Add seed runner**

Create `src/db/seed.js` that runs after migrations and upserts the initial content without duplicating rows.

Run:

```powershell
npm run db:seed
```

Expected: all six pages are created. Re-run it; expected: no duplicate pages, blocks, or items.

- [ ] **Step 4: Verify seed data in pgAdmin or psql**

Check:

```sql
select slug, title from pages order by slug;
select p.slug, count(b.id) as blocks
from pages p
left join content_blocks b on b.page_id = p.id
group by p.slug
order by p.slug;
```

Expected: six pages and non-zero block counts.

---

### Task 4: Public Rendering

**Files:**
- Create: `src/services/pageViewModel.js`
- Create: `src/routes/publicRoutes.js`
- Create: public EJS layouts and partials listed above
- Test: `tests/public/publicRoutes.test.js`

- [ ] **Step 1: Add page view model service**

Create a function `buildPageViewModel(slug)` that returns:

- `settings`
- `page`
- `blocksByKey`
- `enabledBlocks`
- helper `items(blockKey)`
- helper `mediaUrl(itemOrPage)`

- [ ] **Step 2: Add public routes**

Map these routes to slugs:

- `/` and `/index.html` to `home`
- `/residential` and `/residential.html` to `residential`
- `/commercial` and `/commercial.html` to `commercial`
- `/services` and `/services.html` to `services`
- `/about` and `/about.html` to `about`
- `/contact` and `/contact.html` to `contact`

- [ ] **Step 3: Create EJS templates**

Convert current public markup into EJS:

- `home.ejs` for the home page layout.
- `standard.ejs` for residential, commercial, services, and about page shapes, using block types.
- `contact.ejs` for contact info and quote form.

Keep existing class names so `css/styles.css` continues to style the site.

- [ ] **Step 4: Test public routes**

Create `tests/public/publicRoutes.test.js` with Supertest assertions:

- `GET /` returns 200 and contains `CamerasNYC`.
- `GET /residential.html` returns 200 and contains the residential title.
- `GET /commercial.html` returns 200.
- `GET /services.html` returns 200.
- `GET /about.html` returns 200.
- `GET /contact.html` returns 200 and contains the quote form.

Run:

```powershell
npm test
```

Expected: PASS.

---

### Task 5: Quote Lead Submission

**Files:**
- Create: `src/repositories/leadRepository.js`
- Modify: `src/routes/publicRoutes.js`
- Modify: `src/views/pages/contact.ejs`
- Test: `tests/public/contactLead.test.js`

- [ ] **Step 1: Add lead repository**

Implement:

- `createLead(input, requestMeta)`
- `listLeads(filters)`
- `getLead(id)`
- `updateLeadStatus(id, status)`

- [ ] **Step 2: Add contact validation**

Create zod validation for the current form fields:

- `name`
- `phone`
- `email`
- `zip`
- `type`
- `cameras`
- `notes`
- `bot-field`

- [ ] **Step 3: Wire `POST /contact/quote`**

On valid form submission:

- Insert the lead.
- Render the contact page with a success state.

On invalid form submission:

- Render the contact page with field errors and previous values.

If the honeypot is filled:

- Do not insert a lead.
- Return a normal-looking success state.

- [ ] **Step 4: Test lead behavior**

Create tests asserting:

- Valid submission inserts a lead.
- Invalid email returns validation error.
- Invalid ZIP returns validation error.
- Honeypot submission does not insert a lead.

Run:

```powershell
npm test
```

Expected: PASS.

---

### Task 6: Admin Authentication

**Files:**
- Create: `src/repositories/adminRepository.js`
- Create: `src/repositories/auditRepository.js`
- Create: `src/services/passwords.js`
- Create: `src/middleware/auth.js`
- Create: `src/middleware/csrf.js`
- Create: `scripts/create-admin.js`
- Create: `src/routes/adminRoutes.js`
- Create: `src/views/layouts/admin.ejs`
- Create: `src/views/admin/login.ejs`
- Test: `tests/admin/auth.test.js`

- [ ] **Step 1: Add password helpers**

Implement:

- `hashPassword(password)`
- `verifyPassword(password, passwordHash)`

Use bcrypt with 12 salt rounds.

- [ ] **Step 2: Add admin repository**

Implement:

- `findAdminByEmail(email)`
- `findAdminById(id)`
- `upsertAdmin({ email, passwordHash, displayName })`
- `markLastLogin(id)`

- [ ] **Step 3: Add create-admin script**

Create `scripts/create-admin.js` that accepts:

```powershell
npm run admin:create -- --email admin@example.com --password "strong password" --name "Admin"
```

Expected: admin account is created or password is updated for that email.

- [ ] **Step 4: Add session and login routes**

Configure PostgreSQL-backed sessions and add:

- `GET /admin/login`
- `POST /admin/login`
- `POST /admin/logout`

Bad credentials re-render login with a generic error. Good credentials redirect to `/admin`.

- [ ] **Step 5: Test auth**

Create tests asserting:

- `/admin` redirects to `/admin/login` when logged out.
- Bad login fails.
- Good login sets a session and redirects to `/admin`.
- Logout clears access.

Run:

```powershell
npm test
```

Expected: PASS.

---

### Task 7: Admin Settings And Page Editing

**Files:**
- Create: `src/services/adminViewModel.js`
- Create: `src/views/admin/dashboard.ejs`
- Create: `src/views/admin/settings.ejs`
- Create: `src/views/admin/pages.ejs`
- Create: `src/views/admin/pageEdit.ejs`
- Create: `src/views/admin/itemEdit.ejs`
- Create: `admin/css/admin.css`
- Modify: `src/routes/adminRoutes.js`
- Modify: `src/repositories/contentRepository.js`
- Test: `tests/admin/pageEditing.test.js`

- [ ] **Step 1: Build admin dashboard**

Display:

- Lead count by status.
- Page count.
- Media count.
- Last five leads.
- Last five audit events.

- [ ] **Step 2: Build settings form**

Editable fields:

- Business name
- Phone display
- Phone tel value
- WhatsApp number
- WhatsApp default message
- Review rating
- Review count
- Service area text
- Office text
- License/credential labels

- [ ] **Step 3: Build page list**

Show all pages with:

- Title
- Slug
- Existing URL
- Published status
- Updated timestamp
- Edit link

- [ ] **Step 4: Build page editor**

Editable page fields:

- Title
- Meta description
- OG title
- OG description
- Canonical path
- Header eyebrow
- Header title
- Header lede
- Published checkbox

Editable block fields:

- Eyebrow
- Title
- Lede
- Body
- Enabled checkbox

- [ ] **Step 5: Build item editor**

Editable repeated item fields:

- Title
- Subtitle
- Body
- Price
- Badge
- Link label
- Link URL
- Sort order
- Featured checkbox
- Enabled checkbox
- Metadata JSON textarea with validation

- [ ] **Step 6: Test content editing**

Create tests asserting:

- Saving settings changes public nav/footer data.
- Saving a page header changes public page output.
- Disabling an item removes it from public output.
- Invalid metadata JSON returns an admin form error.

Run:

```powershell
npm test
```

Expected: PASS.

---

### Task 8: Media Library

**Files:**
- Create: `src/repositories/mediaRepository.js`
- Create: `src/services/mediaStorage.js`
- Create: `src/views/admin/media.ejs`
- Modify: `src/views/admin/pageEdit.ejs`
- Modify: `src/views/admin/itemEdit.ejs`
- Modify: `src/routes/adminRoutes.js`
- Test: `tests/admin/media.test.js`

- [ ] **Step 1: Add upload validation**

Allow:

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`

Reject:

- SVG
- files larger than 8 MB
- mismatched extension/MIME pairs
- empty files

- [ ] **Step 2: Store media files**

Save under:

```text
uploads/media/YYYY/MM/random-name.ext
```

Insert metadata into `media_assets`.

- [ ] **Step 3: Build media admin screen**

Support:

- Upload image
- Required alt text
- Optional caption
- List uploaded images
- Delete unused image

- [ ] **Step 4: Add image assignment**

Page and item editors allow selecting media assets. Public templates render assigned images; if no media is assigned, they render existing CSS photo placeholders.

- [ ] **Step 5: Test media behavior**

Create tests asserting:

- Valid image upload creates a media record.
- Invalid extension is rejected.
- Missing alt text is rejected.
- Assigned media appears in public HTML.
- Unassigned media fallback still renders.

Run:

```powershell
npm test
```

Expected: PASS.

---

### Task 9: Lead Admin And Audit Logging

**Files:**
- Create: `src/views/admin/leads.ejs`
- Create: `src/views/admin/leadDetail.ejs`
- Modify: `src/routes/adminRoutes.js`
- Modify: `src/repositories/leadRepository.js`
- Modify: `src/repositories/auditRepository.js`
- Test: `tests/admin/leads.test.js`

- [ ] **Step 1: Build lead list**

Show:

- Created date
- Name
- Phone
- Email
- ZIP
- Property type
- Camera count
- Status

Filter by status.

- [ ] **Step 2: Build lead detail**

Show all fields and request metadata:

- Notes
- Source path
- IP address
- User agent

- [ ] **Step 3: Add status updates**

Allow status updates to:

- `new`
- `contacted`
- `quoted`
- `won`
- `lost`
- `spam`

Log each status change to `admin_audit_log`.

- [ ] **Step 4: Test lead admin**

Create tests asserting:

- Logged-out users cannot view leads.
- Logged-in admin can list leads.
- Logged-in admin can change lead status.
- Status change creates an audit row.

Run:

```powershell
npm test
```

Expected: PASS.

---

### Task 10: Final Verification And Deployment Notes

**Files:**
- Modify: `tasks/todo.md`
- Create: `docs/deployment.md`
- Optional Create: `ecosystem.config.cjs` if PM2 is chosen

- [ ] **Step 1: Re-read changed files**

Before final verification, review:

- `src/app.js`
- `src/routes/publicRoutes.js`
- `src/routes/adminRoutes.js`
- `src/db/migrations/001_initial_schema.sql`
- `src/db/seeds/initialContent.js`
- public templates
- admin templates

- [ ] **Step 2: Run full automated verification**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 3: Run database verification**

Run:

```powershell
npm run db:migrate
npm run db:seed
```

Expected: migrations are applied or skipped cleanly; seed is idempotent.

- [ ] **Step 4: Run local browser smoke test**

Start:

```powershell
npm run dev
```

Verify:

- `/`
- `/residential.html`
- `/commercial.html`
- `/services.html`
- `/about.html`
- `/contact.html`
- `/admin/login`

Expected: pages render and are not blank. Mobile nav still opens.

- [ ] **Step 5: Verify admin workflow manually**

Complete:

- Create admin.
- Log in.
- Edit homepage hero title.
- Confirm public homepage changed.
- Upload one image.
- Assign it to a visible slot.
- Confirm public page renders the image.
- Submit quote form.
- Confirm lead appears in admin.
- Change lead status.
- Confirm audit event exists.

- [ ] **Step 6: Document deployment**

Create `docs/deployment.md` with:

- Required server packages.
- Environment variables.
- Migration and seed commands.
- Admin creation command.
- PM2 or systemd start command.
- Reverse proxy notes.
- Rollback note pointing to current static files.

- [ ] **Step 7: Record results**

Update `tasks/todo.md` with:

- Commands run.
- Pass/fail results.
- Any unverified items.
- Production credentials still needed from the user.

---

## Required Checkpoint Before Implementation

Per this project workflow, implementation starts only after the user confirms this plan. The recommended execution mode is subagent-driven implementation with one worker per independent slice, followed by main-agent review and integration.
