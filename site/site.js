fetch('/auth/session', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => {
  if (!data?.user) return;
  for (const link of document.querySelectorAll('[data-account-link]')) {
    link.href = '/auth/account';
    link.textContent = 'Your account';
  }
}).catch(() => {});

const finishNames = { oak: 'oak', lightOak: 'light oak', herringbone: 'herringbone' };
for (const card of document.querySelectorAll('[data-room-card]')) {
  const buttons = card.querySelectorAll('[data-floor]');
  for (const button of buttons) button.addEventListener('click', () => {
    const finish = button.dataset.floor;
    if (!(finish in finishNames)) return;
    const poster = card.querySelector('[data-poster]');
    if (poster) {
      poster.src = `/assets/room-${finish}.webp`;
      poster.alt = `Meeting demo: Lukas sofa, Moss chair and LACK table with a ${finishNames[finish]} floor`;
    }
    for (const option of buttons) option.setAttribute('aria-pressed', String(option === button));
  });
}

for (const host of document.querySelectorAll('[data-viewer]')) {
  const start = host.querySelector('[data-start]');
  if (!start) continue;
  const status = document.createElement('p');
  status.className = 'absolute inset-x-4 top-3 z-10 rounded-md bg-[#f6f6f0]/95 px-3 py-2 text-center text-xs text-[#354d3b]';
  status.setAttribute('role', 'status'); status.hidden = true; host.append(status);
  const show = message => { status.textContent = message; status.hidden = !message; };
  host.addEventListener('viewer-error', event => {
    show(event.detail?.message || 'The 3D view could not be shown. Please try again.');
    start.hidden = false; start.disabled = false;
  });
  start.addEventListener('click', async () => {
    if (start.disabled) return;
    start.disabled = true;
    host.setAttribute('aria-busy', 'true');
    show(`Loading ${host.dataset.name || 'model'} in 3D…`);
    try {
      const { mountViewer } = await import('./viewer.js');
      await mountViewer(host);
      start.hidden = true;
      show('');
    } catch (error) {
      console.warn('3D viewer failed to load', error);
      show('The 3D view could not be loaded on this device. Please try again.');
      start.disabled = false;
    } finally {
      host.removeAttribute('aria-busy');
    }
  });
}
