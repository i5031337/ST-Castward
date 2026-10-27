import { readFileSync } from 'node:fs';

const url = new URL('../../src/tracker/status-apply-update.js', import.meta.url);
let source = readFileSync(url, 'utf8');
const dependencies = {};
const hostNames = [];
for (const match of source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];\s*/gm)) {
    const bindings = match[1].split(',').map(binding => binding.trim().split(/\s+as\s+/));
    const host = /(?:core\/settings|character-repository|\/events|st-context)\.js$/.test(match[2]);
    const module = host ? null : await import(new URL(match[2], url));
    for (const [original, alias] of bindings) {
        if (host) hostNames.push(alias || original);
        else dependencies[alias || original] = module[original];
    }
}
source = source.replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replace('export function bind', 'function bind');
const instantiate = new Function(...Object.keys(dependencies), ...hostNames, `${source}\nreturn bind;`);

/** Keep the production calculation imports; replace only host stores and events. */
export function bindTrackerUpdate(deps, boundaries) {
    const host = { eventSource: { emit() {} }, getAllCharacters: () => [], saveSettings() {},
        getContext: () => null, ...boundaries };
    instantiate(...Object.values(dependencies), ...hostNames.map(name => host[name]))(deps);
}
