const roomImage = document.querySelector('#room-image');
const finishes = document.querySelectorAll('[data-floor]');
const finishNames = { oak: 'oak', lightOak: 'light oak', herringbone: 'herringbone' };
for (const button of finishes) {
  button.addEventListener('click', () => {
    const finish = button.dataset.floor;
    if (!(finish in finishNames)) return;
    roomImage.src = `/assets/room-${finish}.webp`;
    roomImage.alt = `A room rendered in Koini, with a sofa, armchair, coffee table, plant and ${finishNames[finish]} floor`;
    for (const option of finishes) {
      const selected = option === button;
      option.setAttribute('aria-pressed', String(selected));
      option.classList.toggle('selected', selected);
    }
  });
}
for (const button of document.querySelectorAll('[data-angle]')) {
  button.addEventListener('click', () => {
    const image = button.closest('.gallery-card').querySelector('img');
    const side = button.getAttribute('aria-pressed') !== 'true';
    image.src = side ? button.dataset.side : button.dataset.front;
    image.alt = `${button.dataset.name}, a Lab3D furniture model rendered from the ${side ? 'opposite' : 'front'} angle`;
    button.setAttribute('aria-pressed', String(side));
  });
}
