import http from 'node:http';
/** Experimental fixed-upstream signaling gate. Does not enforce media forwarding by itself. */
export function createSignalingGuard({ upstream, origin, authorize }) {
  const target = new URL(upstream);
  if (target.protocol !== 'http:' || typeof authorize !== 'function')
    throw new Error('invalid guard config');
  const sockets = new Set();
  async function permitted(req, path) {
    if (req.method !== 'GET' || req.headers.origin !== origin) return false;
    if (req.url.length > 16384) return false;
    const url = new URL(req.url, 'http://fixture.invalid');
    const v1 = path === '/rtc' ? '/rtc/v1' : '/rtc/v1/validate';
    if (![path, v1].includes(url.pathname) || url.searchParams.getAll('access_token').length !== 1)
      return false;
    if (url.pathname === v1) {
      const joined = url.searchParams.getAll('join_request');
      if (
        joined.length !== 1 ||
        !/^[A-Za-z0-9_-]+={0,2}$/.test(joined[0]) ||
        joined[0].length > 12000
      )
        return false;
    }
    const token = url.searchParams.get('access_token');
    if (!token || token.length > 8192) return false;
    let timer;
    try {
      return (
        (await Promise.race([
          Promise.resolve().then(() => authorize(token)),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve(false), 1000);
          }),
        ])) === true
      );
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', origin);
    if (!(await permitted(req, '/rtc/validate'))) {
      res.writeHead(403);
      res.end();
      return;
    }
    const proxy = http.request(
      target,
      { method: 'GET', path: req.url, headers: { origin } },
      (response) => {
        res.writeHead(response.statusCode ?? 502);
        response.pipe(res);
      },
    );
    proxy.setTimeout(2000, () => proxy.destroy());
    proxy.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    res.on('close', () => proxy.destroy());
    proxy.end();
  });
  server.on('upgrade', async (req, client, head) => {
    client.on('error', () => client.destroy());
    if (!(await permitted(req, '/rtc'))) {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    if (client.destroyed) return;
    const proxy = http.request(target, {
      method: 'GET',
      path: req.url,
      headers: { ...req.headers, host: target.host },
    });
    proxy.setTimeout(2000, () => proxy.destroy());
    proxy.on('upgrade', (response, remote, remoteHead) => {
      proxy.setTimeout(0);
      sockets.add(client);
      sockets.add(remote);
      client.write(
        `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` +
          Object.entries(response.headers)
            .map(([key, value]) => `${key}: ${value}\r\n`)
            .join('') +
          '\r\n',
      );
      if (remoteHead.length) client.write(remoteHead);
      if (head.length) remote.write(head);
      client.pipe(remote);
      remote.pipe(client);
      const cleanup = () => {
        client.destroy();
        remote.destroy();
        sockets.delete(client);
        sockets.delete(remote);
      };
      client.on('close', cleanup);
      remote.on('close', cleanup);
      remote.on('error', cleanup);
    });
    proxy.on('response', () => client.destroy());
    proxy.on('error', () => client.destroy());
    proxy.end();
  });
  return {
    server,
    close: () => {
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}
