import { config } from './config.js';
import { initChat } from './chat.js';
import { initRadio } from './radio.js?v=2';

const byId = (id) => document.getElementById(id);
const walk = byId('walk');
const footage = byId('footage');
const retry = byId('walk-retry');
const motion = byId('motion');
const status = byId('walk-status');
const intensity = byId('intensity');
const sliderValue = byId('intensity-value');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches;
let failures = 0;
let retryTimer;
let stalledTimer;
let resumeAt = 0;

function setIntensity(value) {
  const level = Math.min(100, Math.max(0, Number(value)));
  intensity.value = level;
  sliderValue.value = level + '%';
  walk.style.setProperty('--effects', level / 100);
  try { localStorage.setItem('rbc-intensity', level); } catch { /* storage is optional */ }
}

try { setIntensity(localStorage.getItem('rbc-intensity') ?? 78); } catch { setIntensity(78); }
intensity.addEventListener('input', () => setIntensity(intensity.value));
byId('reset').addEventListener('click', () => setIntensity(78));

function updateMotion() {
  walk.classList.toggle('is-paused', paused);
  motion.setAttribute('aria-pressed', String(paused));
  motion.textContent = paused ? 'Play walk' : 'Pause walk';
}

function tryPlay() {
  if (paused) return;
  footage.play().catch((error) => {
    if (error.name !== 'NotAllowedError') return;
    paused = true;
    updateMotion();
    status.textContent = 'Tap to play';
  });
}

function loadWalk() {
  clearTimeout(retryTimer);
  clearTimeout(stalledTimer);
  retry.hidden = true;
  status.textContent = 'Loading the walk';
  footage.muted = true;
  footage.src = config.walkUrl;
  footage.load();
  tryPlay();
}

function recover() {
  clearTimeout(stalledTimer);
  clearTimeout(retryTimer);
  resumeAt = footage.currentTime || resumeAt;
  if (failures >= 3) {
    status.textContent = 'Walk unavailable';
    retry.hidden = false;
    return;
  }
  status.textContent = 'Reconnecting the walk';
  retryTimer = setTimeout(loadWalk, 1500 * (2 ** failures));
  failures += 1;
}

footage.addEventListener('loadedmetadata', () => {
  if (resumeAt > 0 && resumeAt < footage.duration - 1) footage.currentTime = resumeAt;
  resumeAt = 0;
  if (paused) status.textContent = 'Walk paused';
});
footage.addEventListener('playing', () => {
  clearTimeout(stalledTimer);
  failures = 0;
  status.textContent = 'Japan walk';
});
footage.addEventListener('waiting', () => {
  if (paused || document.hidden) return;
  clearTimeout(stalledTimer);
  stalledTimer = setTimeout(recover, 12000);
});
footage.addEventListener('error', recover);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(stalledTimer);
  else tryPlay();
});
retry.addEventListener('click', () => {
  failures = 0;
  paused = false;
  updateMotion();
  loadWalk();
});
motion.addEventListener('click', () => {
  paused = !paused;
  updateMotion();
  if (paused) {
    clearTimeout(stalledTimer);
    footage.pause();
    status.textContent = 'Walk paused';
  } else if (!retry.hidden || footage.error) {
    failures = 0;
    loadWalk();
  } else tryPlay();
});
updateMotion();
loadWalk();

const cinema = byId('cinema');
const cinemaExit = byId('cinema-exit');
const radio = initRadio(config.playlist);
const outsideCinema = [document.querySelector('.masthead'), byId('walk-toolbar'),
  byId('radio'), byId('chat'), document.querySelector('footer')];

function setCinema(enabled) {
  walk.classList.toggle('is-cinema', enabled);
  radio.setCinemaMode(enabled);
  cinema.setAttribute('aria-pressed', String(enabled));
  outsideCinema.forEach((element) => { element.inert = enabled; });
  document.body.style.overflow = enabled ? 'hidden' : '';
  (enabled ? cinemaExit : cinema).focus({ preventScroll: true });
  if (!enabled && document.fullscreenElement === walk) document.exitFullscreen?.().catch(() => {});
}

cinema.addEventListener('click', () => {
  setCinema(true);
  walk.requestFullscreen?.().catch(() => {});
});
cinemaExit.addEventListener('click', () => setCinema(false));
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && walk.classList.contains('is-cinema')) setCinema(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && walk.classList.contains('is-cinema')) setCinema(false);
});

initChat(config);
