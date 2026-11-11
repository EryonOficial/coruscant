// Empacota o servidor (TypeScript) em um único arquivo ESM em dist/server e grava dist/build.json (commit e "cópia
// modificada", ver scripts/build-info.mjs).
import { build } from 'esbuild';
import { writeBuildInfo } from './build-info.mjs';

// Empacota dependências de runtime (ex.: zod) no bundle. Mantém externas só as opcionais/nativas
// e o Vite (carregado dinamicamente em --dev). Assim a imagem Docker continua sem node_modules.
await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: ['vite', 'node-pty', '@xterm/headless', '@xterm/addon-serialize'],
  sourcemap: true,
  logLevel: 'info',
});

const info = writeBuildInfo('dist/build.json');
console.log(`  dist/build.json  ${info.commit === 'unknown' ? 'unknown' : info.commit.slice(0, 12)}${info.dirty ? ' (dirty)' : ''}`);
