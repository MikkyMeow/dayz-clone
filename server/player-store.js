import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class PlayerStore {
  constructor(path) {
    this.path = path;
    this.players = new Map();
    this.pendingWrite = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      for (const [id, state] of Object.entries(parsed.players || {})) this.players.set(id, state);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Failed to load player saves:', error);
    }
  }

  get(id) { return this.players.get(id) || null; }

  save(id, state) {
    this.players.set(id, { ...state, savedAt: new Date().toISOString() });
    return this.flush();
  }

  flush() {
    const body = JSON.stringify({ version: 1, players: Object.fromEntries(this.players) }, null, 2);
    this.pendingWrite = this.pendingWrite.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, body, 'utf8');
      await rename(temporary, this.path);
    }).catch(error => console.error('Failed to save players:', error));
    return this.pendingWrite;
  }
}
