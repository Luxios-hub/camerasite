const { Pool } = require('pg');
const { env } = require('../config/env');

function createPool(connectionString = env.DATABASE_URL, options = {}) {
  return new Pool({
    connectionString,
    ...options
  });
}

const pool = createPool(env.DATABASE_URL);

async function endPool() {
  await pool.end();
}

module.exports = {
  pool,
  createPool,
  endPool
};
