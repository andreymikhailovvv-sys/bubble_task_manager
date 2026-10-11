import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Docker install fails closed and validates build tools before compiling', async () => {
  const dockerfile = await readFile(new URL('../../Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /npm ci --include=dev --no-audit --no-fund/);
  assert.match(dockerfile, /while \[ "\$attempt" -le 3 \]/);
  assert.match(dockerfile, /\[ -x node_modules\/\.bin\/tsc \]/);
  assert.match(dockerfile, /\[ -x node_modules\/\.bin\/vite \]/);
  assert.match(dockerfile, /\[ -x node_modules\/\.bin\/prisma \]/);
  assert.match(dockerfile, /npm ci failed after 3 attempts/);
  assert.match(dockerfile, /exit 1/);
  assert.doesNotMatch(dockerfile, /grep -Fq "Exit handler never called!"/);
  assert.ok(dockerfile.indexOf('COPY package.json package-lock.json') <
            dockerfile.indexOf('npm ci --include=dev'));
  assert.ok(dockerfile.indexOf('npm ci --include=dev') <
            dockerfile.indexOf('COPY . .'));
  assert.ok(dockerfile.indexOf('COPY . .') <
            dockerfile.indexOf('RUN npm run build'));
});
