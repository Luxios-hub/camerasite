const { pool } = require('../db/pool');

function jsonValue(value) {
  return value || {};
}

function mapPage(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    template: row.template,
    path: row.path,
    title: row.title,
    metaDescription: row.metaDescription ?? row.meta_description,
    ogTitle: row.ogTitle ?? row.og_title,
    ogDescription: row.ogDescription ?? row.og_description,
    ogImageMediaId: row.ogImageMediaId ?? row.og_image_media_id ?? null,
    canonicalPath: row.canonicalPath ?? row.canonical_path,
    headerEyebrow: row.headerEyebrow ?? row.header_eyebrow,
    headerTitle: row.headerTitle ?? row.header_title,
    headerLede: row.headerLede ?? row.header_lede,
    schemaType: row.schemaType ?? row.schema_type,
    schemaData: row.schemaData ?? row.schema_data ?? {},
    isPublished: row.isPublished ?? row.is_published,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  };
}

function mapBlock(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    pageId: row.pageId ?? row.page_id,
    blockKey: row.blockKey ?? row.block_key,
    blockType: row.blockType ?? row.block_type,
    eyebrow: row.eyebrow,
    title: row.title,
    lede: row.lede,
    body: row.body,
    settings: row.settings || {},
    sortOrder: row.sortOrder ?? row.sort_order,
    isEnabled: row.isEnabled ?? row.is_enabled,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  };
}

function mapItem(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    blockId: row.blockId ?? row.block_id,
    itemKey: row.itemKey ?? row.item_key,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    imageMediaId: row.imageMediaId ?? row.image_media_id ?? null,
    linkLabel: row.linkLabel ?? row.link_label,
    linkUrl: row.linkUrl ?? row.link_url,
    price: row.price,
    badge: row.badge,
    metadata: row.metadata || {},
    sortOrder: row.sortOrder ?? row.sort_order,
    isFeatured: row.isFeatured ?? row.is_featured,
    isEnabled: row.isEnabled ?? row.is_enabled,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  };
}

