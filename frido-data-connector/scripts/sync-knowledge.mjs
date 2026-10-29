// Copies the readable rulebooks from docs/ into knowledge/ so the connector image is self-contained
// (the Docker build context is this folder only). Run before every deploy: npm run sync-knowledge
import { copyFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.join(here, '..', '..', 'docs');
const knowledge = path.join(here, '..', 'knowledge');
for (const f of ['PULSE_PLAYBOOK.md', 'PULSE_METRICS.md']) {
  copyFileSync(path.join(docs, f), path.join(knowledge, f));
  console.log(`synced ${f}`);
}
