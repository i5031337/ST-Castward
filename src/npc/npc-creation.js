import { NPC_TOOL_PARAMETERS, NPC_GENERATION_INSTRUCTIONS, npcGenerationContract,
    npcGenerationPrompt, validateGeneratedNpc, randomIndex } from './npc-generation.js';
import { validateShape } from '../generation/validate-shape.js';

export function npcToolResult(card, reused = false) {
    return JSON.stringify({ ok: true, reused, id: card.id, name: card.name,
        npcTemplateId: card.npcTemplateId, profile: card.profile,
        stats: card.statusOverrides, collections: card.statusCollections,
        instruction: 'Use this exact name and profile when introducing this NPC. Creation alone does not place them in the scene. Their card remains available if this reply is swiped or regenerated.' });
}

/** One request per identity, with no live writes until generation and validation finish. */
export function createNpcCreationService({ getContext, getSettings, getCards, getChatCards,
    getForbiddenNames, buildContext, requestFor, commit, afterCommit = async () => {}, pick = randomIndex }) {
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
        const errors = validateShape(request, NPC_TOOL_PARAMETERS);
        if (errors.length || !request.requestKey.trim() || !request.role.trim() || !request.situation.trim()) {
            throw new Error(errors.slice(0, 3).join('; ') || 'Provide requestKey, role and situation.');
        }
        request = Object.fromEntries(Object.entries(request).map(([key, value]) => [key, value.trim()]));
        const context = getContext();
        const settings = getSettings();
        const metadata = context.chatMetadata;
        const chatId = context.getCurrentChatId();
        const system = settings.activeSystem;
        const connection = settings.loreProfileId;
        const matches = card => card.npcCreation?.requestKey === request.requestKey
            && card.npcCreation.system === system && card.npcCreation.chatId === chatId;
        const existing = getChatCards().find(matches);
        if (existing) return npcToolResult(existing, true);
        let jobs = pending.get(metadata);
        if (!jobs) { jobs = new Map(); pending.set(metadata, jobs); }
        const key = JSON.stringify([system, request.requestKey]);
        if (jobs.has(key)) return jobs.get(key);
        const controller = new AbortController();
        controllers.add(controller);
        const started = epoch;
        const contract = npcGenerationContract(settings);
        const signature = JSON.stringify(contract);
        const messages = (context.chat || []).map(message => ({ message, text: message.mes, swipe: message.swipe_id }));
        const latestUser = context.chat?.findLast(message => message.is_user);
        const isCurrent = () => enabled() && started === epoch && !controller.signal.aborted
            && getContext().chatMetadata === metadata && getContext().getCurrentChatId() === chatId
            && getSettings().activeSystem === system && getSettings().loreProfileId === connection
            && getContext().chat?.findLast(message => message.is_user) === latestUser
            && JSON.stringify(npcGenerationContract(getSettings())) === signature
            && messages.every(({ message, text, swipe }, index) => getContext().chat?.[index] === message
                && message.mes === text && message.swipe_id === swipe);
        const assertCurrent = () => { if (!isCurrent()) throw new Error('NPC creation cancelled because the chat, reply, System or settings changed.'); };
        const run = async () => {
            const generate = requestFor(settings);
            let userPrompt = npcGenerationPrompt(request, contract, buildContext(getCards()), pick);
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
            const card = commit({ ...draft, npcCreation: { requestKey: request.requestKey, system, chatId } });
            const currentCard = () => isCurrent() && getChatCards().includes(card);
            const warnings = [];
            try { await afterCommit(card, currentCard); }
            catch (error) { warnings.push(`NPC saved; lore synchronization failed: ${error.message}. Retry Fill from their sheet.`); }
            // Never return another chat's character to a resumed narrator.
            assertCurrent();
            if (!getChatCards().includes(card)) throw new Error('The created NPC was removed before creation finished.');
            return warnings.length ? JSON.stringify({ ...JSON.parse(npcToolResult(card)), warnings }) : npcToolResult(card);
        };
        const job = run().finally(() => {
            if (jobs.get(key) === job) jobs.delete(key);
            controllers.delete(controller);
        });
        jobs.set(key, job);
        return job;
    }
    return { create, enabled, invalidate };
}
