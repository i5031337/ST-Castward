import { eventSource } from '../../../../../../events.js';
import { makeActivatable } from '../../core/utils.js';

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
    badge.title = path.map(place => place.name).join(' › ');

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-location-dot';
    icon.setAttribute('aria-hidden', 'true');
    badge.append(icon);

    const trail = document.createElement('span');
    trail.className = 'sillynpc-status-place-trail';
    path.forEach(({ id, name }, index) => {
        if (index) {
            const separator = document.createElement('span');
            separator.className = 'sillynpc-status-place-separator';
            separator.textContent = '›';
            trail.append(separator);
        }
        const crumb = document.createElement(index === path.length - 1 ? 'strong' : 'span');
        crumb.className = index === path.length - 1 ? 'sillynpc-status-place-current' : 'sillynpc-status-place-parent';
        crumb.textContent = name;
        crumb.title = `Edit ${name}`;
        makeActivatable(crumb, { label: `Edit place: ${name}` });
        crumb.addEventListener('click', event => {
            event.stopPropagation();
            eventSource.emit('sillynpc-open-manage', { tab: 'places', locationId: id });
        });
        trail.append(crumb);
    });
    badge.append(trail);
    header.append(badge);
}
