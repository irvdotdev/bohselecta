import { mkdir, copyFile, rm, writeFile } from 'node:fs/promises';

// dist is generated output: rebuild from the explicit public-file list so
// retired assets and hosting metadata cannot leak into a Pages deployment.
const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'docs.html', 'style.css', 'app.js', 'favicon.svg', 'dj-session.png', 'popup-poster.png', 'bohselecta-quickstart.mp4', 'bohselecta-quickstart.vtt']) {
  await copyFile(new URL(`../website/${file}`, import.meta.url), new URL(file, output));
}
await writeFile(new URL('.nojekyll', output), '');
console.log('Website ready in dist/');
