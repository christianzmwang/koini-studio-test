const copy = document.querySelector('#copy-link');
const link = document.querySelector('#room-link');
const status = document.querySelector('#copy-status');
copy?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(link.value);
    status.textContent = 'Link copied. Open Safari and paste it into the address bar.';
  } catch {
    link.focus();
    link.select();
    status.textContent = 'Select and copy the link above, then paste it in Safari.';
  }
});
