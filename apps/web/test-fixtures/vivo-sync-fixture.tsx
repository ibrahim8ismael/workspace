import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import VivoScene from '../VivoScene';
import type { Participant } from '../types';
import type { Overrides } from '../../shared/office-objects.js';
import type { Point } from '../navigation';

const emptyOverrides: Overrides = {};
const start = { x: 656.25, y: 1264.375 };
const selfId = new URLSearchParams(location.search).get('self') ?? 'alice';
const fixtureIntents: { dx: number; dy: number; at: number }[] = [];
window.officeFixtureIntents = fixtureIntents;
let positionSamples: number[] = [];
let sampleFrame = 0;
window.startOfficePositionCapture = () => {
  positionSamples = [];
  const sample = () => {
    const self = document.querySelector<SVGGElement>('.scene-avatar.is-self');
    const position = self?.parentElement?.dataset.worldX;
    if (position) positionSamples.push(Number(position));
    sampleFrame = requestAnimationFrame(sample);
  };
  sampleFrame = requestAnimationFrame(sample);
};
window.stopOfficePositionCapture = () => {
  cancelAnimationFrame(sampleFrame);
  return [...positionSamples];
};

function Fixture() {
  const [authoritative] = useState(
    new URLSearchParams(location.search).get('mode') === 'authoritative',
  );
  const [revision, setRevision] = useState({ epoch: 'fixture-epoch', version: 1 });
  const [navigationTarget, setNavigationTarget] = useState<
    (Point & { nonce: number }) | undefined
  >();
  const [participants, setParticipants] = useState<Participant[]>([
    { id: 'alice', name: 'Alice', color: '#e0b487', x: start.x, y: start.y, status: 'available' },
    { id: 'bob', name: 'Bob', color: '#9d8be4', x: start.x + 96, y: start.y, status: 'available' },
  ]);

  window.updateOfficeFixture = (next) => {
    setParticipants(next.participants);
    setRevision({ epoch: next.epoch, version: next.version });
  };
  window.navigateOfficeFixture = (target) => setNavigationTarget(target);

  return (
    <main style={{ height: '100vh', width: '100vw' }}>
      <VivoScene
        participants={participants}
        selfId={selfId}
        objects={[]}
        zoom={1}
        simplified={false}
        editItem={null}
        selectedObject={null}
        editorOpen={false}
        overrides={emptyOverrides}
        authoritativeMovement={authoritative}
        authoritativeRevision={revision}
        navigationTarget={navigationTarget}
        onMove={() => undefined}
        onMovementIntent={(dx, dy) => {
          fixtureIntents.push({ dx, dy, at: performance.now() });
        }}
        onPlace={() => undefined}
        onSelect={() => undefined}
        onSelectObject={() => undefined}
        onMoveObject={() => undefined}
        onRemove={() => undefined}
        meetings={{}}
        areaNames={{}}
        onAreaClick={() => undefined}
        onSit={() => undefined}
        onStand={() => undefined}
      />
    </main>
  );
}

declare global {
  interface Window {
    updateOfficeFixture: (snapshot: {
      epoch: string;
      version: number;
      participants: Participant[];
    }) => void;
    officeFixtureIntents: { dx: number; dy: number; at: number }[];
    navigateOfficeFixture: (target: Point & { nonce: number }) => void;
    startOfficePositionCapture: () => void;
    stopOfficePositionCapture: () => number[];
  }
}

createRoot(document.getElementById('root')!).render(<Fixture />);