function createContentRepository(db = pool) {
  async function upsertSiteSetting(key, value) {
    const result = await db.query(
      `
        insert into site_settings (key, value)
        values ($1, $2::jsonb)
        on conflict (key) do update set
          value = excluded.value,
          updated_at = now()
        returning key, value, created_at, updated_at
      `,
      [key, value]
    );

    return result.rows[0];
  }

  async function upsertPage(page) {
    const result = await db.query(
      `
        insert into pages (
          slug,
          template,
          path,
          title,
          meta_description,
          og_title,
          og_description,
          canonical_path,
          header_eyebrow,
          header_title,
          header_lede,
          schema_type,
          schema_data,
          is_published
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
        on conflict (slug) do update set
          template = excluded.template,
          path = excluded.path,
          title = excluded.title,
          meta_description = excluded.meta_description,
          og_title = excluded.og_title,
          og_description = excluded.og_description,
          canonical_path = excluded.canonical_path,
          header_eyebrow = excluded.header_eyebrow,
          header_title = excluded.header_title,
          header_lede = excluded.header_lede,
          schema_type = excluded.schema_type,
          schema_data = excluded.schema_data,
          is_published = excluded.is_published,
          updated_at = now()
        returning *
      `,
      [
        page.slug,
        page.template,
        page.path,
        page.title,
        page.metaDescription,
        page.ogTitle,
        page.ogDescription,
        page.canonicalPath,
        page.headerEyebrow,
        page.headerTitle,
        page.headerLede,
        page.schemaType,
        jsonValue(page.schemaData),
        page.isPublished !== false
      ]
    );

    return mapPage(result.rows[0]);
  }

  async function upsertBlock(pageId, block) {
    const result = await db.query(
      `
        insert into content_blocks (
          page_id,
          block_key,
          block_type,
          eyebrow,
          title,
          lede,
          body,
          settings,
          sort_order,
          is_enabled
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
        on conflict (page_id, block_key) do update set
          block_type = excluded.block_type,
          eyebrow = excluded.eyebrow,
          title = excluded.title,
          lede = excluded.lede,
          body = excluded.body,
          settings = excluded.settings,
          sort_order = excluded.sort_order,
          is_enabled = excluded.is_enabled,
          updated_at = now()
        returning *
      `,
      [
        pageId,
        block.blockKey,
        block.blockType,
        block.eyebrow || null,
        block.title || null,
        block.lede || null,
        block.body || null,
        jsonValue(block.settings),
        block.sortOrder,
        block.isEnabled !== false
      ]
    );

    return mapBlock(result.rows[0]);
  }

  async function upsertItem(blockId, item) {
    const result = await db.query(
      `
        insert into content_items (
          block_id,
          item_key,
          title,
          subtitle,
          body,
          image_media_id,
          link_label,
          link_url,
          price,
          badge,
          metadata,
          sort_order,
          is_featured,
          is_enabled
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
        on conflict (block_id, item_key) where item_key is not null do update set
          title = excluded.title,
          subtitle = excluded.subtitle,
          body = excluded.body,
          image_media_id = excluded.image_media_id,
          link_label = excluded.link_label,
          link_url = excluded.link_url,
          price = excluded.price,
          badge = excluded.badge,
          metadata = excluded.metadata,
          sort_order = excluded.sort_order,
          is_featured = excluded.is_featured,
          is_enabled = excluded.is_enabled,
          updated_at = now()
        returning *
      `,
      [
        blockId,
        item.itemKey,
        item.title || null,
        item.subtitle || null,
        item.body || null,
        item.imageMediaId || null,
        item.linkLabel || null,
        item.linkUrl || null,
        item.price || null,
        item.badge || null,
        jsonValue(item.metadata),
        item.sortOrder,
        item.isFeatured === true,
        item.isEnabled !== false
      ]
    );

    return mapItem(result.rows[0]);
  }

  async function getPageBySlug(slug) {
    const result = await db.query(
      `
        select *
        from pages
        where slug = $1
        limit 1
      `,
      [slug]
    );

    return mapPage(result.rows[0]);
  }

  async function getPageWithBlocks(slug) {
    const page = await getPageBySlug(slug);

    if (!page) {
      return null;
    }

    const blockResult = await db.query(
      `
        select *
        from content_blocks
        where page_id = $1
        order by sort_order, block_key
      `,
      [page.id]
    );
    const blocks = blockResult.rows.map(mapBlock);

    if (blocks.length === 0) {
      return { ...page, blocks: [] };
    }

    const blockIds = blocks.map((currentBlock) => currentBlock.id);
    const itemResult = await db.query(
      `
        select *
        from content_items
        where block_id = any($1::uuid[])
        order by block_id, sort_order, item_key
      `,
      [blockIds]
    );

    const itemsByBlockId = new Map();
    for (const row of itemResult.rows) {
      const currentItem = mapItem(row);
      const existing = itemsByBlockId.get(currentItem.blockId) || [];
      existing.push(currentItem);
      itemsByBlockId.set(currentItem.blockId, existing);
    }

    return {
      ...page,
      blocks: blocks.map((currentBlock) => ({
        ...currentBlock,
        items: itemsByBlockId.get(currentBlock.id) || []
      }))
    };
  }

  async function getSiteSettings() {
    const result = await db.query(
      `
        select key, value
        from site_settings
        order by key
      `
    );

    return result.rows.reduce((settings, row) => {
      settings[row.key] = row.value;
      return settings;
    }, {});
  }

  return {
    upsertSiteSetting,
    upsertPage,
    upsertBlock,
    upsertItem,
    getPageBySlug,
    getPageWithBlocks,
    getSiteSettings
  };
}

module.exports = {
  createContentRepository,
  mapPage,
  mapBlock,
  mapItem
};
