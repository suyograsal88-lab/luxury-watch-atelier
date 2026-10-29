(() => {
  const frameCount = 145;
  const canvas = document.getElementById('watch-scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  const section = document.querySelector('.sequence');
  const progressBar = document.getElementById('progress-bar');
  const current = document.getElementById('frame-current');
  const caption = document.getElementById('scene-caption');
  const phases = [
    { frame: 0, label: '01 — THE FACE' },
    { frame: 25, label: '02 — THE PROFILE' },
    { frame: 43, label: '03 — THE CASEBACK' },
    { frame: 57, label: '04 — THE MOVEMENT' },
    { frame: 121, label: '05 — THE FINISH' }
  ];
  const images = new Array(frameCount);
  let targetFrame = 0, drawnFrame = -1, raf = 0, progress = 0;

  function loadFrame(i) {
    if (images[i]) return images[i];
    const img = new Image();
    img.src = `frames/frame_${String(i + 1).padStart(4, '0')}.webp`;
    img.onload = () => { if (Math.abs(targetFrame - i) < 3) draw(i); };
    images[i] = img;
    return img;
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawnFrame = -1;
    draw(Math.round(targetFrame));
  }
  function draw(i) {
    const img = loadFrame(i);
    if (!img.complete || !img.naturalWidth) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.fillStyle = '#0a0b0e'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    drawnFrame = i;
  }
  function tick() {
    raf = 0;
    const next = Math.round(targetFrame);
    const img = loadFrame(next);
    if (img.complete && img.naturalWidth && drawnFrame !== next) draw(next);
    if (Math.abs(next - drawnFrame) > 1) loadFrame(Math.max(0, Math.min(frameCount - 1, next + Math.sign(next - drawnFrame))));
  }
  function update() {
    const rect = section.getBoundingClientRect();
    const max = section.offsetHeight - window.innerHeight;
    progress = Math.max(0, Math.min(1, -rect.top / max));
    targetFrame = progress * (frameCount - 1);
    progressBar.style.width = `${progress * 100}%`;
    const phase = [...phases].reverse().find(p => targetFrame >= p.frame) || phases[0];
    caption.textContent = phase.label;
    current.textContent = String(phases.indexOf(phase) + 1).padStart(2, '0');
    if (!raf) raf = requestAnimationFrame(tick);
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', () => { resize(); update(); }, { passive: true });
  // Preload the compact frame set so quick scrolls can scrub without waiting on downloads.
  for (let i = 0; i < frameCount; i++) loadFrame(i);
  resize(); update();
})();

document.querySelectorAll('form[data-preview-form]').forEach(form => {
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const status = form.querySelector('.form-status');
    if (status) status.textContent = 'Preview only — your details have not been sent or stored.';
    form.reset();
  });
});
