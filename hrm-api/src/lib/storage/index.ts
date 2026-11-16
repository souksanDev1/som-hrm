import { createReadStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

/**
 * Binary storage adapter (architecture A7).
 *
 * Keys look like `{workspaceId}/{purpose}/{storedFileId}`; metadata (name, type, size, hash)
 * lives in the StoredFile table. Only the local-disk driver exists for now; an S3-compatible
 * driver for production can implement the same interface.
 */
export interface FileStorage {
  readonly driver: string;
  put(key: string, data: Buffer): Promise<void>;
  /** Readable stream of the stored bytes; rejects with `ENOENT`-style error when missing. */
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export const storageKey = (workspaceId: string, purpose: string, fileId: string) => `${workspaceId}/${purpose}/${fileId}`;

const SAFE_KEY = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

/** Local filesystem driver for development, tests and single-node deployments. */
export const createLocalFileStorage = (root: string): FileStorage => {
  const absoluteRoot = path.resolve(root);
  const resolve = (key: string) => {
    // Keys are generated server-side, but never let one escape the storage root.
    if (!SAFE_KEY.test(key)) throw new Error(`Invalid storage key: ${key}`);
    return path.join(absoluteRoot, key);
  };

  return {
    driver: 'local',
    async put(key, data) {
      const file = resolve(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
    },
    async get(key) {
      const file = resolve(key);
      await access(file);
      return createReadStream(file);
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
    async exists(key) {
      try {
        await access(resolve(key));
        return true;
      } catch {
        return false;
      }
    },
  };
};
