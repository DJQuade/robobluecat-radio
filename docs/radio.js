const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;
const CUED = 5;

export function initRadio(playlist) {
  const container = document.getElementById('player');
  const status = document.getElementById('radio-status');
  const action = document.getElementById('radio-action');
  const playlistLink = document.getElementById('playlist-link');
  const iframe = document.createElement('iframe');
  const url = new URL('https://www.youtube-nocookie.com/embed');
  url.search = new URLSearchParams({
    listType: 'playlist', list: playlist, controls: '1', playsinline: '1',
    autoplay: '0', enablejsapi: '1', origin: location.origin,
  });
  iframe.title = 'DJ Quade archived sets on YouTube';
  iframe.src = url;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  container.append(iframe);
  playlistLink.href = 'https://www.youtube.com/playlist?list=' + playlist;

  let player;
  let visible = false;
  let cinema = false;
  let resumeAfterCinema = false;
  let firstPlay = false;
  let initialIndex;
  let attempt = 'waiting';
  let startupTimer;
  let tuningTimer;
  const tried = new Set();

  function update(text, button = '') {
    status.textContent = text;
    action.hidden = !button;
    if (button) action.textContent = button;
  }

  function watchStartup() {
    clearTimeout(startupTimer);
    startupTimer = setTimeout(() => {
      update('YouTube is taking a while. Try Play or open YouTube.', 'Play');
    }, 12000);
  }

  function pickSet() {
    const videos = player.getPlaylist?.();
    if (!videos?.length) return false;
    const choices = videos.map((_, index) => index).filter((index) => !tried.has(index));
    if (!choices.length) return false;
    initialIndex = choices[Math.floor(Math.random() * choices.length)];
    tried.add(initialIndex);
    return true;
  }

  function tryAutoplay() {
    if (!player || !visible || document.hidden || cinema || firstPlay) return;
    if (attempt === 'waiting') {
      if (!pickSet()) return;
      attempt = 'sound';
    } else if (attempt === 'retry-muted') {
      player.mute();
      attempt = 'muted';
    } else {
      return;
    }
    clearInterval(tuningTimer);
    watchStartup();
    player.playVideoAt(initialIndex);
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= .51;
    tryAutoplay();
  }, { threshold: [.51] });
  observer.observe(iframe);
  document.addEventListener('visibilitychange', tryAutoplay);

  function onReady({ target }) {
    clearTimeout(startupTimer);
    player = target;
    player.setLoop(true);
    if (!player.getPlaylist?.()?.length) player.cuePlaylist({ listType: 'playlist', list: playlist });
    tryAutoplay();
    if (attempt !== 'waiting') return;

    // The iframe can be ready a moment before the playlist data is available.
    const waitUntil = Date.now() + 12000;
    tuningTimer = setInterval(() => {
      tryAutoplay();
      if (player.getPlaylist?.()?.length || Date.now() >= waitUntil) clearInterval(tuningTimer);
      if (Date.now() >= waitUntil && attempt === 'waiting') {
        update('Press play to listen or open the playlist on YouTube.', 'Play');
      }
    }, 300);
  }

  function onStateChange({ data, target }) {
    if (data === CUED) {
      tryAutoplay();
    } else if (data === PLAYING) {
      clearTimeout(startupTimer);
      clearInterval(tuningTimer);
      firstPlay = true;
      attempt = 'done';
      observer.disconnect();
      if (cinema) {
        resumeAfterCinema = true;
        target.pauseVideo();
      }
      const muted = target.isMuted();
      update(muted ? 'Playing muted' : 'Playing', muted ? 'Enable sound' : '');
    } else if (data === BUFFERING) {
      update('Buffering…');
    } else if (data === PAUSED && firstPlay) {
      update('Paused');
    }
  }

  function onAutoplayBlocked() {
    clearTimeout(startupTimer);
    if (attempt === 'sound') {
      attempt = 'retry-muted';
      tryAutoplay();
      return;
    }
    attempt = 'done';
    update('Your browser paused automatic playback.', 'Play');
  }

  function onError({ data }) {
    clearTimeout(startupTimer);
    // Skip unavailable playlist entries during the initial automatic selection.
    if (!firstPlay && visible && !document.hidden && !cinema && [100, 101, 150].includes(data)
        && initialIndex !== undefined && pickSet()) {
      watchStartup();
      player.playVideoAt(initialIndex);
      return;
    }
    update('This set is unavailable here. Open the playlist on YouTube.');
  }

  action.addEventListener('click', () => {
    if (!player) return;
    attempt = 'done';
    player.unMute();
    if (player.getPlayerState() === PLAYING) {
      update('Playing');
      return;
    }
    watchStartup();
    if (!firstPlay && initialIndex !== undefined && player.getPlaylistIndex() !== initialIndex) {
      player.playVideoAt(initialIndex);
    } else {
      player.playVideo();
    }
  });

  function attachPlayer() {
    new window.YT.Player(iframe, {
      events: { onReady, onStateChange, onAutoplayBlocked, onError },
    });
  }

  if (window.YT?.Player) {
    attachPlayer();
  } else {
    window.onYouTubeIframeAPIReady = attachPlayer;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.addEventListener('error', () => {
      clearTimeout(startupTimer);
      update('Press play in the YouTube player or open the playlist on YouTube.');
    }, { once: true });
    document.head.append(script);
  }

  startupTimer = setTimeout(() => {
    if (!player) update('Press play in the YouTube player or open the playlist on YouTube.');
  }, 12000);

  return {
    setCinemaMode(enabled) {
      cinema = enabled;
      if (!player) return;
      if (enabled) {
        resumeAfterCinema = [PLAYING, BUFFERING].includes(player.getPlayerState());
        if (resumeAfterCinema) player.pauseVideo();
      } else if (resumeAfterCinema) {
        resumeAfterCinema = false;
        player.playVideo();
      } else {
        tryAutoplay();
      }
    },
  };
}
