const { pool } = require('../db/pool');

function integerLimit(value, fallback = 100, max = 500) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function mapMediaAsset(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    originalName: row.originalName ?? row.original_name,
    storedName: row.storedName ?? row.stored_name,
    mimeType: row.mimeType ?? row.mime_type,
    sizeBytes: row.sizeBytes ?? row.size_bytes,
    width: row.width ?? null,
    height: row.height ?? null,
    altText: row.altText ?? row.alt_text,
    caption: row.caption ?? null,
    publicPath: row.publicPath ?? row.public_path,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  };
}

function createMediaRepository(db = pool) {
  async function withTransaction(callback) {
    if (typeof db.connect !== 'function') {
      return callback(createMediaRepository(db), db);
    }

    const client = await db.connect();

    try {
      await client.query('begin');
      const result = await callback(createMediaRepository(client), client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function createMediaAsset(input) {
    const result = await db.query(
      `
        insert into media_assets (
          original_name,
          stored_name,
          mime_type,
          size_bytes,
          width,
          height,
          alt_text,
          caption,
          public_path
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning *
      `,
      [
        input.originalName,
        input.storedName,
        input.mimeType,
        input.sizeBytes,
        input.width || null,
        input.height || null,
        input.altText,
        input.caption || null,
        input.publicPath
      ]
    );

    return mapMediaAsset(result.rows[0]);
  }

  async function listMediaAssets(options = {}) {
    const limit = integerLimit(options.limit);
    const result = await db.query(
      `
        select *
        from media_assets
        order by created_at desc
        limit $1
      `,
      [limit]
    );

    return result.rows.map(mapMediaAsset);
  }

  async function getMediaAsset(id) {
    const result = await db.query(
      `
        select *
        from media_assets
        where id = $1
        limit 1
      `,
      [id]
    );

    return mapMediaAsset(result.rows[0]);
  }

  async function countMediaAssets() {
    const result = await db.query(
      `
        select count(*)::int as count
        from media_assets
      `
    );

    return result.rows[0] ? result.rows[0].count : 0;
  }

  async function isMediaAssetUsed(id) {
    const result = await db.query(
      `
        select exists (
          select 1
          from pages
          where og_image_media_id = $1
        ) or exists (
          select 1
          from content_items
          where image_media_id = $1
        ) as is_used
      `,
      [id]
    );

    return Boolean(result.rows[0] && result.rows[0].is_used);
  }

  async function deleteMediaAsset(id) {
    const result = await db.query(
      `
        delete from media_assets
        where id = $1
        returning *
      `,
      [id]
    );

    return mapMediaAsset(result.rows[0]);
  }

  async function deleteUnusedMediaAsset(id) {
    const result = await db.query(
      `
        delete from media_assets m
        where m.id = $1
          and not exists (
            select 1
            from pages
            where og_image_media_id = m.id
          )
          and not exists (
            select 1
            from content_items
            where image_media_id = m.id
          )
        returning m.*
      `,
      [id]
    );

    return mapMediaAsset(result.rows[0]);
  }

  return {
    withTransaction,
    createMediaAsset,
    listMediaAssets,
    getMediaAsset,
    countMediaAssets,
    isMediaAssetUsed,
    deleteMediaAsset,
    deleteUnusedMediaAsset
  };
}

module.exports = {
  createMediaRepository,
  mapMediaAsset
};
