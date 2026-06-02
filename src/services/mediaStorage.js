const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { env } = require('../config/env');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp']
]);

class MediaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MediaValidationError';
    this.statusCode = 400;
  }
}

function resolveDefaultRoot() {
  if (path.isAbsolute(env.UPLOAD_ROOT)) {
    return env.UPLOAD_ROOT;
  }

  return path.join(__dirname, '..', '..', env.UPLOAD_ROOT);
}

function stringValue(value) {
  return typeof value === 'string' ? value : String(value || '');
}

function trimmedText(value) {
  return stringValue(value).trim();
}

function basename(value) {
  const source = stringValue(value);
  return source.split(/[\\/]/).pop() || '';
}

function assertValidUpload(file, altText) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new MediaValidationError('Choose an image file to upload.');
  }

  if (!trimmedText(altText)) {
    throw new MediaValidationError('Alt text is required.');
  }

  const originalName = basename(file.originalname);
  const extension = path.extname(originalName).toLowerCase();
  const expectedMimeType = ALLOWED_MIME_BY_EXTENSION.get(extension);

  if (!expectedMimeType) {
    throw new MediaValidationError('Only JPG, PNG, and WebP images are allowed.');
  }

  const mimeType = trimmedText(file.mimetype).toLowerCase();
  if (mimeType !== expectedMimeType) {
    throw new MediaValidationError('File extension does not match MIME type.');
  }

  const sizeBytes = Number.isFinite(file.size) ? file.size : file.buffer.length;
  if (sizeBytes <= 0 || file.buffer.length <= 0) {
    throw new MediaValidationError('Uploaded image is empty.');
  }

  if (sizeBytes > MAX_IMAGE_BYTES || file.buffer.length > MAX_IMAGE_BYTES) {
    throw new MediaValidationError('Uploaded image must be 8MB or smaller.');
  }

  if (!matchesImageSignature(file.buffer, mimeType)) {
    throw new MediaValidationError('Uploaded image content does not match MIME type.');
  }

  return {
    originalName,
    extension,
    mimeType,
    sizeBytes
  };
}

function matchesImageSignature(buffer, mimeType) {
  if (mimeType === 'image/png') {
    return buffer.length >= 8
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a;
  }

  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3
      && buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff;
  }

  if (mimeType === 'image/webp') {
    return buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP';
  }

  return false;
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || !matchesImageSignature(buffer, 'image/png')) {
    return {};
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function jpegDimensions(buffer) {
  if (!matchesImageSignature(buffer, 'image/jpeg')) {
    return {};
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    const isSofMarker = (
      marker >= 0xc0
      && marker <= 0xcf
      && ![0xc4, 0xc8, 0xcc].includes(marker)
    );

    if (isSofMarker && offset + 8 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }

    if (length < 2) {
      break;
    }
    offset += 2 + length;
  }

  return {};
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function webpDimensions(buffer) {
  if (!matchesImageSignature(buffer, 'image/webp') || buffer.length < 30) {
    return {};
  }

  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1
    };
  }

  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }

  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }

  return {};
}

function imageDimensions(buffer, mimeType) {
  if (mimeType === 'image/png') {
    return pngDimensions(buffer);
  }

  if (mimeType === 'image/jpeg') {
    return jpegDimensions(buffer);
  }

  if (mimeType === 'image/webp') {
    return webpDimensions(buffer);
  }

  return {};
}

function safeResolve(root, ...segments) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...segments);

  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Resolved media path is outside the upload root.');
  }

  return target;
}

function storedNameParts(storedName) {
  const normalized = stringValue(storedName).replace(/\\/g, '/');

  if (normalized.startsWith('/') || normalized.includes('\0')) {
    throw new Error('Invalid stored media filename.');
  }

  const parts = normalized.split('/');
  if (parts.length !== 3 || parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    throw new Error('Invalid stored media filename.');
  }

  return parts;
}

function createStoredName({ extension, now, randomBytes }) {
  const date = now();
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const randomName = randomBytes(16).toString('hex');

  return `${year}/${month}/${randomName}${extension}`;
}

function createMediaStorage(options = {}) {
  const root = options.root || options.uploadRoot || resolveDefaultRoot();
  const now = options.now || (() => new Date());
  const randomBytes = options.randomBytes || crypto.randomBytes;

  async function storeMediaFile(file, input = {}) {
    const validation = assertValidUpload(file, input.altText);
    const dimensions = imageDimensions(file.buffer, validation.mimeType);
    const storedName = createStoredName({
      extension: validation.extension,
      now,
      randomBytes
    });
    const [year, month, filename] = storedNameParts(storedName);
    const directory = safeResolve(root, 'media', year, month);
    const targetPath = safeResolve(directory, filename);

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(targetPath, file.buffer, { flag: 'wx' });

    return {
      originalName: validation.originalName,
      storedName,
      mimeType: validation.mimeType,
      sizeBytes: validation.sizeBytes,
      width: dimensions.width || null,
      height: dimensions.height || null,
      altText: trimmedText(input.altText),
      caption: trimmedText(input.caption) || null,
      publicPath: `/uploads/media/${storedName}`
    };
  }

  async function deleteMediaFile(asset) {
    if (!asset || !asset.storedName) {
      return;
    }

    const parts = storedNameParts(asset.storedName);
    const targetPath = safeResolve(root, 'media', ...parts);
    await fs.rm(targetPath, { force: true });
  }

  return {
    root,
    storeMediaFile,
    deleteMediaFile
  };
}

module.exports = {
  ALLOWED_MIME_BY_EXTENSION,
  MAX_IMAGE_BYTES,
  MediaValidationError,
  createMediaStorage
};
