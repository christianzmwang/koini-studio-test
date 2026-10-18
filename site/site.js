fetch('/auth/session', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => {
  if (!data?.user) return;
  for (const link of document.querySelectorAll('[data-account-link]')) {
    link.href = '/auth/account';
    link.textContent = 'Your account';
  }
}).catch(() => {});

const sectionTabs = [...document.querySelectorAll('[data-section-tabs] a[href^="#"]')]
  .map(tab => ({ tab, section: document.getElementById(tab.hash.slice(1)) }))
  .filter(({ section }) => section);
if (sectionTabs.length) {
  const header = document.querySelector('[data-site-header]');
  let frame = 0;
  const markCurrent = () => {
    frame = 0;
    const line = (header?.offsetHeight ?? 0) + window.innerHeight * 0.25;
    let current = null;
    for (const entry of sectionTabs) if (entry.section.getBoundingClientRect().top <= line) current = entry;
    if (current && current.section.getBoundingClientRect().bottom <= (header?.offsetHeight ?? 0)) current = null;
    for (const { tab } of sectionTabs) {
      if (tab === current?.tab) tab.setAttribute('aria-current', 'true');
      else tab.removeAttribute('aria-current');
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(markCurrent); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', schedule);
  markCurrent();
}

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
  const status = document.createElement('p');
  status.className = 'absolute inset-x-4 top-3 z-10 rounded-md bg-[#f6f6f0]/95 px-3 py-2 text-center text-xs text-[#354d3b]';
  status.setAttribute('role', 'status'); status.hidden = true; host.append(status);
  let state = 'idle';
  const fail = error => {
    state = 'idle'; start.hidden = false; start.disabled = false; start.textContent = 'Try 3D again ↻';
    host.querySelector('[data-poster]')?.classList.remove('hidden');
    status.textContent = 'The 3D view couldn’t load. You can try again; the preview is still available.';
    status.hidden = false; console.error('Koini 3D viewer:', error);
  };
  host.addEventListener('viewer-error', event => fail(event.detail));
  start.addEventListener('click', async () => {
    if (state !== 'idle') return;
    state = 'loading'; start.disabled = true; status.hidden = false; status.textContent = 'Loading the 3D model…';
    try {
      const { mountViewer } = await import('./viewer.js');
      const dispose = await mountViewer(host);
      state = 'ready'; status.hidden = true; start.hidden = true;
      window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); }, { once: true });
      host.querySelector('canvas')?.focus({ preventScroll: true });
    } catch (error) { fail(error); }
  });
}
