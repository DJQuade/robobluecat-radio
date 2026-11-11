import { config } from './config.js?v=5';
import { initChat } from './chat.js';
import { initRadio } from './radio.js?v=4';

const byId = (id) => document.getElementById(id);
const walk = byId('walk');
const footage = byId('footage');
const retry = byId('walk-retry');
const motion = byId('motion');
const status = byId('walk-status');
const intensity = byId('intensity');
const sliderValue = byId('intensity-value');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let walkSource = appleMobile ? config.walkMobileUrl : config.walkUrl;
let paused = reducedMotion.matches;
let autoplayBlocked = false;
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
    if (error.name !== 'NotAllowedError' || paused) return;
    clearTimeout(stalledTimer);
    autoplayBlocked = true;
    paused = true;
    updateMotion();
    status.textContent = 'Tap to play';
    retry.textContent = 'Play walk';
    retry.hidden = false;
  });
}

function loadWalk() {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  clearTimeout(stalledTimer);
  autoplayBlocked = false;
  retry.hidden = true;
  status.textContent = 'Loading the walk';
  footage.muted = true;
  footage.src = walkSource;
  footage.load();
  tryPlay();
}

function recover() {
  if (retryTimer !== undefined) return;
  clearTimeout(stalledTimer);
  autoplayBlocked = false;
  resumeAt = footage.currentTime || resumeAt;
  if (failures >= 3) {
    status.textContent = 'Walk unavailable';
    retry.textContent = 'Retry walk';
    retry.hidden = false;
    return;
  }
  walkSource = config.walkMobileUrl;
  status.textContent = 'Reconnecting the walk';
  retryTimer = setTimeout(loadWalk, 1500 * (2 ** failures));
  failures += 1;
}

footage.addEventListener('loadedmetadata', () => {
  if (resumeAt > 0 && resumeAt < footage.duration - 1) footage.currentTime = resumeAt;
  resumeAt = 0;
  if (paused && !autoplayBlocked) status.textContent = 'Walk paused';
});
footage.addEventListener('playing', () => {
  clearTimeout(stalledTimer);
  clearTimeout(retryTimer);
  retryTimer = undefined;
  failures = 0;
  autoplayBlocked = false;
  retry.hidden = true;
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
function playWalk() {
  const needsReload = !autoplayBlocked && (!retry.hidden || footage.error);
  failures = 0;
  paused = false;
  autoplayBlocked = false;
  retry.hidden = true;
  updateMotion();
  if (needsReload) loadWalk();
  else tryPlay();
}

retry.addEventListener('click', playWalk);
motion.addEventListener('click', () => {
  if (paused) {
    playWalk();
    return;
  }
  paused = true;
  updateMotion();
  clearTimeout(stalledTimer);
  footage.pause();
  status.textContent = 'Walk paused';
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
