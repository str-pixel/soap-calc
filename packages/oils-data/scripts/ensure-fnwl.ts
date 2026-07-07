import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fnwlPath = join(__dirname, '../sources/fnwl-sapon.txt');
const inciPath = join(__dirname, '../sources/fnwl-inci.txt');
const glossaryPath = join(__dirname, '../sources/cosing-glossary-index.json');

function run(script: string): void {
  const result = spawnSync('npm', ['run', script], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(fnwlPath)) {
  run('fetch:fnwl');
}

if (!existsSync(inciPath) || !existsSync(glossaryPath)) {
  run('fetch:fnwl-inci');
}
