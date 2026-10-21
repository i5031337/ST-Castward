import { currentPlaceContains } from './gemma-location-check.mjs';
import { changedPoolMaxima } from './tracker-pool-audit.mjs';

const includes = (value, wanted) => String(value || '').toLowerCase().includes(String(wanted).toLowerCase());
export function score(bundle, normalized, raw, finishReason, { strictJsonValid = true } = {}) {
    const u = normalized?.update || {}, rows = normalized?.places || [], state = bundle.state;
    const heldActor = name => normalized?.holdings?.characters?.find(c => includes(c.name, name));
    const heldItem = (owner, col, name) => owner?.collections?.[col]?.find(entry => String(entry.name).toLowerCase() === String(name).toLowerCase());
    // A new entry may use a plural noun; removals must resolve the exact stored identifier.
    const acquiredItem = (owner, col, name) => owner?.collections?.[col]?.find(entry => String(entry.name).toLowerCase().replace(/s$/, '') === String(name).toLowerCase().replace(/s$/, ''));
    const initialItem = (col, name) => heldItem(state.player, col, name);
    const actor = name => u.characters?.find(c => includes(c.name, name));
    const stat = (name) => u.player?.stats?.[name] ?? u.player?.[name] ?? state.player.stats[name];
    const effectiveStat = name => normalized?.effective?.player?.stats?.[name];
    const effectiveNpcStat = (actorName, field) => normalized?.effective?.characters?.find(actor => includes(actor.name, actorName))?.stats?.[field];
    const current = value => Number(String(value ?? '').split('/')[0]);
    const belowCapacity = value => { const parts = String(value ?? '').split('/').map(Number); return parts.length === 2 && parts[0] < parts[1]; };
    const inventory = owner => Object.values(owner?.collections || {}).some(col => ['add', 'remove', 'update'].some(verb => col?.[verb]?.length));
    // Holdings checks compare identities/counts after application. Repeating a known
    // outfit or an unchanged ability description is not an acquisition or loss.
    const holdings = (player, characters) => JSON.stringify([
        ['player', player], ...(characters || []).map(owner => [owner.name.toLowerCase(), owner]),
    ].flatMap(([name, owner]) => Object.entries(owner?.collections || {}).flatMap(([id, items]) =>
        (Array.isArray(items) ? items : []).map(item =>
            [name, id, String(item.name).toLowerCase(), Number(item.quantity ?? 1)])))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    const methods = {
        locationFlag: expected => typeof raw?.locationChanged === 'boolean'
            && raw.locationChanged === (expected === 'yes') && !raw.locations && !raw.global?.locations,
        placeCreated: name => rows.some(row => row.kind === 'location-create' && includes(row.actor, name)),
        currentPlace: name => currentPlaceContains(rows, state, name),
        placeParent: (childName, parentName) => {
            const child = rows.find(row => row.kind === 'location-create' && includes(row.actor, childName));
            const parent = rows.find(row => row.kind === 'location-create' && includes(row.actor, parentName));
            return Boolean(child && parent && child.location?.record?.parentId === parent.location?.id);
        },
        placeRoot: name => rows.some(row => row.kind === 'location-create' && includes(row.actor, name)
            && row.location?.record?.parentId === ''),
        createdPlaceCount: count => rows.filter(row => row.kind === 'location-create').length === count,
        worldContains: (key, value) => includes(u.global?.[key] ?? state.global[key], value),
        worldExcludes: (key, value) => !includes(u.global?.[key] ?? state.global[key], value),
        sameHoldings: () => Boolean(normalized?.holdings)
            && holdings(state.player, state.characters) === holdings(normalized.holdings.player, normalized.holdings.characters),
        npcPresent: name => Boolean(actor(name) && !actor(name).offstage),
        npcAbsent: name => !actor(name) || Boolean(actor(name).offstage),
        npcUnchanged: (name, field) => String(effectiveNpcStat(name, field)) === String(state.characters.find(c => c.name === name)?.stats[field]),
        npcDecreased: (name, field) => current(effectiveNpcStat(name, field)) < current(state.characters.find(c => c.name === name)?.stats[field]),
        npcStatContains: (name, field, value) => includes(effectiveNpcStat(name, field), value),
        npcStatMatches: (name, field, pattern) => new RegExp(pattern, 'i').test(String(effectiveNpcStat(name, field) ?? '')),
        playerXpIncreased: () => current(stat('XP')) > current(state.player.stats.XP),
        collectionHas: (name, col, itemName) => Boolean(heldItem(name === 'player' ? normalized?.holdings?.player : heldActor(name), col, itemName)),
        noInventoryAddsOrRemovesIn: col => [u.player, ...(u.characters || [])].every(owner =>
            !owner?.collections?.[col]?.add?.length && !owner?.collections?.[col]?.remove?.length),
        noXp: () => Number.parseFloat(stat('XP') || '0') === Number.parseFloat(state.player.stats.XP || '0'),
        noNpcXp: name => {
            const before = state.characters.find(char => includes(char.name, name))?.stats?.XP;
            const after = actor(name)?.stats?.XP ?? actor(name)?.XP ?? before;
            return Number.parseFloat(after || '0') === Number.parseFloat(before || '0');
        },
        noMovement: () => !rows.some(row => row.kind === 'location-current'),
        noPlaceCreated: name => !rows.some(row => row.kind === 'location-create' && includes(row.actor, name)),
        noInventoryChanges: () => !inventory(u.player) && !(u.characters || []).some(inventory),
        noInventoryAddsOrRemoves: () => [u.player, ...(u.characters || [])].every(owner =>
            Object.values(owner?.collections || {}).every(col => !(col?.add?.length || col?.remove?.length))),
        noPlayerInventoryChanges: () => !inventory(u.player),
        playerValue: (name, value) => String(stat(name)) === value,
        appliedPlayerValue: (name, value) => String(effectiveStat(name)) === value,
        appliedNpcValue: (name, field, value) => String(effectiveNpcStat(name, field)) === value,
        playerIncreased: name => current(effectiveStat(name)) > current(state.player.stats[name]),
        playerBelowCapacity: name => belowCapacity(effectiveStat(name)),
        playerDecreased: name => current(effectiveStat(name)) < current(state.player.stats[name]),
        playerUnchanged: name => String(effectiveStat(name)) === String(state.player.stats[name]),
        playerStatMatches: (name, pattern) => new RegExp(pattern, 'i').test(String(effectiveStat(name) ?? '')),
        playerChangeBetween: (name, low, high) => {
            const change = current(effectiveStat(name)) - current(state.player.stats[name]);
            return Number.isFinite(change) && change >= low && change <= high;
        },
        npcChangeBetween: (name, field, low, high) => {
            const before = state.characters.find(actor => actor.name === name)?.stats[field];
            const change = current(effectiveNpcStat(name, field)) - current(before);
            return Number.isFinite(change) && change >= low && change <= high;
        },
        itemAdd: (col, name, quantity) => Number(acquiredItem(normalized?.holdings?.player, col, name)?.quantity) === Number(initialItem(col, name)?.quantity || 0) + quantity,
        itemRemove: (col, name, quantity) => quantity === undefined ? !heldItem(normalized?.holdings?.player, col, name) : Number(heldItem(normalized?.holdings?.player, col, name)?.quantity || 0) === Number(initialItem(col, name)?.quantity) - quantity,
        npcItemAdd: (name, col, itemName, quantity) => Number(acquiredItem(heldActor(name), col, itemName)?.quantity) === quantity,
        npcIncreased: (name, field) => Number(actor(name)?.stats?.[field] ?? actor(name)?.[field]) > Number(state.characters.find(c => c.name === name)?.stats[field]),
        npcAppliedIncreased: (name, field) => current(effectiveNpcStat(name, field)) > current(state.characters.find(c => c.name === name)?.stats[field]),
        npcBelowCapacity: (name, field) => belowCapacity(effectiveNpcStat(name, field)),
        notRemoved: (col, name) => Boolean(heldItem(normalized?.holdings?.player, col, name)),
        relationshipUnchanged: name => !(actor(name)?.stats?.Relationship ?? actor(name)?.Relationship) || (actor(name)?.stats?.Relationship ?? actor(name)?.Relationship) === state.characters.find(c => c.name === name)?.stats.Relationship,
    };
    return [{ name: 'validJsonAndNotTruncated', critical: true, passed: Boolean(strictJsonValid && raw && typeof raw === 'object' && !Array.isArray(raw) && finishReason === 'stop') },
        { name: 'preservedPoolMaxima', critical: true, passed: changedPoolMaxima(raw, state).length === 0 },
        ...bundle.scenario.checks.map(([name, ...params]) => ({ name: `${name} ${params.filter(v => v !== true).join(' ')}`, critical: params.at(-1) === true,
            passed: Boolean(methods[name](...params.filter(v => v !== true))) }))];
}
