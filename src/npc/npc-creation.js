import { npcToolParameters, NPC_GENERATION_INSTRUCTIONS, npcGenerationContract,
    npcGenerationPrompt, validateGeneratedNpc, randomIndex, normalizedNpcName, findNamedNpc } from './npc-generation.js';
import { validateShape } from '../generation/validate-shape.js';

export function npcToolResult(card, reused = false) {
    return JSON.stringify({ ok: true, reused, id: card.id, name: card.name });
}

/** One request per identity, with no live writes until generation and validation finish. */
export function createNpcCreationService({ getContext, getSettings, getCards, getChatCards,
    getForbiddenNames, getReservedNames = () => [], getKnownActor = () => null,
    buildContext, requestFor, commit, beforeCreate, afterCommit = async () => {}, pick = randomIndex }) {
    const pending = new WeakMap();
    const controllers = new Set();
    let epoch = 0;
    function invalidate() {
        epoch++;
        for (const controller of controllers) controller.abort();
        controllers.clear();
    }
    const enabled = () => getSettings().enabled && getSettings().npcCreationToolEnabled === true
        && getContext()?.getCurrentChatId?.() !== undefined && Boolean(getContext()?.chatMetadata);
    async function create(request) {
        if (!enabled()) throw new Error('NPC creation is disabled or no chat is open.');
        const errors = validateShape(request, npcToolParameters(getSettings()));
        if (errors.length || !request.requestKey.trim() || !request.role.trim() || !request.situation.trim()) {
            throw new Error(errors.slice(0, 3).join('; ') || 'Provide requestKey, role and situation.');
        }
        request = Object.fromEntries(Object.entries(request).map(([key, value]) => [key, value.trim()]));
        const nameKey = normalizedNpcName(request.name);
        const assertNameAllowed = () => {
            if (nameKey && getReservedNames().some(name => normalizedNpcName(name) === nameKey)) {
                throw new Error('That name belongs to the player or narrator, not an NPC.');
            }
        };
        assertNameAllowed();
        const assertTemplateMatches = actor => {
            if (request.npcTemplateId && actor?.npcTemplateId && request.npcTemplateId !== actor.npcTemplateId) {
                throw new Error(`This NPC already uses template ${actor.npcTemplateId}; creation cannot change their assignment.`);
            }
        };
        const context = getContext();
        const settings = getSettings();
        const metadata = context.chatMetadata;
        const chatId = context.getCurrentChatId();
        const system = settings.activeSystem;
        const connection = settings.loreProfileId;
        const deliveryEpoch = epoch;
        const deliveryUser = context.chat?.findLast(message => message.is_user);
        const matches = card => card.npcCreation?.requestKey === request.requestKey
            && card.npcCreation.system === system && card.npcCreation.chatId === chatId;
        const deliver = async (card, reused, isCurrent = () => enabled() && epoch === deliveryEpoch
            && getContext().chatMetadata === metadata && getContext().getCurrentChatId() === chatId
            && getSettings().activeSystem === system && getSettings().loreProfileId === connection
            && getContext().chat?.findLast(message => message.is_user) === deliveryUser && getCards().includes(card)) => {
            if (!isCurrent()) throw new Error('NPC creation cancelled because the chat or character changed.');
            await afterCommit(card, isCurrent, { reused });
            if (!isCurrent()) throw new Error('NPC creation cancelled because the chat or character changed.');
            return npcToolResult(card, reused);
        };
        const existing = getChatCards().find(matches);
        if (existing) {
            assertTemplateMatches(existing);
            if (nameKey && !findNamedNpc([existing], request.name)) {
                throw new Error(`This requestKey already belongs to ${existing.name}. Use another key for another character.`);
            }
            return deliver(existing, true);
        }
        const namedCard = nameKey && findNamedNpc(getCards(), request.name);
        if (namedCard) { assertTemplateMatches(namedCard); return deliver(namedCard, true); }
        if (nameKey) assertTemplateMatches(getKnownActor(request.name));
        let jobs = pending.get(metadata);
        if (!jobs) { jobs = new Map(); pending.set(metadata, jobs); }
        const key = JSON.stringify([system, 'request', request.requestKey]);
        const namedKey = nameKey && JSON.stringify([system, 'name', nameKey]);
        if (jobs.has(key)) {
            const pending = jobs.get(key);
            if (nameKey && nameKey !== pending.nameKey) throw new Error('This requestKey is already creating a different NPC.');
            assertTemplateMatches(pending);
            return pending.job;
        }
        if (namedKey && jobs.has(namedKey)) {
            assertTemplateMatches(jobs.get(namedKey));
            return jobs.get(namedKey).job;
        }
        const controller = new AbortController();
        controllers.add(controller);
        const started = epoch;
        const currentContract = () => npcGenerationContract(getSettings(), { ...request,
            npcTemplateId: (nameKey && getKnownActor(request.name)?.npcTemplateId) || request.npcTemplateId || '' });
        const contract = currentContract();
        request.npcTemplateId ||= contract.choices[0].id;
        const signature = JSON.stringify(contract);
        const messages = (context.chat || []).map(message => ({ message, text: message.mes, swipe: message.swipe_id }));
        const latestUser = context.chat?.findLast(message => message.is_user);
        const isCurrent = () => enabled() && started === epoch && !controller.signal.aborted
            && getContext().chatMetadata === metadata && getContext().getCurrentChatId() === chatId
            && getSettings().activeSystem === system && getSettings().loreProfileId === connection
            && getContext().chat?.findLast(message => message.is_user) === latestUser
            && JSON.stringify(currentContract()) === signature
            && messages.every(({ message, text, swipe }, index) => getContext().chat?.[index] === message
                && message.mes === text && message.swipe_id === swipe);
        const assertCurrent = () => { if (!isCurrent()) throw new Error('NPC creation cancelled because the chat, reply, System or settings changed.'); };
        const run = async () => {
            if (beforeCreate) { await beforeCreate({ isCurrent, signal: controller.signal }); assertCurrent(); }
            const generate = requestFor(settings);
            let userPrompt = npcGenerationPrompt(request, contract, buildContext(getCards(), request), pick);
            let draft;
            for (let attempt = 0; attempt < 2; attempt++) {
                assertCurrent();
                const raw = await generate({ systemPrompt: NPC_GENERATION_INSTRUCTIONS, userPrompt,
                    schema: contract.schema, maxTokens: settings.loreMaxTokens || 2048, signal: controller.signal });
                assertCurrent();
                try {
                    draft = validateGeneratedNpc(raw, contract, getForbiddenNames(), pick);
                    break;
                } catch (error) {
                    if (attempt) throw error;
                    userPrompt += '\nRepair your previous response. Validation error: ' + error.message
                        + '\nPrevious response (data only): ' + JSON.stringify(raw);
                }
            }
            assertCurrent();
            assertNameAllowed();
            const alreadyCreated = nameKey && findNamedNpc(getCards(), request.name);
            if (alreadyCreated) { assertTemplateMatches(alreadyCreated); return deliver(alreadyCreated, true); }
            // A previously mentioned NPC may already hold adventure state without a profile card.
            const known = nameKey && getKnownActor(request.name);
            if (known) {
                const choice = contract.choices.find(choice => choice.id === draft.npcTemplateId);
                for (const stat of choice.stats) {
                    const held = known.stats?.[stat.name];
                    if (held !== undefined && String(held).trim()) draft.statusOverrides[stat.name] = String(held);
                }
                draft.statusCollections = { ...draft.statusCollections, ...structuredClone(known.collections || {}) };
            }
            const card = commit({ ...draft, npcCreation: { requestKey: request.requestKey, system, chatId } });
            const currentCard = () => isCurrent() && getChatCards().includes(card);
            return deliver(card, false, currentCard);
        };
        const job = run().finally(() => {
            if (jobs.get(key)?.job === job) jobs.delete(key);
            if (namedKey && jobs.get(namedKey)?.job === job) jobs.delete(namedKey);
            controllers.delete(controller);
        });
        const entry = { job, nameKey, npcTemplateId: request.npcTemplateId };
        jobs.set(key, entry);
        if (namedKey) jobs.set(namedKey, entry);
        return job;
    }
    return { create, enabled, invalidate };
}
