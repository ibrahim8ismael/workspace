import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSignalingGuard } from '../signaling-guard.mjs';
test('validation requires exact origin/path and authorized token; unknown v1 is denied', async () => {
  let forwarded = 0;
  const upstream = http.createServer((req, res) => {
    forwarded++;
    res.end('validated');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const guard = createSignalingGuard({
    upstream: `http://127.0.0.1:${upstream.address().port}`,
    origin: 'http://fixture.test',
    authorize: async (token) => token === 'valid',
  });
  await new Promise((resolve) => guard.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${guard.server.address().port}`;
  try {
    for (const path of [
      '/rtc/v1?access_token=valid',
      '/rtc/v1/validate?access_token=valid',
      '/twirp?access_token=valid',
      '/rtc/validate?access_token=bad',
      '/rtc/validate?access_token=valid&access_token=valid',
    ])
      assert.equal(
        (await fetch(base + path, { headers: { Origin: 'http://fixture.test' } })).status,
        403,
      );
    assert.equal(
      (
        await fetch(base + '/rtc/validate?access_token=valid', {
          headers: { Origin: 'http://wrong.test' },
        })
      ).status,
      403,
    );
    assert.equal(forwarded, 0);
    const good = await fetch(base + '/rtc/validate?access_token=valid', {
      headers: { Origin: 'http://fixture.test' },
    });
    assert.equal(good.status, 200);
    assert.equal(await good.text(), 'validated');
    assert.equal(forwarded, 1);
  } finally {
    guard.close();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
