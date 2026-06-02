const { pool } = require('../db/pool');

function normalizeEmail(email) {
  return typeof email === 'string'
    ? email.trim().toLowerCase()
    : String(email || '').trim().toLowerCase();
}

function requiredText(value, fieldName) {
  const text = typeof value === 'string' ? value.trim() : String(value || '').trim();

  if (text.length === 0) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function mapAdmin(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash ?? row.password_hash,
    displayName: row.displayName ?? row.display_name,
    isActive: row.isActive ?? row.is_active,
    lastLoginAt: row.lastLoginAt ?? row.last_login_at ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  };
}

function createAdminRepository(db = pool) {
  async function findAdminByEmail(email) {
    const normalizedEmail = normalizeEmail(email);

    if (normalizedEmail.length === 0) {
      return null;
    }

    const result = await db.query(
      `
        select *
        from admin_users
        where lower(email) = $1
        limit 1
      `,
      [normalizedEmail]
    );

    return mapAdmin(result.rows[0]);
  }

  async function findAdminById(id) {
    const adminId = requiredText(id, 'Admin id');
    const result = await db.query(
      `
        select *
        from admin_users
        where id = $1
        limit 1
      `,
      [adminId]
    );

    return mapAdmin(result.rows[0]);
  }

  async function upsertAdmin(input) {
    const email = requiredText(normalizeEmail(input.email), 'Email');
    const passwordHash = requiredText(input.passwordHash, 'Password hash');
    const displayName = requiredText(input.displayName, 'Display name');
    const result = await db.query(
      `
        insert into admin_users (
          email,
          password_hash,
          display_name,
          is_active
        )
        values ($1, $2, $3, true)
        on conflict (email) do update set
          password_hash = excluded.password_hash,
          display_name = excluded.display_name,
          is_active = true,
          updated_at = now()
        returning *
      `,
      [email, passwordHash, displayName]
    );

    return mapAdmin(result.rows[0]);
  }

  async function markLastLogin(id) {
    const adminId = requiredText(id, 'Admin id');
    const result = await db.query(
      `
        update admin_users
        set last_login_at = now(),
            updated_at = now()
        where id = $1
        returning *
      `,
      [adminId]
    );

    return mapAdmin(result.rows[0]);
  }

  return {
    findAdminByEmail,
    findAdminById,
    upsertAdmin,
    markLastLogin
  };
}

function defaultRepository() {
  return createAdminRepository(pool);
}

async function findAdminByEmail(email) {
  return defaultRepository().findAdminByEmail(email);
}

async function findAdminById(id) {
  return defaultRepository().findAdminById(id);
}

async function upsertAdmin(input) {
  return defaultRepository().upsertAdmin(input);
}

async function markLastLogin(id) {
  return defaultRepository().markLastLogin(id);
}

module.exports = {
  createAdminRepository,
  findAdminByEmail,
  findAdminById,
  upsertAdmin,
  markLastLogin,
  mapAdmin,
  normalizeEmail
};
