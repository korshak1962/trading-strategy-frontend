// Shared helpers of the editor UX Stage A gates (G2a round trip, G3 captions).
// Baselines are RECORDED from master code (step F0) with `RECORD_EDITOR_BASELINES=1 npm test`
// and never re-recorded afterwards: a difference is a Stage A regression.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = path.resolve(here, '../fixtures/editor_roundtrip');
/* global process */
export const RECORD = process.env.RECORD_EDITOR_BASELINES === '1';

export const readJson = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
export const fixture = () => readJson('fixture.json');

/** In record mode writes `name`, otherwise returns the recorded baseline. */
export const baseline = (name, actual) => {
  const file = path.join(FIXTURE_DIR, name);
  if (RECORD) {
    fs.writeFileSync(file, `${JSON.stringify(actual, null, 1)}\n`);
    return actual;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

/** JSON round trip: drops `undefined` members exactly as the HTTP body would. */
export const wire = (o) => JSON.parse(JSON.stringify(o));
