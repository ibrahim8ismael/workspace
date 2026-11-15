import { expect, test, type Page } from '@playwright/test';
import type { Participant } from '../../apps/web/types';

const start = { x: 656, y: 1264 };
const epoch = 'fixture-shared-epoch';

async function position(page: Page, participant: string) {
  return page.locator('.office-scene svg.office-map').evaluate((svg, name) => {
    const root = svg as SVGSVGElement;
    const avatar = Array.from(root.querySelectorAll<SVGGElement>('.scene-avatar')).find((element) =>
      element.getAttribute('aria-label')?.startsWith(name),
    );
    const wrapper = avatar?.parentElement;
    if (!wrapper?.dataset.worldX || !wrapper.dataset.worldY)
      throw new Error(`No logical world position for ${name}`);
    return {
      x: Number(wrapper.dataset.worldX),
      y: Number(wrapper.dataset.worldY),
      authoritativeX: Number(wrapper.dataset.authoritativeX),
      authoritativeY: Number(wrapper.dataset.authoritativeY),
      epoch: root.dataset.authoritativeEpoch,
      version: Number(root.dataset.authoritativeVersion),
    };
  }, participant);
}

async function update(page: Page, version: number, aliceX: number, aliceY: number) {
  await page.evaluate(
    ({ nextVersion, x, y, nextEpoch, startX, startY }) => {
      const participants: Participant[] = [
        { id: 'alice', name: 'Alice', color: '#e0b487', x, y, status: 'available' },
        {
          id: 'bob',
          name: 'Bob',
          color: '#9d8be4',
          x: startX + 96,
          y: startY,
          status: 'available',
        },
      ];
      window.updateOfficeFixture({ epoch: nextEpoch, version: nextVersion, participants });
    },
    {
      nextVersion: version,
      x: aliceX,
      nextEpoch: epoch,
      startX: start.x,
      startY: start.y,
      y: aliceY,
    },
  );
}

