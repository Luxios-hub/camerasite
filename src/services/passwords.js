const bcrypt = require('bcrypt');

const BCRYPT_SALT_ROUNDS = 12;

function stringPassword(password) {
  return typeof password === 'string' ? password : String(password || '');
}

async function hashPassword(password) {
  const value = stringPassword(password);

  if (value.length === 0) {
    throw new Error('Password is required.');
  }

  return bcrypt.hash(value, BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(password, passwordHash) {
  const value = stringPassword(password);

  if (value.length === 0 || typeof passwordHash !== 'string' || passwordHash.length === 0) {
    return false;
  }

  try {
    return await bcrypt.compare(value, passwordHash);
  } catch (_error) {
    return false;
  }
}

module.exports = {
  BCRYPT_SALT_ROUNDS,
  hashPassword,
  verifyPassword
};
