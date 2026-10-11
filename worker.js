const ALLOWED_KEY = 'enp-cnp-7d4f1a';
const ALLOWED_HOSTS = ['discord.com', 'cdn.discordapp.com', 'media.discordapp.net'];

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('X-Relay-Key') !== ALLOWED_KEY) {
      return new Response('forbidden', { status: 403 });
    }

    // WebSocket -> gateway.discord.gg (patrón WebSocketPair + tubería)
    if (request.headers.get('Upgrade') === 'websocket') {
      const target = `https://gateway.discord.gg${url.pathname}${url.search}`;
      let upstreamResp, upstream;
      try {
        upstreamResp = await fetch(target, {
          headers: { Upgrade: 'websocket' },
        });
        upstream = upstreamResp.webSocket;
      } catch (e) {
        return new Response('upstream fetch failed: ' + (e && e.message), { status: 502 });
      }
      if (!upstream) {
        return new Response('upstream did not accept websocket (status ' + upstreamResp.status + ')', { status: 502 });
      }
      upstream.accept();

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();

      upstream.addEventListener('message', (event) => server.send(event.data));
      server.addEventListener('message', (event) => upstream.send(event.data));
      upstream.addEventListener('close', (event) => server.close(event.code, event.reason));
      server.addEventListener('close', (event) => upstream.close(event.code, event.reason));
      upstream.addEventListener('error', () => server.close(1011, 'upstream error'));
      server.addEventListener('error', () => upstream.close(1011, 'client error'));

      return new Response(null, { status: 101, webSocket: client });
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
