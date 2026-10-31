const $ = (selector) => document.querySelector(selector);
const companion = $('#companion'),
  bubble = $('#bubble'),
  speech = $('#speech'),
  scene = $('#scene'),
  controls = $('#controls');
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
let preferences = { pin: false, motion: false };
try {
  const saved = JSON.parse(localStorage.getItem('paperclip.preferences') || '{}');
  preferences = { pin: saved.pin === true, motion: saved.motion === true };
} catch {}
let x = Math.max(12, innerWidth - 370),
  y = Math.max(12, innerHeight - 380),
  cursor = { x: 0, y: 0 },
  possessed = false,
  hover = false,
  effectTimer,
  open = false;
let captureState = 'idle',
  environment = { demo: false, captureSupported: true };
const quiet = () => preferences.motion || systemMotion.matches;
function save() {
  try {
    localStorage.setItem('paperclip.preferences', JSON.stringify(preferences));
  } catch {}
}
function syncPreferences() {
  for (const key of ['pin', 'motion'])
    $('#' + key).setAttribute('aria-checked', String(preferences[key]));
  document.body.classList.toggle('quiet-motion', quiet());
  if (quiet()) {
    scene.className = '';
    document.body.classList.remove('shiver');
  }
}
systemMotion.addEventListener('change', syncPreferences);
syncPreferences();
function setOpen(value) {
  open = value;
  controls.hidden = !value;
  companion.classList.toggle('open', value);
  $('#ghost').setAttribute('aria-expanded', String(value));
  $('#ghost').setAttribute(
    'aria-label',
    value ? 'Close companion controls' : 'Open companion controls',
  );
  if (value) requestAnimationFrame(() => $('#close-panel').focus({ preventScroll: true }));
  else $('#ghost').focus({ preventScroll: true });
}
function mode(value) {
  possessed = value;
  document.body.classList.toggle('possessed', value);
  $('#mode-label').textContent = value ? 'After-hours spirit' : 'Friendly spirit';
  $('#possess').setAttribute('aria-checked', String(value));
}
function message(value) {
  speech.textContent = value.text || '';
  bubble.hidden = false;
  if (value.kind === 'haunt') effect('candle');
}
function effect(name) {
  if (!['splatter', 'lightning', 'shiver', 'candle', 'ink'].includes(name)) return;
  clearTimeout(effectTimer);
  if (quiet()) {
    $('#effect-feedback').textContent = 'Effects are paused while quiet motion is on.';
    return;
  }
  scene.className = name;
  document.body.classList.toggle('shiver', name === 'shiver');
  $('#effect-feedback').textContent =
    name.charAt(0).toUpperCase() + name.slice(1) + ' · just a little mischief';
  effectTimer = setTimeout(() => {
    scene.className = '';
    document.body.classList.remove('shiver');
  }, 1800);
}
function renderCaptureState() {
  const active = captureState === 'sharing';
  $('#share').disabled = environment.demo || !environment.captureSupported;
  $('#sharing-badge').textContent = environment.demo
    ? 'Demo · no capture'
    : active
      ? 'Sharing on'
      : captureState === 'requesting'
        ? 'Choosing screen…'
        : 'Sharing off';
  $('#share-description').textContent = environment.demo
    ? 'Unavailable in demo mode'
    : !environment.captureSupported
      ? 'Screen sharing is managed externally'
      : active
        ? 'Manage your active screen share'
        : 'Choose what I can see';
}
function shareState(state) {
  captureState = state;
  renderCaptureState();
}
companion.addEventListener('mouseenter', () => {
  hover = true;
  window.paperclip?.setHover(true);
});
companion.addEventListener('mouseleave', () => {
  hover = false;
  window.paperclip?.setHover(false);
});
$('#ghost').onclick = () => setOpen(!open);
$('#close-panel').onclick = () => setOpen(false);
$('#possess').onclick = () => mode(!possessed);
for (const key of ['pin', 'motion'])
  $('#' + key).onclick = () => {
    preferences[key] = !preferences[key];
    save();
    syncPreferences();
  };
$('#dismiss').onclick = () => (bubble.hidden = true);
$('#quit').onclick = () => window.paperclip?.quit();
$('#share').onclick = () => {
  if (window.paperclip) window.paperclip.openCapture();
  else message({ text: 'Screen sharing is available in the desktop app.' });
};
document
  .querySelectorAll('[data-effect]')
  .forEach((button) => (button.onclick = () => effect(button.dataset.effect)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && open) {
    event.preventDefault();
    setOpen(false);
  }
});
window.paperclip?.onCursor((value) => (cursor = value));
window.paperclip?.onMode((value) => mode(value.possessed));
window.paperclip?.onMessage(message);
window.paperclip?.onDemo((value) => effect(value.effect));
window.paperclip?.onCaptureState(shareState);
window.paperclip?.onEnvironment((value) => {
  environment = value;
  renderCaptureState();
});
let previous = performance.now();
function animate(now) {
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  const dx = cursor.x - (x + 164),
    dy = cursor.y - (y + 170),
    distance = Math.hypot(dx, dy);
  const focusInside =
    companion.contains(document.activeElement) && document.activeElement !== document.body;
  if (
    !hover &&
    !open &&
    !preferences.pin &&
    !quiet() &&
    !focusInside &&
    distance > 5 &&
    (possessed || distance < 180)
  ) {
    const speed = possessed ? 50 : -85;
    x += (dx / distance) * speed * dt;
    y += (dy / distance) * speed * dt;
  }
  x = Math.max(12, Math.min(Math.max(12, innerWidth - companion.offsetWidth - 12), x));
  y = Math.max(12, Math.min(Math.max(12, innerHeight - companion.offsetHeight - 12), y));
  companion.style.transform = `translate(${x}px,${y}px)`;
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
setInterval(() => {
  const r = companion.getBoundingClientRect();
  window.paperclip?.setBounds({ x: r.x, y: r.y, width: r.width, height: r.height });
}, 100);
