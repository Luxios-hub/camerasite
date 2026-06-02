const { pool } = require('../db/pool');

const VALID_LEAD_STATUSES = new Set(['new', 'contacted', 'quoted', 'won', 'lost', 'spam']);

function textOrNull(value) {
  if (typeof value !== 'string') {
    return value == null ? null : String(value);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requiredText(value) {
  if (typeof value !== 'string') {
    return value == null ? '' : String(value).trim();
  }

  return value.trim();
}

function normalizeStatus(status = 'new') {
  const normalized = requiredText(status) || 'new';

  if (!VALID_LEAD_STATUSES.has(normalized)) {
    throw new Error(`Invalid lead status: ${normalized}`);
  }

  return normalized;
}

function limitValue(value, fallback = 50) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

function offsetValue(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function mapLead(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    zip: row.zip,
    propertyType: row.propertyType ?? row.property_type,
    cameraCount: row.cameraCount ?? row.camera_count ?? null,
    notes: row.notes ?? null,
    status: row.status,
    sourcePath: row.sourcePath ?? row.source_path,
    ipAddress: row.ipAddress ?? row.ip_address ?? null,
    userAgent: row.userAgent ?? row.user_agent ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  };
}

function createLeadRepository(db = pool) {
  async function createLead(input, requestMeta = {}) {
    const status = normalizeStatus(input.status);
    const result = await db.query(
      `
        insert into leads (
          name,
          phone,
          email,
          zip,
          property_type,
          camera_count,
          notes,
          status,
          source_path,
          ip_address,
          user_agent
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        returning *
      `,
      [
        requiredText(input.name),
        requiredText(input.phone),
        requiredText(input.email),
        requiredText(input.zip),
        requiredText(input.property_type ?? input.propertyType),
        textOrNull(input.camera_count ?? input.cameraCount),
        textOrNull(input.notes),
        status,
        requiredText(requestMeta.source_path ?? requestMeta.sourcePath ?? input.source_path ?? input.sourcePath) || '/contact',
        textOrNull(requestMeta.ip_address ?? requestMeta.ipAddress ?? input.ip_address ?? input.ipAddress),
        textOrNull(requestMeta.user_agent ?? requestMeta.userAgent ?? input.user_agent ?? input.userAgent)
      ]
    );

    return mapLead(result.rows[0]);
  }

  async function listLeads(filters = {}) {
    const clauses = [];
    const params = [];

    if (filters.status) {
      params.push(normalizeStatus(filters.status));
      clauses.push(`status = $${params.length}`);
    }

    const limit = limitValue(filters.limit);
    const offset = offsetValue(filters.offset);
    params.push(limit);
    const limitPlaceholder = `$${params.length}`;
    params.push(offset);
    const offsetPlaceholder = `$${params.length}`;

    const result = await db.query(
      `
        select *
        from leads
        ${clauses.length > 0 ? `where ${clauses.join(' and ')}` : ''}
        order by created_at desc
        limit ${limitPlaceholder}
        offset ${offsetPlaceholder}
      `,
      params
    );

    return result.rows.map(mapLead);
  }

  async function getLead(id) {
    const result = await db.query(
      `
        select *
        from leads
        where id = $1
        limit 1
      `,
      [id]
    );

    return mapLead(result.rows[0]);
  }

  async function updateLeadStatus(id, status) {
    const result = await db.query(
      `
        update leads
        set status = $2,
            updated_at = now()
        where id = $1
        returning *
      `,
      [id, normalizeStatus(status)]
    );

    return mapLead(result.rows[0]);
  }

  async function countLeadsByStatus() {
    const result = await db.query(
      `
        select status, count(*)::int as count
        from leads
        group by status
        order by status
      `
    );

    return result.rows.map((row) => ({
      status: row.status,
      count: row.count
    }));
  }

  return {
    createLead,
    listLeads,
    getLead,
    updateLeadStatus,
    countLeadsByStatus
  };
}

function defaultRepository() {
  return createLeadRepository(pool);
}

async function createLead(input, requestMeta) {
  return defaultRepository().createLead(input, requestMeta);
}

async function listLeads(filters) {
  return defaultRepository().listLeads(filters);
}

async function getLead(id) {
  return defaultRepository().getLead(id);
}

async function updateLeadStatus(id, status) {
  return defaultRepository().updateLeadStatus(id, status);
}

async function countLeadsByStatus() {
  return defaultRepository().countLeadsByStatus();
}

module.exports = {
  VALID_LEAD_STATUSES,
  createLeadRepository,
  createLead,
  listLeads,
  getLead,
  updateLeadStatus,
  countLeadsByStatus,
  mapLead
};