test('two clients expose legacy drift and converge from the same authoritative version', async ({
  browser,
}) => {
  const aliceContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const bobContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();
  let correctedAliceContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let correctedBobContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    await Promise.all([
      alicePage.goto('/test-fixtures/vivo-sync.html?self=alice'),
      bobPage.goto('/test-fixtures/vivo-sync.html?self=bob'),
    ]);
    await Promise.all([
      expect(alicePage.locator('.scene-avatar')).toHaveCount(2),
      expect(bobPage.locator('.scene-avatar')).toHaveCount(2),
    ]);

    await alicePage.locator('.office-map').focus();
    await alicePage.keyboard.down('ArrowRight');
    await alicePage.waitForTimeout(900);
    const stoppedX = start.x + 192 * 0.9;
    const stoppedY = start.y + 3.375;
    await alicePage.keyboard.up('ArrowRight');
    await update(alicePage, 2, stoppedX, stoppedY);
    await update(bobPage, 2, stoppedX, stoppedY);
    await alicePage.waitForTimeout(220);
    await bobPage.waitForTimeout(220);

    const legacySelf = await position(alicePage, 'Alice');
    const legacyPeer = await position(bobPage, 'Alice');
    expect(legacySelf.epoch).toBe(epoch);
    expect(legacyPeer.epoch).toBe(epoch);
    expect(legacySelf.version).toBe(2);
    expect(legacyPeer.version).toBe(2);
    expect(legacySelf.authoritativeX).toBe(stoppedX);
    expect(legacyPeer.authoritativeX).toBe(stoppedX);
    expect(legacySelf.authoritativeY).toBe(stoppedY);
    expect(legacyPeer.authoritativeY).toBe(stoppedY);
    const baselineDriftPx = Math.hypot(legacySelf.x - legacyPeer.x, legacySelf.y - legacyPeer.y);
    await test.info().attach('two-client-position-baseline.json', {
      body: JSON.stringify({ legacySelf, legacyPeer, baselineDriftPx }, null, 2),
      contentType: 'application/json',
    });
    console.log(`legacy same-version render drift: ${baselineDriftPx.toFixed(3)} px`, {
      legacySelf,
      legacyPeer,
    });
    expect(baselineDriftPx).toBeGreaterThan(10);

    correctedAliceContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
    correctedBobContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
    const correctedAlicePage = await correctedAliceContext.newPage();
    const correctedBobPage = await correctedBobContext.newPage();
    await Promise.all([
      correctedAlicePage.goto('/test-fixtures/vivo-sync.html?self=alice&mode=authoritative'),
      correctedBobPage.goto('/test-fixtures/vivo-sync.html?self=bob&mode=authoritative'),
    ]);
    await Promise.all([
      expect(correctedAlicePage.locator('.scene-avatar')).toHaveCount(2),
      expect(correctedBobPage.locator('.scene-avatar')).toHaveCount(2),
    ]);
    await update(correctedAlicePage, 3, stoppedX, stoppedY);
    await update(correctedBobPage, 3, stoppedX, stoppedY);
    await correctedAlicePage.waitForTimeout(220);
    await correctedBobPage.waitForTimeout(220);
    const correctedSelf = await position(correctedAlicePage, 'Alice');
    const correctedPeer = await position(correctedBobPage, 'Alice');
    expect(correctedSelf.epoch).toBe(epoch);
    expect(correctedPeer.epoch).toBe(epoch);
    expect(correctedSelf.version).toBe(3);
    expect(correctedPeer.version).toBe(3);
    const residualPx = Math.hypot(
      correctedSelf.x - correctedPeer.x,
      correctedSelf.y - correctedPeer.y,
    );
    expect(correctedSelf.x).toBe(stoppedX);
    expect(correctedSelf.y).toBe(stoppedY);
    expect(correctedPeer.x).toBe(stoppedX);
    expect(correctedPeer.y).toBe(stoppedY);
    expect(correctedSelf.authoritativeX).toBe(stoppedX);
    expect(correctedPeer.authoritativeX).toBe(stoppedX);
    expect(correctedSelf.authoritativeY).toBe(stoppedY);
    expect(correctedPeer.authoritativeY).toBe(stoppedY);
    await test.info().attach('two-client-position-corrected.json', {
      body: JSON.stringify({ correctedSelf, correctedPeer, residualPx }, null, 2),
      contentType: 'application/json',
    });
    console.log(`authoritative same-version residual: ${residualPx.toFixed(3)} px`, {
      correctedSelf,
      correctedPeer,
    });
    expect(residualPx).toBeLessThanOrEqual(0.01);

    await correctedAlicePage.locator('.office-map').focus();
    const inputStartedAt = Date.now();
    await correctedAlicePage.keyboard.down('ArrowRight');
    await expect
      .poll(() => correctedAlicePage.evaluate(() => window.officeFixtureIntents.length))
      .toBeGreaterThan(0);
    const firstIntent = await correctedAlicePage.evaluate(() => window.officeFixtureIntents[0]!.at);
    await correctedAlicePage.evaluate(() => window.startOfficePositionCapture());
    const firstVisibleAtPromise = correctedAlicePage.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const svg = document.querySelector<SVGSVGElement>('.office-map')!;
          const avatar = svg.querySelector<SVGGElement>('.scene-avatar.is-self')!;
          const startX = Number(avatar.parentElement!.dataset.worldX);
          const observe = () => {
            const current = Number(avatar.parentElement!.dataset.worldX);
            if (current > startX + 0.01) resolve(performance.now());
            else requestAnimationFrame(observe);
          };
          requestAnimationFrame(observe);
        }),
    );
    await update(correctedAlicePage, 4, stoppedX + 19.2, stoppedY);
    const snapshotDeliveredAt = await correctedAlicePage.evaluate(() => performance.now());
    const firstVisibleAt = await firstVisibleAtPromise;
    for (let sample = 2; sample <= 5; sample++) {
      await update(correctedAlicePage, 3 + sample, stoppedX + 19.2 * sample, stoppedY);
      await correctedAlicePage.waitForTimeout(100);
    }
    const streamSamples = await correctedAlicePage.evaluate(() =>
      window.stopOfficePositionCapture(),
    );
    const maximumFrameStepPx = Math.max(
      ...streamSamples.slice(1).map((sample, index) => Math.abs(sample - streamSamples[index]!)),
    );
    expect(streamSamples.length).toBeGreaterThan(20);
    expect(maximumFrameStepPx).toBeLessThan(19.2);
    const inputToVisibleMs = firstVisibleAt - firstIntent;
    const snapshotToVisibleMs = firstVisibleAt - snapshotDeliveredAt;
    await correctedAlicePage.waitForTimeout(245);
    const heldIntents = await correctedAlicePage.evaluate(() => [...window.officeFixtureIntents]);
    expect(heldIntents.length).toBeGreaterThanOrEqual(3);
    expect(heldIntents.every(({ dx, dy }) => dx === 1 && dy === 0)).toBe(true);
    expect(heldIntents.at(-1)!.at - heldIntents[0]!.at).toBeGreaterThanOrEqual(180);
    expect(heldIntents.length).toBeLessThanOrEqual(28);
    const heldRatePerSecond =
      (heldIntents.length * 1000) / (heldIntents.at(-1)!.at - heldIntents[0]!.at + 100);
    expect(heldRatePerSecond).toBeLessThanOrEqual(30);
    await correctedAlicePage.keyboard.up('ArrowRight');
    const stoppedIntents = await correctedAlicePage.evaluate(() => [
      ...window.officeFixtureIntents,
    ]);
    expect(stoppedIntents.at(-1)).toMatchObject({ dx: 0, dy: 0 });
    await correctedAlicePage.waitForTimeout(160);
    const afterStopIntents = await correctedAlicePage.evaluate(() => [
      ...window.officeFixtureIntents,
    ]);
    expect(afterStopIntents).toHaveLength(stoppedIntents.length);
    await test.info().attach('movement-controller-trace.json', {
      body: JSON.stringify(
        {
          inputStartedAt,
          inputToVisibleMs,
          snapshotToVisibleMs,
          maximumFrameStepPx,
          heldRatePerSecond,
          heldIntents,
          stoppedIntents,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    console.log(
      `controlled input-to-visible ${inputToVisibleMs.toFixed(1)}ms (snapshot-to-visible ${snapshotToVisibleMs.toFixed(1)}ms); continuous stream max frame delta ${maximumFrameStepPx.toFixed(2)}px`,
    );

    await update(correctedAlicePage, 9, start.x, start.y);
    await correctedAlicePage.waitForTimeout(220);
    await correctedAlicePage.evaluate(
      ({ targetX, targetY }) => {
        window.officeFixtureIntents.length = 0;
        window.navigateOfficeFixture({ x: targetX, y: targetY, nonce: 1 });
      },
      { targetX: start.x + 64, targetY: start.y },
    );
    await expect
      .poll(() => correctedAlicePage.evaluate(() => window.officeFixtureIntents.length))
      .toBeGreaterThan(0);
    await update(correctedAlicePage, 10, start.x + 32, start.y);
    await correctedAlicePage.waitForTimeout(130);
    await update(correctedAlicePage, 11, start.x + 64, start.y);
    await expect
      .poll(async () => {
        const intents = await correctedAlicePage.evaluate(() => window.officeFixtureIntents);
        return intents.at(-1)?.dx === 0 && intents.at(-1)?.dy === 0;
      })
      .toBe(true);
    const completedRouteIntents = await correctedAlicePage.evaluate(() => [
      ...window.officeFixtureIntents,
    ]);
    expect(completedRouteIntents.some(({ dx, dy }) => dx === 1 && dy === 0)).toBe(true);

    await correctedAlicePage.evaluate(
      ({ targetX, targetY }) => {
        window.officeFixtureIntents.length = 0;
        window.navigateOfficeFixture({ x: targetX, y: targetY, nonce: 2 });
      },
      { targetX: start.x + 128, targetY: start.y },
    );
    await expect
      .poll(() => correctedAlicePage.evaluate(() => window.officeFixtureIntents.length))
      .toBeGreaterThan(0);
    await correctedAlicePage.waitForTimeout(1250);
    const stalledRouteIntents = await correctedAlicePage.evaluate(() => [
      ...window.officeFixtureIntents,
    ]);
    const lastStopIndex = stalledRouteIntents
      .map(({ dx, dy }) => dx === 0 && dy === 0)
      .lastIndexOf(true);
    expect(lastStopIndex).toBeGreaterThanOrEqual(0);
    expect(stalledRouteIntents.slice(lastStopIndex + 1)).toHaveLength(0);
  } finally {
    await Promise.all([
      aliceContext.close(),
      bobContext.close(),
      correctedAliceContext?.close(),
      correctedBobContext?.close(),
    ]);
  }
});
