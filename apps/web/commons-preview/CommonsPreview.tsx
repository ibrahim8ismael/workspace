import { useState } from 'react';
import { CommonsScene } from './CommonsScene';

export function CommonsPreview() {
  const [open, setOpen] = useState(true);
  return (
    <main className="commons-preview">
      <h1>Commons renderer preview</h1>
      <p>Northwest meeting room</p>
      {open ? (
        <CommonsScene closeLabel="Close preview" onClose={() => setOpen(false)} />
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Open preview
        </button>
      )}
    </main>
  );
}
