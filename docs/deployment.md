# CamerasNYC Backend Deployment

## Server Target

Deploy the backend as a Node.js application on the existing Hetzner dedicated server with PostgreSQL.

The app serves:

- Public site pages
- Contact quote form
- Admin login and dashboard
- Content/page/settings editors
- Media uploads
- Lead management

## Required Server Packages

- Node.js LTS
- npm
- PostgreSQL
- Nginx or Caddy for HTTPS reverse proxy
- A process manager such as PM2 or systemd

## Environment Variables

Create a production `.env` on the server. Do not commit it.

```dotenv
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://DB_USER:DB_PASSWORD@127.0.0.1:5432/camerasnyc
SESSION_SECRET=replace-with-a-long-random-secret
PUBLIC_BASE_URL=https://camerasnyc.com
UPLOAD_ROOT=/var/www/camerasnyc/uploads
```

Notes:

- `SESSION_SECRET` must be a long random value.
- `DATABASE_URL` must not use the sample values from `.env.example`.
- `UPLOAD_ROOT` should be outside the repo if you want uploads to survive deploys.
- The Node process user must be able to create directories and write/delete files under `UPLOAD_ROOT`.
- Back up `UPLOAD_ROOT` together with PostgreSQL.

## PostgreSQL

Create the database and user in PostgreSQL or pgAdmin.

Example SQL:

```sql
create database camerasnyc;
create user camerasnyc_app with encrypted password 'replace-with-strong-password';
grant all privileges on database camerasnyc to camerasnyc_app;
\c camerasnyc
grant usage, create on schema public to camerasnyc_app;
```

The first migration runs `create extension if not exists pgcrypto` for UUID defaults. If the app user cannot create extensions/tables, run migrations as a DB owner or install the extension first, then grant the app user the needed schema privileges before migration.

## Install And Build

From the repo directory on the server:

```bash
npm ci
npm run db:migrate
npm run db:seed
```

`db:migrate` creates the schema. `db:seed` loads the current site content into editable records and is safe to run again.

## Create First Admin

Avoid passing passwords as command-line arguments. Use one of these safe paths.

Environment variable:

```bash
ADMIN_PASSWORD='temporary-strong-password' npm run admin:create -- --email admin@camerasnyc.com --name 'Admin'
```

Stdin:

```bash
printf '%s' 'temporary-strong-password' | npm run admin:create -- --email admin@camerasnyc.com --name 'Admin' --password-stdin
```

After logging in, rotate the password if the temporary value was shared.

## Start The App

PM2 example:

```bash
npm install -g pm2
pm2 start server.js --name camerasnyc
pm2 save
pm2 startup
```

Systemd is also fine. The service must run from the repo directory and load the production `.env`.

## Reverse Proxy

Nginx example:

```nginx
server {
  server_name camerasnyc.com www.camerasnyc.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable HTTPS with Certbot or use Caddy for automatic certificates.

In production, the app trusts the first reverse proxy so secure admin cookies and request IPs work behind Nginx/Caddy. Keep `X-Forwarded-Proto` and `X-Forwarded-For` headers enabled in the proxy config.

## Verification After Deploy

Run:

```bash
npm test
npm run db:migrate
npm run db:seed
```

Then verify in a browser:

- `/`
- `/residential.html`
- `/commercial.html`
- `/services.html`
- `/about.html`
- `/contact.html`
- `/admin/login`

Admin workflow:

- Log in.
- Edit homepage hero title and save.
- Confirm the public homepage changed.
- Upload one JPG/PNG/WebP image with alt text.
- Assign it to an item/page image slot.
- Confirm the public page renders the assigned image.
- Submit the quote form.
- Confirm the lead appears in `/admin/leads`.
- Change the lead status and confirm the audit event appears on the dashboard.

## Rollback

The original static HTML files remain in the repo. If the backend deploy has an issue, you can temporarily serve the static files again while backend fixes continue.

For backend rollback:

1. Stop the Node process.
2. Check out the previous known-good commit.
3. Run `npm ci`.
4. Restart the process.

Database migrations in this first backend pass are additive. Do not drop production tables during rollback.

## Known Local Verification Limitation

In the local development workspace used for this build, no explicit `DATABASE_URL` or `TEST_DATABASE_URL` was configured. The automated live PostgreSQL integration test was skipped locally. Run `npm run db:migrate`, `npm run db:seed`, and `npm test` on the Hetzner/PostgreSQL environment before production launch.
