import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (file) => readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const inside = (root, file) => {
  const path = relative(root, file);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

// Rules use inline Markdown links and ATX headings. Ignore examples in code fences
// and inline code; reference-style links are rejected rather than silently missed.
export function prose(text) {
  let fence;
  return text
    .split(/\r?\n/)
    .map((line) => {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
        return '';
      }
      return fence ? '' : line;
    })
    .join('\n');
}

export function anchors(text) {
  const ids = new Set();
  for (const match of prose(text).matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = match[1]
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '')
      .replace(/\s/g, '-');
    let id = base;
    for (let n = 1; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
  }
  for (const match of prose(text).matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]);
  return ids;
}

function markdownFiles(directory, excluded = new Set()) {
  if (excluded.has(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path, excluded) : entry.name.endsWith('.md') ? [path] : [];
  });
}

export function checkRepository(root, config, strict = false) {
  root = resolve(root);
  const errors = [];
  const unavailable = new Set();
  const siblings = config.siblings.map((path) => resolve(root, path));
  const rules = resolve(root, config.rules);
  if (!existsSync(rules)) return { errors: [`Missing rules directory: ${rules}`], unavailable: [], files: 0, links: 0 };
  const ruleFiles = markdownFiles(rules);
  const excluded = new Set((config.excludeDirectories ?? []).map((path) => resolve(root, path)));
  const extraFiles = (config.directories ?? []).flatMap((path) => {
    const directory = resolve(root, path);
    if (!existsSync(directory)) {
      errors.push('Missing documentation directory: ' + path);
      return [];
    }
    return markdownFiles(directory, excluded);
  });
  const files = [...new Set([...ruleFiles, ...extraFiles, ...config.files.map((path) => resolve(root, path))])];
  const graph = new Map();
  let links = 0;
  for (const file of files) {
    graph.set(file, new Set());
    if (!existsSync(file)) {
      errors.push(`Missing instruction file: ${file}`);
      continue;
    }
    const text = prose(read(file)).replace(/(`+)[^\n]*?\1/g, '');
    if (/\[[^\]\n]+\]\s*\[[^\]\n]*\]|^\s*\[[^\]\n]+\]:/m.test(text))
      errors.push(`${file}: use inline links, not reference-style links`);
    const references = [
      ...[...text.matchAll(/\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g)].map((match) => ({
        href: match[1] ?? match[2],
        index: match.index,
      })),
      // Claude Code / Gemini CLI imports are checked like Markdown links.
      ...[...text.matchAll(/^@([^\s]+\.md)[ \t]*$/gm)].map((match) => ({
        href: match[1],
        index: match.index,
      })),
    ];
    for (const { href, index } of references) {
      if (/^(?:https?:|mailto:)/i.test(href)) continue;
      const label = `${relative(root, file)}:${text.slice(0, index).split('\n').length}`;
      if (/^[a-z][a-z\d+.-]*:|^[/\\]/i.test(href)) {
        errors.push(`${label}: non-relative file link ${href}`);
        continue;
      }
      let decoded;
      try {
        decoded = decodeURIComponent(href);
      } catch {
        errors.push(`${label}: invalid URL encoding ${href}`);
        continue;
      }
      const [path, anchor] = decoded.split('#');
      const target = path ? resolve(dirname(file), path) : file;
      graph.get(file).add(target);
      links++;
      const sibling = siblings.find((candidate) => inside(candidate, target));
      if (!inside(root, target) && !sibling) {
        errors.push(`${label}: link outside declared repositories ${href}`);
        continue;
      }
      if (sibling && !existsSync(sibling)) {
        unavailable.add(sibling);
        if (strict) errors.push(`${label}: missing sibling repository ${sibling}`);
        continue;
      }
      if (!existsSync(target)) {
        errors.push(`${label}: missing link target ${href}`);
        continue;
      }
      if (anchor && target.endsWith('.md') && !anchors(read(target)).has(anchor))
        errors.push(`${label}: missing anchor ${href}`);
    }
  }
  const seen = new Set();
  const pending = [resolve(root, config.entry)];
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    pending.push(...(graph.get(file) ?? []));
  }
  for (const file of ruleFiles)
    if (!seen.has(file)) errors.push(`Unreachable rule from ${config.entry}: ${relative(root, file)}`);
  // Required entry-point links/imports keep shared instructions reachable.
  for (const [from, to] of config.requiredEdges) {
    if (!graph.get(resolve(root, from))?.has(resolve(root, to))) errors.push(`Missing workflow edge: ${from} -> ${to}`);
  }
  return { errors, unavailable: [...unavailable], files: files.length, links };
}

export function main(args) {
  const be = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const config = JSON.parse(read(resolve(be, 'rules-check.config.json')));
  const workspace = args.includes('--workspace');
  if (args.some((arg) => arg !== '--workspace')) throw new Error('Usage: node scripts/check-rules.mjs [--workspace]');
  let failed = false;
  for (const repo of workspace ? config : config.slice(0, 1)) {
    const root = resolve(be, repo.root);
    const result = checkRepository(root, repo, workspace);
    console.log(`${repo.name}: ${result.files} files, ${result.links} links, ${result.errors.length} errors`);
    for (const path of result.unavailable) console.log(`UNAVAILABLE sibling: ${path} (not verified)`);
    for (const error of result.errors) console.error(error);
    failed ||= result.errors.length > 0;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
