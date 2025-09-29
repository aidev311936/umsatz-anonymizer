import { rm, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function main() {
  await rm('dist-tests', { recursive: true, force: true });
  await runCommand('tsc', ['-p', 'tsconfig.test.json']);
  await writeFile('dist-tests/package.json', '{"type":"commonjs"}\n');
  const testDir = 'dist-tests/tests';
  const entries = await readdir(testDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(testDir, entry.name));
  if (files.length === 0) {
    throw new Error('Keine Testdateien gefunden.');
  }
  await runCommand('node', ['--test', ...files]);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
