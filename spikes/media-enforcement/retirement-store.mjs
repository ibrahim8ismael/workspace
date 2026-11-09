import {
  mkdirSync,
  readdirSync,
  readFileSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const name = (generation) => createHash('sha256').update(generation).digest('hex') + '.json';
const validate = (generation) => {
  if (typeof generation !== 'string' || !generation || generation.length > 256)
    throw new Error('invalid generation');
};
/** Durable deny-only tombstones. Any corrupt entry blocks startup rather than restoring access. */
export class RetirementStore {
  #directory;
  #retired = new Set();
  constructor(directory) {
    this.#directory = directory;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const file of readdirSync(directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(file)) throw new Error('unexpected retirement entry');
      const entry = JSON.parse(readFileSync(join(directory, file), 'utf8'));
      validate(entry.generation);
      if (Object.keys(entry).length !== 2 || entry.format !== 1 || name(entry.generation) !== file)
        throw new Error('invalid retirement entry');
      this.#retired.add(entry.generation);
    }
  }
  has(generation) {
    validate(generation);
    return this.#retired.has(generation);
  }
  retire(generation) {
    validate(generation);
    if (this.#retired.has(generation)) return;
    const path = join(this.#directory, name(generation));
    let fd;
    try {
      fd = openSync(path, 'wx', 0o600);
      writeFileSync(fd, JSON.stringify({ format: 1, generation }));
      fsyncSync(fd);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
    const directory = openSync(this.#directory, 'r');
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
    // A failed write never reports retirement as durably committed.
    this.#retired.add(generation);
  }
}
