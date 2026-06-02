const { pool } = require('../db/pool');

function textOrNull(value) {
  if (value == null) {
    return null;
  }

  const text = typeof value === 'string' ? value.trim() : String(value).trim();
  return text.length > 0 ? text : null;
}

function requiredText(value, fieldName) {
  const text = textOrNull(value);

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function limitValue(value, fallback = 5) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

function mapAuditEvent(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    adminUserId: row.adminUserId ?? row.admin_user_id ?? null,
    action: row.action,
    entityType: row.entityType ?? row.entity_type,
    entityId: row.entityId ?? row.entity_id ?? null,
    summary: row.summary,
    createdAt: row.createdAt ?? row.created_at
  };
}

function createAuditRepository(db = pool) {
  async function logAuditEvent(input) {
    const result = await db.query(
      `
        insert into admin_audit_log (
          admin_user_id,
          action,
          entity_type,
          entity_id,
          summary
        )
        values ($1, $2, $3, $4, $5)
        returning *
      `,
      [
        textOrNull(input.adminUserId),
        requiredText(input.action, 'Action'),
        requiredText(input.entityType, 'Entity type'),
        textOrNull(input.entityId),
        requiredText(input.summary, 'Summary')
      ]
    );

    return mapAuditEvent(result.rows[0]);
  }

  async function listAuditEvents(options = {}) {
    const result = await db.query(
      `
        select *
        from admin_audit_log
        order by created_at desc
        limit $1
      `,
      [limitValue(options.limit)]
    );

    return result.rows.map(mapAuditEvent);
  }

  return {
    logAuditEvent,
    listAuditEvents
  };
}

function defaultRepository() {
  return createAuditRepository(pool);
}

async function logAuditEvent(input) {
  return defaultRepository().logAuditEvent(input);
}

async function listAuditEvents(options) {
  return defaultRepository().listAuditEvents(options);
}

module.exports = {
  createAuditRepository,
  logAuditEvent,
  listAuditEvents,
  mapAuditEvent
};
