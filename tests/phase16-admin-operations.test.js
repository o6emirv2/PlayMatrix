const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

test('phase16 ops route and ui exist', () => {
  const adminRoutes = fs.readFileSync(path.join(root, 'routes/admin.routes.js'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(root, 'public/admin/index.html'), 'utf8');
  assert.match(adminRoutes, /\/admin\/ops\/panel/);
  assert.match(adminHtml, /Operasyon Paneli Özeti/);
  assert.match(adminHtml, /renderOpsPanel/);
});

test('phase16 branding assets wired into home shell', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  assert.match(indexHtml, /assets\/branding\/pm-topbar-mark\.png/);
  assert.match(style, /pm-brand-topbar-art/);
  assert.match(style, /pm-brand-bottombar-art/);
});

test('phase16 safe cleanup removed orphan maintenance html', () => {
  const maybeDirs = fs.readdirSync(root).filter((name) => /Bak/i.test(name));
  const htmls = maybeDirs.flatMap((name) => fs.readdirSync(path.join(root, name)).filter((f) => /\.html$/i.test(f)).map((f) => path.join(name, f)));
  assert.equal(htmls.length, 0);
});
