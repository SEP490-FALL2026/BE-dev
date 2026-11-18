// PostToolUse (Edit|Write|MultiEdit): chạy prettier --write cho đúng file .ts vừa sửa.
// Không chạy eslint ở đây: lint type-aware mất ~30 s/file. Dùng skill be-quick-check cho lint.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const file = input?.tool_input?.file_path;
if (typeof file !== 'string') process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const abs = path.resolve(root, file);
const rel = path.relative(root, abs).split(path.sep).join('/');

// Chỉ file .ts/.mjs/.cjs trong src, test, scripts (khớp script `format` của package.json).
if (rel.startsWith('..') || !/^(src|test|scripts)\/.+\.(ts|mjs|cjs)$/.test(rel)) process.exit(0);
if (!existsSync(abs)) process.exit(0);

const bin = path.join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
if (!existsSync(bin)) process.exit(0);

const res = spawnSync(process.execPath, [bin, '--write', abs], { cwd: root, encoding: 'utf8' });
if (res.status !== 0) {
  process.stderr.write(`prettier lỗi trên ${rel}:\n${res.stderr || res.stdout}`);
  process.exit(2);
}
