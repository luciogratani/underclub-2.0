/**
 * Static checks for the Vercel runtime constraints that the type checker
 * (Bundler resolution) does not enforce on its own.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = fileURLToPath(new URL('..', import.meta.url));

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const IMPORT_RE = /^\s*(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm;

function imports(file: string): Array<{ spec: string; statement: string }> {
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return [...src.matchAll(IMPORT_RE)].map((m) => ({ spec: (m[1] ?? m[2])!, statement: m[0].trim() }));
}

const serverFiles = [...tsFiles(join(webRoot, 'server')), ...tsFiles(join(webRoot, 'api'))];

describe('runtime import rules', () => {
  it('relative imports in server/ and api/ carry an explicit .js extension', () => {
    const bad = serverFiles.flatMap((f) =>
      imports(f)
        .filter((i) => i.spec.startsWith('.') && !i.spec.endsWith('.js'))
        .map((i) => `${relative(webRoot, f)}: ${i.spec}`),
    );
    expect(bad).toEqual([]);
  });

  it('@underclub/shared is imported as types only', () => {
    const bad = serverFiles.flatMap((f) =>
      imports(f)
        .filter((i) => i.spec.startsWith('@underclub/') && !/^(?:import|export)\s+type\s/.test(i.statement))
        .map((i) => `${relative(webRoot, f)}: ${i.statement}`),
    );
    expect(bad).toEqual([]);
  });

  it('api/ never reaches pg (a devDependency, not shipped)', () => {
    const bad = tsFiles(join(webRoot, 'api')).filter((f) => imports(f).some((i) => /rpc-pg|^pg$|dev\.js$/.test(i.spec)));
    expect(bad).toEqual([]);
  });

  it('the browser bundle (src/) never imports server code', () => {
    const bad = tsFiles(join(webRoot, 'src')).flatMap((f) =>
      imports(f)
        .filter((i) => /(^|\/)server\//.test(i.spec) || /^\.\.\/(\.\.\/)*server/.test(i.spec))
        .map((i) => `${relative(webRoot, f)}: ${i.spec}`),
    );
    expect(bad).toEqual([]);
  });
});
