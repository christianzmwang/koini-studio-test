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
  let cleanup = null;
  let loading = false;
  const showError = message => {
    cleanup = null;
    host.querySelector('[data-poster]')?.classList.remove('hidden');
    start.hidden = false; start.disabled = false;
    status.textContent = message; status.hidden = false;
  };
  host.addEventListener('viewer-error', event => showError(event.detail?.message || 'The 3D view could not load. Please try again.'));
  start.addEventListener('click', async () => {
    if (loading || cleanup) return;
    loading = true; start.disabled = true; start.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading 3D view…'; status.hidden = false;
    try {
      const { mountViewer } = await import('./viewer.js');
      cleanup = await mountViewer(host);
      start.hidden = true; status.hidden = true; status.textContent = '';
    } catch (error) {
      console.warn('3D viewer unavailable', error);
      showError('The 3D view could not load. Please try again.');
    } finally {
      loading = false; start.removeAttribute('aria-busy');
    }
  });
}
