// Cloudflare Worker: relay HTTP + WebSocket hacia Discord
// Despliegalo en dash.cloudflare.com → Workers & Pages → Create Worker → pega este código
const ALLOWED_KEY = 'enp-cnp-7d4f1a';
const ALLOWED_HOSTS = ['discord.com', 'cdn.discordapp.com', 'media.discordapp.net'];

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('X-Relay-Key') !== ALLOWED_KEY) {
      return new Response('forbidden', { status: 403 });
    }

    // WebSocket -> gateway.discord.gg
    if (request.headers.get('Upgrade') === 'websocket') {
      const target = `wss://gateway.discord.gg${url.pathname}${url.search}`;
      const resp = await fetch(target, request);
      return new Response(null, {
        status: 101,
        webSocket: resp.webSocket,
      });
    }

    // HTTP -> discord.com (u otro host permitido)
    const host = request.headers.get('X-Relay-Host') || 'discord.com';
    if (!ALLOWED_HOSTS.includes(host)) {
      return new Response('bad host', { status: 400 });
    }
    const target = `https://${host}${url.pathname}${url.search}`;
    const newReq = new Request(target, request);
    newReq.headers.set('Host', host);
    return fetch(newReq);
  },
};
