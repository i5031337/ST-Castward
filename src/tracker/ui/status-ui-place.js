/** Adds the chat's confirmed place beside the world stats. */
export function appendPlaceTrail(box, path, headerButtons) {
    if (!path.length) return;
    let header = box.querySelector('.sillynpc-status-header');
    if (!header) {
        header = document.createElement('div');
        header.className = 'sillynpc-status-header';
        headerButtons.after(header);
    }

    const badge = document.createElement('span');
    badge.className = 'sillynpc-status-place';
    if (header.textContent.trim()) badge.classList.add('sillynpc-status-place-after-stats');
    badge.title = path.join(' › ');

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-location-dot';
    icon.setAttribute('aria-hidden', 'true');
    badge.append(icon);

    const trail = document.createElement('span');
    trail.className = 'sillynpc-status-place-trail';
    path.forEach((name, index) => {
        if (index) {
            const separator = document.createElement('span');
            separator.className = 'sillynpc-status-place-separator';
            separator.textContent = '›';
            trail.append(separator);
        }
        const crumb = document.createElement(index === path.length - 1 ? 'strong' : 'span');
        crumb.className = index === path.length - 1 ? 'sillynpc-status-place-current' : 'sillynpc-status-place-parent';
        crumb.textContent = name;
        trail.append(crumb);
    });
    badge.append(trail);
    header.append(badge);
}
