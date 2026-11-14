// PreToolUse (Edit|Write|MultiEdit): chặn sửa tay file sinh tự động hoặc nhạy cảm.
import { readFileSync } from 'node:fs';
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
const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
if (rel.startsWith('..')) process.exit(0);

const rules = [
  [/^dist\//, 'dist/ là output của `pnpm build`'],
  [/^openapi\.json$/, 'openapi.json được tạo bằng `pnpm openapi:export`'],
  [/^pnpm-lock\.yaml$/, 'pnpm-lock.yaml do pnpm quản lý (dùng pnpm add/remove)'],
  [/(^|\/)\.env(\.(?!example$)[^/]+)?$/, 'file .env chứa bí mật (chỉ sửa .env.example)'],
];

// DB-15: migration đã merge (liệt kê trong scripts/verify/merged-migrations.txt) không sửa, không đổi tên.
const mig = /^prisma\/migrations\/([^/]+)\//.exec(rel);
if (mig) {
  let merged = [];
  try {
    merged = readFileSync(path.join(root, 'scripts', 'verify', 'merged-migrations.txt'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    // Không đọc được danh sách thì không chặn, để gate migration-order của CI bắt.
  }
  if (merged.includes(mig[1])) {
    process.stderr.write(
      `Chặn sửa ${rel}: migration ${mig[1]} đã merge (DB-15). Sửa tiếp bằng một migration mới (roll-forward).\n`,
    );
    process.exit(2);
  }
}

for (const [re, why] of rules) {
  if (re.test(rel)) {
    process.stderr.write(`Chặn sửa tay ${rel}: ${why}. Nếu thật sự cần, hãy nhờ Owner sửa.\n`);
    process.exit(2);
  }
}
