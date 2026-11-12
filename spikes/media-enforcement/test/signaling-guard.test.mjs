import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSignalingGuard } from '../signaling-guard.mjs';
test('validation requires exact origin/path and authorized token; malformed v1 is denied', async () => {
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
  const httpStatus = (path, headers) =>
    new Promise((resolve, reject) => {
      const req = http.get(base + path, { headers }, (response) => {
        response.resume();
        resolve(response.statusCode);
      });
      req.on('error', reject);
    });
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
    const v1 = await fetch(base + '/rtc/v1/validate?access_token=valid&join_request=AA', {
      headers: { Origin: 'http://fixture.test' },
    });
    assert.equal(v1.status, 200);
    assert.equal(forwarded, 2);

    const sameOriginV1 = await httpStatus(
      '/rtc/v1/validate?access_token=valid&join_request=AA',
      { Host: 'fixture.test', 'Sec-Fetch-Site': 'same-origin' },
    );
    assert.equal(sameOriginV1, 200);
    assert.equal(forwarded, 3);
    const crossSiteWithoutOrigin = await httpStatus(
      '/rtc/v1/validate?access_token=valid&join_request=AA',
      { Host: 'fixture.test', 'Sec-Fetch-Site': 'cross-site' },
    );
    assert.equal(crossSiteWithoutOrigin, 403);
    const missingFetchSite = await httpStatus(
      '/rtc/v1/validate?access_token=valid&join_request=AA',
      { Host: 'fixture.test' },
    );
    assert.equal(missingFetchSite, 403);
  } finally {
    guard.close();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
