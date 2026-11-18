/** Exercise real CSS without saving settings or modifying the loaded chat. */
export async function checkDialogueColors(base, settings) {
    const { decorateStreamingDialogue } = await import(base + 'src/chat/chat-portraits.js');
    const { chatRenderSignature } = await import(base + 'src/chat/chat-signature.js');
    const keys = ['enabled', 'applyColors', 'colorDialogueText', 'colorStyle', 'autoColorUnknownSpeakers'];
    const saved = Object.fromEntries(keys.map(key => [key, settings[key]]));
    const mes = document.createElement('div');
    mes.innerHTML = '<div class="mes_text"><p>Maren: <font color="#f1b200">'
        + '<span style="color:rgb(241, 178, 0)">"Well now..."</span></font></p></div>';
    document.body.append(mes);
    const result = {};
    try {
        Object.assign(settings, { enabled: true, applyColors: true, colorDialogueText: false,
            autoColorUnknownSpeakers: true });
        const span = mes.querySelector('span');
        const font = mes.querySelector('font');
        for (const style of ['text', 'background', 'border', 'gradient', 'all']) {
            settings.colorStyle = style;
            decorateStreamingDialogue(mes);
            const block = mes.querySelector('p');
            const css = getComputedStyle(block);
            result['presetColor_' + style] = getComputedStyle(span).color === 'rgb(241, 178, 0)'
                && !font.classList.contains('sillynpc-ignore-model-color')
                && block.classList.contains('color-' + style)
                && mes.querySelectorAll('.sillynpc-chat-avatar').length === 1
                && Boolean(mes.querySelector('.sillynpc-speech-text'));
            if (style === 'background' || style === 'all')
                result['background_' + style] = css.backgroundColor !== 'rgba(0, 0, 0, 0)';
            if (['border', 'gradient', 'all'].includes(style))
                result['border_' + style] = css.borderLeftWidth === '4px';
            if (style === 'gradient') result.gradientVisible = css.backgroundImage.includes('linear-gradient');
        }
        const withoutTextColor = chatRenderSignature();
        settings.colorDialogueText = true;
        result.colorSettingInvalidatesRender = chatRenderSignature() !== withoutTextColor;
        decorateStreamingDialogue(mes);
        result.castwardTextColor = mes.querySelector('p').classList.contains('sillynpc-tint-text')
            && font.classList.contains('sillynpc-ignore-model-color')
            && getComputedStyle(span).color === getComputedStyle(mes.querySelector('p')).color;
        settings.colorDialogueText = false;
        decorateStreamingDialogue(mes);
        result.restoresPresetColor = getComputedStyle(span).color === 'rgb(241, 178, 0)'
            && !font.classList.contains('sillynpc-ignore-model-color');
        settings.applyColors = false;
        decorateStreamingDialogue(mes);
        result.masterColorOff = !mes.querySelector('p').className.includes('color-')
            && mes.querySelectorAll('.sillynpc-chat-avatar').length === 1
            && getComputedStyle(span).color === 'rgb(241, 178, 0)';
        return result;
    } finally {
        Object.assign(settings, saved);
        mes.remove();
    }
}
