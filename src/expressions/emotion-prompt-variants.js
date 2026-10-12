/** Distinct facial expressions and poses, readable even in small NPC sprites. */
export const EMOTION_PROMPT_VARIANTS = Object.freeze(Object.fromEntries(Object.entries({
    admiration: [
        'Awestruck admiration: enormous sparkling eyes, eyebrows lifted high, mouth open in a delighted gasp; lean forward with both hands clasped under the chin.',
        'Hero-worshipping admiration: radiant wide smile and shining upward gaze; press both hands to the heart, shoulders lifted and chest drawn forward.',
        'Entranced admiration: wide attentive eyes and an astonished open smile; tilt the head sharply and reach one open hand toward the admired person.',
    ],
    amusement: [
        'Uncontrollable amusement: eyes squeezed shut, cheeks raised and mouth wide in laughter; bend forward with one hand clutching the stomach.',
        'Mischievous amusement: exaggerated crooked grin, one eyebrow raised high and eyes gleaming; lean sideways with a hand covering a barely contained snicker.',
        'Gleeful amusement: broad toothy smile and crinkled eyes; throw the head back with shoulders raised and both hands spread in playful disbelief.',
    ],
    anger: [
        'Explosive anger: deeply knotted eyebrows, blazing wide eyes and bared teeth; lean aggressively forward with both fists clenched beside the chest.',
        'Furious confrontation: sharply lowered brows, glaring eyes and mouth wide in a shout; thrust one accusing finger forward with the other hand planted on the hip.',
        'Seething anger: narrowed eyes, flared nostrils and tightly gritted teeth; stand rigid with squared shoulders and arms crossed hard against the chest.',
    ],
    annoyance: [
        'Exasperated annoyance: dramatic eye roll, raised brows and a twisted grimace; slump sideways with one hand pressed to the forehead.',
        'Impatient annoyance: half-lidded glare and exaggerated pursed lips; plant both hands on the hips and tilt the head sharply to one side.',
        'Irritated annoyance: squinting eyes and a deeply lopsided frown; turn the torso away with shoulders hunched and one palm raised dismissively.',
    ],
    approval: [
        'Enthusiastic approval: huge toothy grin and strongly raised eyebrows; lean forward and give a prominent thumbs-up beside the face.',
        'Confident approval: broad satisfied smile and bright direct eyes; hold the chin high, chest open, with both hands firmly on the hips.',
        'Wholehearted approval: eyes crinkled with delight and a beaming smile; bring the hands together in an emphatic clapping pose with shoulders raised.',
    ],
    caring: [
        'Protective caring: deeply concerned raised inner brows, wide gentle eyes and a reassuring smile; lean forward with both open hands extended to comfort.',
        'Nurturing caring: warm crinkled eyes and an exaggerated tender smile; tilt the head toward the viewer with one hand over the heart and the other reaching out.',
        'Urgent caring: worried wide eyes, pinched inner brows and parted lips; hunch toward the viewer with arms opened in a protective embrace.',
    ],
    confusion: [
        'Utter confusion: one eyebrow high and the other low, eyes wide and mouth crooked open; scratch the head with one hand and tilt the head dramatically.',
        'Baffled confusion: deeply furrowed brows, squinting eyes and puckered lips; lift both palms beside the shoulders in an exaggerated helpless shrug.',
        'Bewildered confusion: raised uneven brows and a slack open mouth; lean back with one hand cupping the chin and the other held palm-up.',
    ],
    curiosity: [
        'Eager curiosity: eyes wide and focused, eyebrows arched high and lips parted; lean far forward with hands clasped behind the back.',
        'Investigative curiosity: one brow dramatically raised, eyes narrowed in concentration and lips puckered; tilt the head with one hand under the chin.',
        'Playful curiosity: bright searching eyes and a broad questioning smile; crane the neck sideways and lift one open hand beside the face as if asking a question.',
    ],
    desire: [
        'Intense longing: heavy-lidded intent eyes, strongly flushed cheeks and parted lips; lean toward the viewer with one hand reaching out and shoulders drawn forward.',
        'Bold desire: piercing direct gaze and a wide inviting crooked smile; angle the torso forward with one hand on the hip and the other beckoning.',
        'Yearning desire: wide wistful eyes, raised inner brows and trembling parted lips; clutch both hands tightly to the chest and stretch the neck toward the viewer.',
    ],
    disappointment: [
        'Crushing disappointment: heavy lowered eyelids and a deep downturned mouth; let the shoulders sag dramatically with arms hanging limp.',
        'Disbelieving disappointment: pinched raised inner brows, sad wide eyes and lips pressed into a crooked frown; lean back with one hand covering the forehead.',
        'Deflated disappointment: lowered gaze, deeply furrowed brows and a pronounced pout; bow the head with hands clasped loosely in front and chest caved inward.',
    ],
    disapproval: [
        'Stern disapproval: sharply narrowed eyes, deeply lowered brows and tightly pursed lips; cross the arms firmly and lift the chin in judgment.',
        'Scolding disapproval: arched severe brows, hard direct eyes and an open reprimanding mouth; lean forward with one warning finger raised beside the face.',
        'Disdainful disapproval: one brow high, half-lidded eyes and a strongly downturned sneer; turn the torso aside with one palm held out in rejection.',
    ],
    disgust: [
        'Overwhelming disgust: nose deeply wrinkled, eyes squeezed narrow and upper lip curled high; recoil backward with both hands raised defensively.',
        'Nauseated disgust: tightly pinched brows and bulging watery eyes; cover the mouth with one hand and bend forward with the other clutching the stomach.',
        'Repulsed disgust: glaring squint, wrinkled nose and mouth twisted into an open grimace; turn the head sharply away and push one open palm outward.',
    ],
    embarrassment: [
        'Mortified embarrassment: intensely flushed cheeks, enormous darting eyes and a strained toothy smile; hunch the shoulders and clutch both hands near the chest.',
        'Overwhelmed embarrassment: red cheeks, eyes squeezed shut and a trembling grimace; cover most of the face with both hands and curl the torso inward.',
        'Flustered embarrassment: vivid blush, raised uneven brows and an awkward open smile; twist the torso aside with one hand rubbing the back of the neck.',
    ],
    excitement: [
        'Explosive excitement: huge sparkling eyes and mouth wide in a delighted shout; throw both fists upward beside the head with shoulders lifted.',
        'Barely contained excitement: eyebrows sky-high and an enormous toothy grin; lean forward with both hands clasped tightly under the chin.',
        'Triumphant excitement: eyes squeezed into joyful crescents and mouth open in a cheer; spread both arms wide with the chest thrust upward.',
    ],
    fear: [
        'Panic-stricken fear: bulging eyes, high pinched brows and mouth wide in a scream; recoil sharply with both hands raised to shield the face.',
        'Frozen terror: enormous unblinking eyes, raised tense brows and trembling parted lips; hold the shoulders rigidly high with hands clutching the chest.',
        'Cowering fear: wide eyes looking sideways and mouth stretched in a frightened grimace; curl inward with chin tucked and forearms protecting the head.',
    ],
    gratitude: [
        'Overflowing gratitude: shining tearful eyes and an enormous heartfelt smile; press both hands over the heart and lean forward warmly.',
        'Earnest gratitude: raised inner brows, bright eyes and a beaming open smile; bow the head deeply with hands clasped tightly beneath the chin.',
        'Joyful gratitude: eyes crinkled shut and cheeks lifted in a broad smile; reach both arms toward the viewer in an eager embracing pose.',
    ],
    grief: [
        'Devastating grief: tears streaming, eyebrows pulled steeply upward in the middle and mouth open in a sob; collapse forward with hands clutching the chest.',
        'Despairing grief: tear-filled eyes squeezed shut and lips trembling in a deep frown; cover the face with both hands and hunch the shoulders heavily.',
        'Raw grief: wet wide eyes looking upward and mouth twisted in a cry; throw the head back with one hand gripping the heart and the other reaching helplessly outward.',
    ],
    joy: [
        'Radiant joy: huge toothy smile, sparkling eyes and lifted cheeks; open both arms wide with the chest raised toward the viewer.',
        'Blissful joy: eyes squeezed shut in happy crescents and a beaming open smile; hug the arms around the torso with shoulders raised in delight.',
        'Bubbly joy: wide shining eyes and mouth open in a gleeful laugh; tilt the head dramatically with both hands lifted beside the cheeks.',
    ],
    love: [
        'Adoring love: large tender eyes, vividly flushed cheeks and a beaming affectionate smile; tilt the head deeply with both hands pressed over the heart.',
        'Enraptured love: dreamy half-lidded eyes and a wide soft smile; lean toward the viewer with arms opened for an embrace.',
        'Overwhelming affection: shining eyes squeezed nearly shut and lips in a delighted smile; clasp both hands against one cheek and curl the shoulders inward.',
    ],
    nervousness: [
        'Jittery nervousness: wide darting eyes, high worried brows and a strained toothy smile; hunch the shoulders and wring both hands tightly at the chest.',
        'Anxious nervousness: uneven raised brows, a sideways glance and a trembling bitten lip; rub the back of the neck with one hand and tuck the other arm close.',
        'Overwrought nervousness: tense staring eyes and lips pressed into a wavering grimace; lean backward with shoulders raised and fingers splayed stiffly near the collar.',
    ],
    optimism: [
        'Boundless optimism: bright wide eyes, high brows and a broad confident smile; lift the chin with chest open and both fists held eagerly near the shoulders.',
        'Hopeful optimism: shining upward gaze and a radiant open smile; clasp both hands over the heart and lean toward the imagined future.',
        'Encouraging optimism: strongly arched brows and a huge reassuring grin; reach one hand invitingly forward while giving a prominent thumbs-up with the other.',
    ],
    pride: [
        'Boastful pride: broad smug grin and narrowed confident eyes; thrust the chest forward with chin held high and both hands planted on the hips.',
        'Victorious pride: gleaming wide eyes and a huge toothy smile; raise one clenched fist beside the head and square the shoulders triumphantly.',
        'Regal pride: one eyebrow high and lips curved in a pronounced satisfied smirk; fold the arms across the chest and lean back with head tilted upward.',
    ],
    realization: [
        'Sudden realization: eyes springing wide, eyebrows high and mouth forming a large O; straighten abruptly with one index finger raised beside the face.',
        'Shocking realization: huge staring eyes and jaw dropped open; lean backward with one hand covering the mouth and the other spread against the chest.',
        'Eureka realization: sparkling eyes, eyebrows arched high and a huge delighted grin; lean forward with one finger pointed upward and the other hand gripping the chin.',
    ],
    relief: [
        'Overwhelming relief: eyes squeezed shut, brows relaxing upward and mouth open in a huge exhale; let the shoulders drop with one hand spread over the heart.',
        'Giddy relief: watery bright eyes and a broad trembling smile; lean back with both hands resting behind the head and chest opened in release.',
        'Exhausted relief: heavy half-closed eyes and a wide soft smile; sag forward with one hand wiping the forehead and the other hanging loosely.',
    ],
    remorse: [
        'Painful remorse: deeply raised inner brows, downcast tearful eyes and trembling downturned lips; bow the head with both hands clasped tightly against the chest.',
        'Desperate remorse: wet wide eyes and mouth open in an anguished plea; lean far forward with both open hands extended imploringly.',
        'Ashamed remorse: eyes squeezed shut, brows knotted upward and mouth drawn into a deep grimace; turn inward with one hand covering the eyes and shoulders collapsed.',
    ],
    sadness: [
        'Heavy sadness: drooping tearful eyes, steeply raised inner brows and a deep frown; slump the shoulders with head bowed and arms hanging loosely.',
        'Lonely sadness: watery eyes looking sideways and a pronounced trembling pout; hug both arms tightly around the torso and curl inward.',
        'Wistful sadness: sorrowful upward eyes, pinched inner brows and downturned parted lips; rest one cheek in the palm with the head tilted heavily and chest slumped.',
    ],
    surprise: [
        'Astonished surprise: enormous round eyes, eyebrows lifted to their limit and jaw dropped wide; jerk backward with both palms spread beside the face.',
        'Startled surprise: bulging eyes and mouth forming a sharp O; pull the shoulders high with one hand clutching the chest and the other flung outward.',
        'Incredulous surprise: one eyebrow sky-high, wide searching eyes and an open crooked mouth; lean forward with both palms raised in an exaggerated questioning pose.',
    ],
    neutral: [
        'Clearly composed neutrality: calm direct eyes, smooth brows and a relaxed closed mouth; stand upright with level shoulders and arms resting loosely at the sides.',
        'Casual neutrality: relaxed half-lidded eyes and an unforced straight mouth; shift the torso slightly sideways with one hand resting loosely on the hip.',
        'Attentive neutrality: steady open eyes, relaxed brows and closed lips; hold the head level with hands loosely joined in front and shoulders open.',
    ],
}).map(([label, prompts]) => [label, Object.freeze(prompts)])));
