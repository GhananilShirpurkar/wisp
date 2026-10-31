const $ = (selector) => document.querySelector(selector);
const video = $('video'),
  start = $('#start'),
  stop = $('#stop'),
  status = $('#status');
let stream,
  startedAt = 0,
  samples = 0,
  requestGeneration = 0;
function state(value) {
  document.body.dataset.state = value;
  window.captureUI?.setState(value);
  $('#state-label').textContent = {
    idle: 'Not sharing',
    requesting: 'Choosing screen',
    sharing: 'Sharing live',
    error: 'Needs attention',
  }[value];
  $('#state-badge').classList.toggle('active', value === 'sharing');
}
function updateTime() {
  if (!startedAt) return;
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  $('#duration').textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
setInterval(updateTime, 1000);
function stopSharing() {
  requestGeneration++;
  const old = stream;
  stream = null;
  old?.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
  video.hidden = true;
  $('#empty-preview').hidden = false;
  $('#live-label').hidden = true;
  start.disabled = false;
  start.hidden = false;
  $('#start-label').textContent = 'Choose a screen';
  stop.disabled = true;
  stop.hidden = true;
  startedAt = 0;
  $('#duration').textContent = 'Not started';
  $('#source').textContent = 'No screen selected';
  samples = 0;
  $('#samples').textContent = '0 frames';
  $('#empty-title').textContent = 'A little space, just for you.';
  $('#empty-detail').textContent = 'Your screen stays private until you choose to share.';
  status.textContent = 'Screen sharing is off.';
  $('#error-panel').hidden = true;
  state('idle');
}
start.onclick = async () => {
  const generation = ++requestGeneration;
  start.disabled = true;
  $('#error-panel').hidden = true;
  state('requesting');
  status.textContent = 'Waiting for your selection…';
  $('#empty-title').textContent = 'Over to you.';
  $('#empty-detail').textContent = 'Choose a screen in your desktop’s sharing dialog.';
  $('#start-label').textContent = 'Opening chooser…';
  let pending;
  try {
    pending = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
    });
    if (generation !== requestGeneration) {
      pending.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = pending;
    video.srcObject = stream;
    video.hidden = false;
    await video.play();
    if (generation !== requestGeneration) {
      pending.getTracks().forEach((track) => track.stop());
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== 'live')
      throw new Error('The selected screen is no longer available.');
    track.addEventListener('ended', stopSharing, { once: true });
    startedAt = Date.now();
    samples = 0;
    updateTime();
    const settings = track.getSettings();
    $('#source').textContent =
      settings.width && settings.height
        ? `${settings.width} × ${settings.height}`
        : 'Selected screen';
    $('#empty-preview').hidden = true;
    $('#live-label').hidden = false;
    start.hidden = true;
    stop.hidden = false;
    stop.disabled = false;
    status.textContent = 'Sharing with your local companion.';
    state('sharing');
  } catch (error) {
    pending?.getTracks().forEach((track) => track.stop());
    if (generation !== requestGeneration) return;
    stopSharing();
    const cancelled = ['NotAllowedError', 'AbortError'].includes(error?.name);
    if (cancelled) {
      status.textContent = 'No screen shared. Try again whenever you’re ready.';
      return;
    }
    state('error');
    status.textContent = 'Screen sharing is unavailable.';
    $('#error-panel').hidden = false;
    $('#error-detail').textContent =
      error?.name === 'NotReadableError'
        ? 'Your desktop could not provide the selected screen. Close any stale sharing session and try again.'
        : 'Check that PipeWire and your desktop portal are running, then choose a screen again. Your screen has not been shared.';
    $('#start-label').textContent = 'Try again';
  }
};
stop.onclick = stopSharing;
window.captureFrame = () => {
  if (
    !stream ||
    stream.getVideoTracks()[0]?.readyState !== 'live' ||
    video.readyState < 2 ||
    !video.videoWidth
  )
    throw new Error('Screen sharing is off');
  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  samples++;
  $('#samples').textContent = `${samples} ${samples === 1 ? 'frame' : 'frames'}`;
  return frame;
};
window.addEventListener('beforeunload', stopSharing);
