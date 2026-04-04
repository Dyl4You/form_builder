const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const { Storage } = require('@google-cloud/storage');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class FilesystemBlobStore {
  constructor(options = {}) {
    this.rootDir = options.rootDir || path.join(__dirname, '..', '..', 'data', 'template-blobs');
  }

  async ensureReady() {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  async putJson(blobKey, payload) {
    await this.ensureReady();
    const raw = Buffer.from(JSON.stringify(payload), 'utf8');
    const compressed = await gzip(raw);
    return this.putBuffer(blobKey, compressed, {
      contentType: 'application/json',
      contentEncoding: 'gzip'
    });
  }

  async getJson(blobKey) {
    const compressed = await this.getBuffer(blobKey);
    const raw = await gunzip(compressed);
    return JSON.parse(raw.toString('utf8'));
  }

  async putBuffer(blobKey, payload, options = {}) {
    await this.ensureReady();
    const fullPath = path.join(this.rootDir, blobKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    await fs.writeFile(fullPath, buffer);
    return {
      blobKey,
      sizeBytes: buffer.byteLength,
      contentType: options.contentType || 'application/octet-stream',
      contentEncoding: options.contentEncoding || null
    };
  }

  async getBuffer(blobKey) {
    const fullPath = path.join(this.rootDir, blobKey);
    return fs.readFile(fullPath);
  }

  async delete(blobKey) {
    try {
      await fs.unlink(path.join(this.rootDir, blobKey));
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }

  async deletePrefix(prefix) {
    const baseDir = path.join(this.rootDir, prefix);
    await fs.rm(baseDir, { recursive: true, force: true });
  }
}

class GcsBlobStore {
  constructor(options = {}) {
    if (!options.bucketName) {
      throw new Error('GCS blob store requires a bucketName.');
    }
    this.bucketName = options.bucketName;
    this.storage = options.storage || new Storage(options.clientOptions || {});
    this.bucket = this.storage.bucket(this.bucketName);
  }

  async ensureReady() {
    return true;
  }

  async putJson(blobKey, payload) {
    const compressed = await gzip(Buffer.from(JSON.stringify(payload), 'utf8'));
    return this.putBuffer(blobKey, compressed, {
      contentType: 'application/json',
      contentEncoding: 'gzip'
    });
  }

  async getJson(blobKey) {
    const buffer = await this.getBuffer(blobKey);
    const raw = await gunzip(buffer);
    return JSON.parse(raw.toString('utf8'));
  }

  async putBuffer(blobKey, payload, options = {}) {
    const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    const file = this.bucket.file(blobKey);
    const metadata = {
      contentType: options.contentType || 'application/octet-stream'
    };
    if (options.contentEncoding) metadata.contentEncoding = options.contentEncoding;
    if (options.cacheControl) metadata.cacheControl = options.cacheControl;
    await file.save(buffer, {
      resumable: false,
      metadata
    });
    return {
      blobKey,
      sizeBytes: buffer.byteLength,
      contentType: metadata.contentType,
      contentEncoding: metadata.contentEncoding || null
    };
  }

  async getBuffer(blobKey) {
    const file = this.bucket.file(blobKey);
    const [buffer] = await file.download();
    return buffer;
  }

  async delete(blobKey) {
    try {
      await this.bucket.file(blobKey).delete({ ignoreNotFound: true });
    } catch (err) {
      if (err?.code !== 404) throw err;
    }
  }

  async deletePrefix(prefix) {
    await this.bucket.deleteFiles({ prefix, force: true });
  }
}

function createBlobStore(options = {}) {
  const driver = String(options.driver || process.env.TEMPLATE_BLOB_DRIVER || '').trim().toLowerCase();
  if (driver === 'gcs' || (!driver && process.env.GCS_TEMPLATE_BUCKET)) {
    return new GcsBlobStore({
      bucketName: options.bucketName || process.env.GCS_TEMPLATE_BUCKET,
      clientOptions: options.clientOptions
    });
  }

  return new FilesystemBlobStore({
    rootDir: options.rootDir || process.env.TEMPLATE_BLOB_ROOT
  });
}

module.exports = {
  FilesystemBlobStore,
  GcsBlobStore,
  createBlobStore
};
