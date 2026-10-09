import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendDir, '..');
const webDir = path.join(repoRoot, 'web');
const distDir = path.join(frontendDir, 'dist');
const destDir = path.join(webDir, 'next');
const stagingDir = path.join(webDir, '.next-staging');
const guarded = ['index.html', 'js/app.js', 'css/styles.css'].map((name) => path.join(webDir, name));

if (path.relative(webDir, destDir) !== 'next') {
  throw new Error('Отказ: публикация разрешена только в web/next');
}

await stat(path.join(distDir, 'index.html'));
const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
if (/https?:\/\//i.test(html)) throw new Error('dist/index.html содержит внешний URL');

const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const before = await Promise.all(guarded.map(hash));

await rm(stagingDir, { recursive: true, force: true });
await mkdir(stagingDir, { recursive: true });
await cp(distDir, stagingDir, { recursive: true });
await rm(destDir, { recursive: true, force: true });
await rename(stagingDir, destDir);

const after = await Promise.all(guarded.map(hash));
before.forEach((value, index) => {
  if (value !== after[index]) throw new Error(`Старый UI изменён: ${guarded[index]}`);
});

console.log(`опубликовано: ${path.relative(repoRoot, destDir)}`);
