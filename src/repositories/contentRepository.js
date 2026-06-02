const { pool } = require('../db/pool');
const { mapMediaAsset } = require('./mediaRepository');

function jsonValue(value) {
  return value || {};
}

function integerValue(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : fallback;
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

function attachPageMedia(page, mediaById) {
  const media = page.ogImageMediaId ? mediaById.get(String(page.ogImageMediaId)) : null;

  if (!media) {
    return page;
  }

  return {
    ...page,
    ogImage: media,
    ogImageMedia: media
  };
}

function attachItemMedia(item, mediaById) {
  const media = item.imageMediaId ? mediaById.get(String(item.imageMediaId)) : null;

  if (!media) {
    return item;
  }

  return {
    ...item,
    media,
    image: media,
    imageMedia: media
  };
}

function createContentRepository(db = pool) {
  async function withTransaction(callback) {
    if (typeof db.connect !== 'function') {
      return callback(createContentRepository(db), db);
    }

    const client = await db.connect();

    try {
      await client.query('begin');
      const result = await callback(createContentRepository(client), client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

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
          og_image_media_id,
          canonical_path,
          header_eyebrow,
          header_title,
          header_lede,
          schema_type,
          schema_data,
          is_published
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)
        on conflict (slug) do update set
          template = excluded.template,
          path = excluded.path,
          title = excluded.title,
          meta_description = excluded.meta_description,
          og_title = excluded.og_title,
          og_description = excluded.og_description,
          og_image_media_id = excluded.og_image_media_id,
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
        page.ogImageMediaId || null,
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

  async function listPages() {
    const result = await db.query(
      `
        select *
        from pages
        order by slug
      `
    );

    return result.rows.map(mapPage);
  }

  async function countPages() {
    const result = await db.query(
      `
        select count(*)::int as count
        from pages
      `
    );

    return result.rows[0] ? result.rows[0].count : 0;
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

  async function updatePage(slug, input) {
    const result = await db.query(
      `
        update pages
        set title = $2,
            meta_description = $3,
            og_title = $4,
            og_description = $5,
            og_image_media_id = $6,
            canonical_path = $7,
            header_eyebrow = $8,
            header_title = $9,
            header_lede = $10,
            is_published = $11,
            updated_at = now()
        where slug = $1
        returning *
      `,
      [
        slug,
        input.title,
        input.metaDescription,
        input.ogTitle,
        input.ogDescription,
        input.ogImageMediaId || null,
        input.canonicalPath,
        input.headerEyebrow,
        input.headerTitle,
        input.headerLede,
        input.isPublished !== false
      ]
    );

    return mapPage(result.rows[0]);
  }

  async function updateBlock(slug, blockKey, input) {
    const result = await db.query(
      `
        update content_blocks
        set eyebrow = $3,
            title = $4,
            lede = $5,
            body = $6,
            is_enabled = $7,
            updated_at = now()
        where page_id = (
          select id
          from pages
          where slug = $1
          limit 1
        )
          and block_key = $2
        returning *
      `,
      [
        slug,
        blockKey,
        input.eyebrow || null,
        input.title || null,
        input.lede || null,
        input.body || null,
        input.isEnabled !== false
      ]
    );

    return mapBlock(result.rows[0]);
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
    const mappedItems = itemResult.rows.map(mapItem);
    const mediaIds = new Set();

    if (page.ogImageMediaId) {
      mediaIds.add(String(page.ogImageMediaId));
    }

    for (const item of mappedItems) {
      if (item.imageMediaId) {
        mediaIds.add(String(item.imageMediaId));
      }
    }

    const mediaById = new Map();
    if (mediaIds.size > 0) {
      const mediaResult = await db.query(
        `
          select *
          from media_assets
          where id = any($1::uuid[])
        `,
        [[...mediaIds]]
      );

      for (const row of mediaResult.rows) {
        const asset = mapMediaAsset(row);
        mediaById.set(String(asset.id), asset);
      }
    }

    const itemsByBlockId = new Map();
    for (const item of mappedItems) {
      const currentItem = attachItemMedia(item, mediaById);
      const existing = itemsByBlockId.get(currentItem.blockId) || [];
      existing.push(currentItem);
      itemsByBlockId.set(currentItem.blockId, existing);
    }

    return {
      ...attachPageMedia(page, mediaById),
      blocks: blocks.map((currentBlock) => ({
        ...currentBlock,
        items: itemsByBlockId.get(currentBlock.id) || []
      }))
    };
  }

  async function getBlockItem(slug, blockKey, itemId) {
    const result = await db.query(
      `
        select content_items.*
        from content_items
        join content_blocks on content_blocks.id = content_items.block_id
        join pages on pages.id = content_blocks.page_id
        where pages.slug = $1
          and content_blocks.block_key = $2
          and (content_items.id::text = $3 or content_items.item_key = $3)
        limit 1
      `,
      [slug, blockKey, itemId]
    );

    return mapItem(result.rows[0]);
  }

  async function createBlockItem(slug, blockKey, input) {
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
        values (
          (
            select content_blocks.id
            from content_blocks
            join pages on pages.id = content_blocks.page_id
            where pages.slug = $1
              and content_blocks.block_key = $2
            limit 1
          ),
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12::jsonb,
          $13,
          $14,
          $15
        )
        returning *
      `,
      [
        slug,
        blockKey,
        input.itemKey || null,
        input.title || null,
        input.subtitle || null,
        input.body || null,
        input.imageMediaId || null,
        input.linkLabel || null,
        input.linkUrl || null,
        input.price || null,
        input.badge || null,
        jsonValue(input.metadata),
        integerValue(input.sortOrder),
        input.isFeatured === true,
        input.isEnabled !== false
      ]
    );

    return mapItem(result.rows[0]);
  }

  async function updateBlockItem(slug, blockKey, itemId, input) {
    const result = await db.query(
      `
        update content_items
        set title = $4,
            subtitle = $5,
            body = $6,
            image_media_id = $7,
            link_label = $8,
            link_url = $9,
            price = $10,
            badge = $11,
            metadata = $12::jsonb,
            sort_order = $13,
            is_featured = $14,
            is_enabled = $15,
            updated_at = now()
        from content_blocks, pages
        where content_items.block_id = content_blocks.id
          and content_blocks.page_id = pages.id
          and pages.slug = $1
          and content_blocks.block_key = $2
          and (content_items.id::text = $3 or content_items.item_key = $3)
        returning content_items.*
      `,
      [
        slug,
        blockKey,
        itemId,
        input.title || null,
        input.subtitle || null,
        input.body || null,
        input.imageMediaId || null,
        input.linkLabel || null,
        input.linkUrl || null,
        input.price || null,
        input.badge || null,
        jsonValue(input.metadata),
        integerValue(input.sortOrder),
        input.isFeatured === true,
        input.isEnabled !== false
      ]
    );

    return mapItem(result.rows[0]);
  }

  async function disableBlockItem(slug, blockKey, itemId) {
    const result = await db.query(
      `
        update content_items
        set is_enabled = false,
            updated_at = now()
        from content_blocks, pages
        where content_items.block_id = content_blocks.id
          and content_blocks.page_id = pages.id
          and pages.slug = $1
          and content_blocks.block_key = $2
          and (content_items.id::text = $3 or content_items.item_key = $3)
        returning content_items.*
      `,
      [slug, blockKey, itemId]
    );

    return mapItem(result.rows[0]);
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
    withTransaction,
    upsertSiteSetting,
    upsertPage,
    upsertBlock,
    upsertItem,
    getPageBySlug,
    listPages,
    countPages,
    countMediaAssets,
    updatePage,
    updateBlock,
    getPageWithBlocks,
    getBlockItem,
    createBlockItem,
    updateBlockItem,
    disableBlockItem,
    getSiteSettings
  };
}

module.exports = {
  createContentRepository,
  mapPage,
  mapBlock,
  mapItem
};
