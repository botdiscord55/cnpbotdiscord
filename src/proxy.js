const relayBase = process.env.DISCORD_RELAY || 'https://tiny-silence-47c5.killermenlol001.workers.dev';
const relayKey = process.env.DISCORD_RELAY_KEY || 'enp-cnp-7d4f1a';
const proxyUrl =
  process.env.DISCORD_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

function patchWsWebsocket(makeSubclass) {
  const ws = require('ws');
  const Sub = makeSubclass(ws);
  Sub.WebSocket = Sub;
  for (const key of ['Server', 'Receiver', 'Sender', 'createWebSocketStream']) {
    if (key in ws) Sub[key] = ws[key];
  }
  require.cache[require.resolve('ws')].exports = Sub;
}

if (relayBase) {
  // --- Modo relay (Cloudflare Worker): se reescriben las URLs de Discord ---
  const relayUrl = new URL(relayBase);

  async function relayMakeRequest(url, init = {}) {
    const u = new URL(url);
    const target = `${relayUrl.protocol}//${relayUrl.host}${u.pathname}${u.search}`;
    const headers = new Headers(init.headers || {});
    headers.set('X-Relay-Key', relayKey);
    if (u.hostname !== 'gateway.discord.gg') {
      headers.set('X-Relay-Host', u.hostname);
    }
    const resp = await fetch(target, { ...init, headers });
    return resp;
  }

  patchWsWebsocket((ws) => {
    class RelayWebSocket extends ws {
      constructor(address, protocols, options) {
        let addr = String(address);
        if (addr.startsWith('wss://gateway.discord.gg') || addr.startsWith('ws://gateway.discord.gg')) {
          addr = addr.replace(/^wss?:\/\/gateway\.discord\.gg/, `${relayUrl.protocol === 'https:' ? 'wss' : 'ws'}://${relayUrl.host}`);
        }
        const opts = options && typeof options === 'object' ? { ...options } : {};
        const headers = new Headers(opts.headers || {});
        headers.set('X-Relay-Key', relayKey);
        opts.headers = Object.fromEntries(headers.entries());
        if (protocols && typeof protocols === 'object' && !Array.isArray(protocols)) {
          super(addr, { ...protocols, headers: opts.headers });
        } else {
          super(addr, protocols ?? [], opts);
        }
      }
    }
    return RelayWebSocket;
  });

  console.log(`[Relay] Discord vía relay: ${relayBase}`);
  module.exports = { restOptions: { makeRequest: relayMakeRequest }, proxyAgent: null, relayBase };
} else if (proxyUrl) {
  // --- Modo proxy CONNECT (undici + ws) ---
  const { ProxyAgent, setGlobalDispatcher } = require('undici');
  const proxyAgent = new ProxyAgent(proxyUrl);
  setGlobalDispatcher(proxyAgent);

  const { HttpsProxyAgent } = require('https-proxy-agent');
  const wsAgent = new HttpsProxyAgent(proxyUrl);

  patchWsWebsocket((ws) => {
    class ProxiedWebSocket extends ws {
      constructor(address, protocols, options) {
        if (protocols && typeof protocols === 'object' && !Array.isArray(protocols)) {
          super(address, { ...protocols, agent: wsAgent });
        } else {
          super(address, protocols ?? [], {
            ...(options && typeof options === 'object' ? options : {}),
            agent: wsAgent,
          });
        }
      }
    }
    return ProxiedWebSocket;
  });

  const visible = proxyUrl.includes('@') ? proxyUrl.replace(/\/\/[^@]*@/, '//***@') : proxyUrl;
  console.log(`[Proxy] Discord conectará vía proxy: ${visible}`);
  module.exports = { restOptions: { agent: proxyAgent }, proxyAgent, relayBase: null };
} else {
  module.exports = { restOptions: {}, proxyAgent: null, relayBase: null };
}
