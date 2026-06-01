const runMigrations = require('./migrate');
const { endPool, pool } = require('./pool');
const initialContent = require('./seeds/initialContent');
const { createContentRepository } = require('../repositories/contentRepository');

function writeLog(logger, message) {
  if (logger && typeof logger.log === 'function') {
    logger.log(message);
  }
}

async function seedSiteContent(options = {}) {
  const logger = options.logger === undefined ? console : options.logger;
  const content = options.content || initialContent;
  const migrate = options.migrate || runMigrations;
  const repository = options.repository || createContentRepository(options.pool || pool);
  const migrationOptions = {};

  if (options.pool) {
    migrationOptions.pool = options.pool;
  }
  if (logger) {
    migrationOptions.logger = logger;
  }

  if (options.runMigrations !== false) {
    await migrate(migrationOptions);
  }

  const summary = {
    settings: 0,
    pages: 0,
    blocks: 0,
    items: 0
  };

  for (const [key, value] of Object.entries(content.settings)) {
    await repository.upsertSiteSetting(key, value);
    summary.settings += 1;
  }

  for (const page of Object.values(content.pages)) {
    const savedPage = await repository.upsertPage(page);
    summary.pages += 1;

    for (const block of page.blocks) {
      const savedBlock = await repository.upsertBlock(savedPage.id, block);
      summary.blocks += 1;

      for (const item of block.items || []) {
        await repository.upsertItem(savedBlock.id, item);
        summary.items += 1;
      }
    }
  }

  writeLog(
    logger,
    `Seeded ${summary.settings} settings, ${summary.pages} pages, ${summary.blocks} blocks, ${summary.items} items.`
  );

  return summary;
}

if (require.main === module) {
  seedSiteContent()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await endPool();
    });
}

module.exports = seedSiteContent;
