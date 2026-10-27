import { readFileSync } from 'node:fs';

const fixtureCaches = new WeakMap();
const fixtureSessionCaches = new WeakMap();
const forwardedOrigins = new WeakMap();
const originalFunction = value => {
    while (forwardedOrigins.has(value)) value = forwardedOrigins.get(value);
    return value;
};
const importPattern = /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];\s*/gm;
const root = new URL('../../src/', import.meta.url).href;

/** Evaluate production exports with named host imports supplied by an isolated fixture. */
export function loadStatusModule(url, inputs = {}, state = inputs) {
    url = url instanceof URL ? url : new URL(url, import.meta.url);
    let modules = fixtureCaches.get(state);
    if (!modules) fixtureCaches.set(state, modules = new Map());
    if (modules.has(url.href)) return modules.get(url.href);
    let source = readFileSync(url, 'utf8');
    const values = {};
    let cache = state.sessionCache || fixtureSessionCaches.get(state);
    if (!cache) {
        cache = Object.defineProperties({}, {
        state: { get: () => state.committedState, set: value => { state.committedState = value; } },
        chatId: { get: () => state.committedChatId, set: value => { state.committedChatId = value; } },
        });
        fixtureSessionCaches.set(state, cache);
    }
    const defaults = { STATE_KEY: 'sillynpc_status_state', HISTORY_KEY: 'sillynpc_status_history',
        SWIPE_BASE_KEY: 'sillynpc_swipe_base', PERSONA_KEY: 'sillynpc_persona', SYSTEM_KEY: 'sillynpc_system',
        sessionCache: cache };
    const overrides = inputs;
    const resolve = (name, path) => {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (Object.hasOwn(state, name)) {
            const original = originalFunction(state[name]);
            if (typeof original !== 'function') return original;
            const forwarded = (...args) => originalFunction(state[name] === forwarded ? original : state[name]).call(state, ...args);
            forwardedOrigins.set(forwarded, original);
            return forwarded;
        }
        if (Object.hasOwn(defaults, name)) return defaults[name];
        if (name === 'alignSwipeBaseAfterSave' && Object.hasOwn(state, 'alignSwipeBase')) {
            return () => state.alignSwipeBase?.();
        }
        const target = new URL(path, url);
        if (!target.href.startsWith(root)) return undefined;
        if (/\/(?:settings|characters|character-repository|activated-lore|system-npc-roster-runtime)\.js$/.test(target.pathname)) return undefined;
        // Imported functions can be resolved on first use. Tests may install a named
        // fixture dependency after constructing storage, just as they change host state.
        const dependencySource = readFileSync(target, 'utf8');
        if (new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).test(dependencySource)) {
            const forwarded = (...args) => {
                if (typeof state[name] === 'function' && state[name] !== forwarded) return state[name](...args);
                return loadStatusModule(target, inputs, state)[name](...args);
            };
            return forwarded;
        }
        return loadStatusModule(target, inputs, state)[name];
    };
    for (const match of source.matchAll(importPattern)) {
        const clause = match[1].trim();
        if (clause.startsWith('{')) {
            for (const binding of clause.slice(1, -1).split(',').filter(value => value.trim())) {
                const [original, local] = binding.trim().split(/\s+as\s+/);
                values[local || original] = resolve(original, match[2]);
            }
        } else if (clause.startsWith('* as ')) {
            const name = clause.slice(5).trim();
            values[name] = overrides[name] || loadStatusModule(new URL(match[2], url), inputs, state);
        } else throw new Error(`Unsupported fixture import ${clause} in ${url}`);
    }
    source = source.replace(importPattern, '');
    const exported = new Map();
    const starExports = {};
    source = source.replace(/^export\s+\*\s+from\s+['\"]([^'\"]+)['\"];\s*/gm, (_all, path) => {
        Object.assign(starExports, loadStatusModule(new URL(path, url), inputs, state));
        return '';
    });
    source = source.replace(/^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];\s*/gm, (_all, names, path) => {
        for (const binding of names.split(',').filter(value => value.trim())) {
            const [original, local] = binding.trim().split(/\s+as\s+/);
            const name = local || original;
            values[name] = resolve(original, path);
            exported.set(name, name);
        }
        return '';
    });
    source = source.replace(/^export\s+\{([^}]+)\};?\s*/gm, (_all, names) => {
        for (const binding of names.split(',').filter(value => value.trim())) {
            const [original, local] = binding.trim().split(/\s+as\s+/);
            exported.set(local || original, original);
        }
        return '';
    });
    for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)) exported.set(match[1], match[1]);
    source = source.replace(/\bexport\s+/g, '').replaceAll('import.meta.url', JSON.stringify(url.href));
    const result = new Function(...Object.keys(values), `${source}\nreturn {${[...exported].map(([key, value]) => `${key}: ${value}`).join(',')}};`)(...Object.values(values));
    Object.assign(result, starExports);
    modules.set(url.href, result);
    return result;
}

/** Existing behavioral fixtures share mutable host state, never a production registry. */
export function bindStatusModule(url, state, inputs = {}) {
    const api = loadStatusModule(url, inputs, state);
    Object.assign(state, api);
    return api;
}
