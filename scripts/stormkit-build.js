const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const publicDir = path.join(rootDir, '.stormkit', 'public');

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

for (const entry of fs.readdirSync(frontendDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue;

  const sourcePath = path.join(frontendDir, entry.name);
  const targetPath = path.join(publicDir, entry.name);
  fs.copyFileSync(sourcePath, targetPath);
}

fs.copyFileSync(
  path.join(frontendDir, 'login.html'),
  path.join(publicDir, 'index.html')
);

console.log('Stormkit build: frontend copied to .stormkit/public');
