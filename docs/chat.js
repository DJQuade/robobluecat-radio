const noteText = 'Messages are public. Be kind and keep personal info private.';
const topic = 'realtime:radio-room';
const table = 'radio_messages';

export function initChat({ chatUrl, chatKey }) {
  const id = (name) => document.getElementById(name);
  const status = id('chat-status');
  const form = id('chat-form');
  const nickname = id('nickname');
  const message = id('message');
  const send = id('send');
  const note = id('chat-note');
  const list = id('messages');
  const history = list.parentElement;
  const empty = id('chat-empty');
  const headers = { apikey: chatKey };
  const seen = new Set();
  let guest = crypto.randomUUID();
  let socket;
  let subscribed = false;
  let available = false;
  let sending = false;
  let refreshing = false;
  let heartbeat;
  let reconnect;
  let joinTimeout;
  let beatAt = 0;
  let reference = 1;
  let retryDelay = 1500;

  nickname.value = 'Wanderer-' + guest.slice(0, 4);
  try {
    guest = localStorage.getItem('rbc-guest') || guest;
    localStorage.setItem('rbc-guest', guest);
    nickname.value = localStorage.getItem('rbc-nickname') || 'Wanderer-' + guest.slice(0, 4);
  } catch { /* storage is optional */ }

  function paintStatus() {
    status.textContent = subscribed ? 'Live' : available ? 'Connected' : 'Reconnecting';
    status.dataset.live = String(subscribed || available);
    send.disabled = !available || sending;
  }

  function addMessages(messages) {
    const atBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 45;
    for (const row of messages) {
      if (!row || !Number.isSafeInteger(Number(row.id)) || seen.has(String(row.id))) continue;
      const key = String(row.id);
      const item = document.createElement('li');
      const name = document.createElement('b');
      item.dataset.id = key;
      name.textContent = row.nickname;
      item.append(name, document.createTextNode(row.body));
      const next = Array.from(list.children).find((child) => Number(child.dataset.id) > Number(key));
      list.insertBefore(item, next ?? null);
      seen.add(key);
    }
    while (list.childElementCount > 60) {
      seen.delete(list.firstElementChild.dataset.id);
      list.firstElementChild.remove();
    }
    empty.hidden = list.childElementCount > 0;
    if (atBottom) history.scrollTop = history.scrollHeight;
  }

  async function refresh() {
    if (refreshing || document.hidden) return;
    refreshing = true;
    try {
      const response = await fetch(chatUrl + '/rest/v1/' + table + '?select=id,nickname,body&order=id.desc&limit=60', {
        headers, cache: 'no-store', signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('History unavailable');
      addMessages((await response.json()).reverse());
      available = true;
    } catch {
      available = subscribed;
    } finally {
      refreshing = false;
      paintStatus();
    }
  }

  function connect() {
    if (document.hidden || !navigator.onLine || socket) return;
    const url = new URL('/realtime/v1/websocket', chatUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:'));
    url.search = new URLSearchParams({ apikey: chatKey, vsn: '1.0.0' });
    const current = new WebSocket(url);
    socket = current;
    const push = (target, event, payload, ref) => {
      current.send(JSON.stringify({ topic: target, event, payload, ref, join_ref: target === topic ? '1' : null }));
    };
    joinTimeout = setTimeout(() => current.close(), 9000);
    current.addEventListener('open', () => {
      push(topic, 'phx_join', { config: {
        broadcast: { ack: false, self: false },
        presence: { enabled: false },
        postgres_changes: [{ event: '*', schema: 'public', table }],
        private: false,
      } }, '1');
      heartbeat = setInterval(() => {
        if (beatAt) {
          current.close();
          return;
        }
        beatAt = ++reference;
        push('phoenix', 'heartbeat', {}, String(beatAt));
      }, 20000);
    });
    current.addEventListener('message', (event) => {
      let incoming;
      try { incoming = JSON.parse(event.data); } catch { return; }
      if (incoming.event === 'phx_reply' && incoming.topic === 'phoenix') beatAt = 0;
      if (incoming.event === 'phx_reply' && incoming.ref === '1' && incoming.topic === topic) {
        if (incoming.payload.status !== 'ok') {
          current.close();
          return;
        }
        clearTimeout(joinTimeout);
        subscribed = available = true;
        retryDelay = 1500;
        paintStatus();
        refresh();
      }
      if (incoming.event === 'postgres_changes' && incoming.topic === topic) {
        addMessages([incoming.payload.data?.record]);
      }
      if (incoming.event === 'phx_error' || incoming.event === 'phx_close') current.close();
    });
    current.addEventListener('close', () => {
      clearTimeout(joinTimeout);
      clearInterval(heartbeat);
      socket = undefined;
      beatAt = 0;
      subscribed = false;
      paintStatus();
      refresh();
      clearTimeout(reconnect);
      reconnect = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000);
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending || !available) return;
    const p_nickname = nickname.value.trim();
    const p_body = message.value.trim();
    if (p_nickname.length < 2 || !p_body) {
      note.textContent = 'Enter a nickname and a message.';
      return;
    }
    sending = true;
    paintStatus();
    try {
      const response = await fetch(chatUrl + '/rest/v1/rpc/post_radio_message', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_nickname, p_body, p_guest: guest }),
        signal: AbortSignal.timeout(8000),
      });
      const result = await response.json();
      if (!response.ok) {
        note.textContent = response.status === 429
          ? 'Give it a few seconds before sending again.'
          : 'Message could not be sent. Please try again.';
        return;
      }
      addMessages(Array.isArray(result) ? result : [result]);
      try { localStorage.setItem('rbc-nickname', p_nickname); } catch { /* storage is optional */ }
      if (message.value.trim() === p_body) message.value = '';
      note.textContent = noteText;
      message.focus();
    } catch {
      note.textContent = 'Message could not be sent. Check your connection and try again.';
    } finally {
      sending = false;
      paintStatus();
    }
  });

  function resume() { refresh(); connect(); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) socket?.close();
    else resume();
  });
  window.addEventListener('online', resume);
  setInterval(() => { if (!subscribed) refresh(); }, 4000);
  resume();
}
