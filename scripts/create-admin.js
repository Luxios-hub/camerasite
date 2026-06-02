#!/usr/bin/env node

const { createAdminRepository } = require('../src/repositories/adminRepository');
const { endPool } = require('../src/db/pool');
const { hashPassword: defaultHashPassword } = require('../src/services/passwords');

const COMMAND_LINE_PASSWORD_ERROR = 'Do not pass admin passwords on the command line. Use ADMIN_PASSWORD or --password-stdin.';

function formatHelp() {
  return `
Usage: npm run admin:create -- --email admin@example.com --name "Admin" [--password-stdin]

Options:
  --email <email>       Admin email address.
  --name <name>         Admin display name.
  --password-stdin      Read the admin password from standard input.
  --help                Show this help message.

Password sources:
  ADMIN_PASSWORD        Preferred for automation when the environment is protected.
  --password-stdin      Preferred for piping a secret from a password manager.
`.trim();
}

function normalizeEmail(email) {
  return typeof email === 'string'
    ? email.trim().toLowerCase()
    : String(email || '').trim().toLowerCase();
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : String(value || '').trim();
}

function redactedArg(flag) {
  const text = typeof flag === 'string' ? flag : String(flag || '');

  if (!text.startsWith('--')) {
    return '[redacted]';
  }

  const separatorIndex = text.indexOf('=');

  if (separatorIndex === -1) {
    return text;
  }

  return `${text.slice(0, separatorIndex)}=[redacted]`;
}

function parseArgs(argv = []) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (flag === '--help') {
      return { help: true };
    }

    if (flag === '--password' || flag.startsWith('--password=')) {
      throw new Error(COMMAND_LINE_PASSWORD_ERROR);
    }

    if (flag === '--password-stdin') {
      parsed.passwordStdin = true;
      continue;
    }

    if (!['--email', '--name'].includes(flag)) {
      throw new Error(`Unknown argument: ${redactedArg(flag)}`);
    }

    if (typeof value !== 'string' || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }

    parsed[flag.slice(2)] = value.trim();
    index += 1;
  }

  return {
    email: normalizeEmail(parsed.email),
    name: stringValue(parsed.name),
    ...(parsed.passwordStdin ? { passwordStdin: true } : {})
  };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    process.stdin.on('error', reject);
  });
}

function passwordFromInput(input, dependencies = {}) {
  if (typeof input.password === 'string' && input.password.length > 0) {
    return input.password;
  }

  const env = dependencies.env || process.env;
  if (typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length > 0) {
    return env.ADMIN_PASSWORD;
  }

  return '';
}

async function createAdmin(input, dependencies = {}) {
  const email = normalizeEmail(input.email);
  const password = passwordFromInput(input, dependencies);
  const displayName = stringValue(input.name || input.displayName || email);

  if (!email) {
    throw new Error('Email is required.');
  }

  if (!password) {
    throw new Error('Password is required. Set ADMIN_PASSWORD or use --password-stdin.');
  }

  if (!displayName) {
    throw new Error('Name is required.');
  }

  const adminRepository = dependencies.adminRepository || createAdminRepository(dependencies.db);
  const hashPassword = dependencies.hashPassword || defaultHashPassword;
  const passwordHash = await hashPassword(password);

  return adminRepository.upsertAdmin({
    email,
    passwordHash,
    displayName
  });
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const input = parseArgs(argv);

  if (input.help) {
    if (!dependencies.silent) {
      console.log(formatHelp());
    }

    return null;
  }

  if (input.passwordStdin) {
    const stdinReader = dependencies.readStdin || readStdin;
    input.password = stringValue(await stdinReader());
  }

  const admin = await createAdmin(input, dependencies);

  if (!dependencies.silent) {
    console.log(`Admin ${admin.email} created or updated.`);
  }

  return admin;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await endPool();
    });
}

module.exports = {
  COMMAND_LINE_PASSWORD_ERROR,
  createAdmin,
  formatHelp,
  main,
  parseArgs,
  redactedArg
};
