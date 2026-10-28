// Turns the Vite build into one self-contained page: scripts and styles inlined, and only the
// page content (no <html>, <head>, or <body>), which is the shape claude.ai Artifacts publish.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
const asset = (href) => readFileSync(path.join(dist, href.replace(/^\//, '')), 'utf8');

const title = /<title>[\s\S]*?<\/title>/.exec(html)?.[0] ?? '';
// The font link spans several lines in index.html.
const fonts = [...html.matchAll(/<link\s[^>]*href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"[^>]*>/g)].map(
  (m) => `<link rel="stylesheet" href="${m[1]}">`,
);
const styles = [...html.matchAll(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/g)].map(
  (m) => `<style>\n${asset(m[1])}\n</style>`,
);
const scripts = [...html.matchAll(/<script type="module"[^>]*src="(\/assets\/[^"]+\.js)"[^>]*><\/script>/g)].map(
  // A literal "</script" inside the code would end the inline script early.
  (m) => `<script type="module">\n${asset(m[1]).replaceAll('</script', '<\\/script')}\n</script>`,
);
if (!title || fonts.length !== 1 || styles.length !== 1 || scripts.length !== 1) {
  throw new Error(
    `Unexpected build output: ${fonts.length} font links, ${styles.length} stylesheets, ${scripts.length} scripts`,
  );
}

const page = [title, ...fonts, ...styles, '<div id="root"></div>', ...scripts].join('\n');
const out = path.join(dist, 'shawarma-bay-demo.html');
writeFileSync(out, page + '\n');
console.log(`Wrote ${path.relative(process.cwd(), out)} (${(page.length / 1024).toFixed(0)} KB)`);
