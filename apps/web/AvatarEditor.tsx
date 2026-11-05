import { useEffect, useState } from 'react';
import { Dices, Download, RotateCcw, RotateCw, X } from 'lucide-react';
import {
  BEARDS,
  BODIES,
  GLASSES,
  HATS,
  PALETTES,
  lookFrame,
  randomLook,
  type AvatarLook,
} from './avatarLook';
import { t } from './i18n';

type Category = 'body' | 'skin' | 'hair' | 'top' | 'bottom' | 'shoes' | 'glasses' | 'hat' | 'beard';
const CATEGORIES: { id: Category; label: string; crop: [number, number, number, number] }[] = [
  { id: 'body', label: 'Cuerpo', crop: [30, 20, 32, 50] },
  { id: 'skin', label: 'Piel', crop: [34, 22, 25, 24] },
  { id: 'hair', label: 'Pelo', crop: [34, 20, 25, 24] },
  { id: 'top', label: 'Parte superior', crop: [32, 42, 29, 18] },
  { id: 'bottom', label: 'Parte inferior', crop: [34, 54, 25, 16] },
  { id: 'shoes', label: 'Zapatos', crop: [34, 60, 25, 10] },
  { id: 'glasses', label: 'Gafas', crop: [34, 28, 25, 16] },
  { id: 'hat', label: 'Sombrero', crop: [32, 18, 29, 22] },
  { id: 'beard', label: 'Vello facial', crop: [34, 30, 25, 18] },
];
const FACINGS = ['south.png', 'west.png', 'north.png', 'east.png'];

/** Crops a frame region into a thumbnail (pixel-perfect, scaled with CSS). */
function Crop({
  src,
  crop,
  size,
}: {
  src: string | undefined;
  crop: [number, number, number, number];
  size: number;
}) {
  const [x, y, w, h] = crop,
    scale = size / Math.max(w, h);
  return (
    <span className="look-crop" style={{ width: w * scale, height: h * scale }}>
      {src && (
        <img
          src={src}
          alt=""
          style={{ width: 92 * scale, height: 92 * scale, left: -x * scale, top: -y * scale }}
        />
      )}
    </span>
  );
}
function useFrame(look: AvatarLook, file = 'south.png') {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    void lookFrame(look, file).then((url) => {
      if (live) setSrc(url);
    });
    return () => {
      live = false;
    };
  }, [JSON.stringify(look), file]);
  return src;
}
function Option({
  look,
  category,
  selected,
  label,
  onPick,
}: {
  look: AvatarLook;
  category: (typeof CATEGORIES)[number];
  selected: boolean;
  label: string;
  onPick: () => void;
}) {
  const src = useFrame(look);
  return (
    <button
      type="button"
      className={`look-option${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      title={label}
      aria-label={label}
      onClick={onPick}
    >
      <Crop src={src} crop={category.crop} size={56} />
    </button>
  );
}

/** The reference's avatar editor: categories, option grid, colour swatches, live preview, randomise and download. */
export default function AvatarEditor({
  initial,
  name,
  onCancel,
  onDone,
}: {
  initial: AvatarLook;
  name: string;
  onCancel: () => void;
  onDone: (look: AvatarLook) => void;
}) {
  const [look, setLook] = useState(initial);
  const [category, setCategory] = useState<Category>('body');
  const [facing, setFacing] = useState(0);
  const preview = useFrame(look, FACINGS[facing]);
  const active = CATEGORIES.find((item) => item.id === category)!;
  const count =
    category === 'body'
      ? BODIES.length
      : category === 'glasses'
        ? GLASSES.length
        : category === 'hat'
          ? HATS.length
          : category === 'beard'
            ? BEARDS.length
            : PALETTES[category].length;
  const optionLabel = (index: number) =>
    category === 'body'
      ? t(BODIES[index].label)
      : category === 'glasses'
        ? t(GLASSES[index])
        : category === 'hat'
          ? t(HATS[index])
          : category === 'beard'
            ? t(BEARDS[index])
            : `${t(active.label)} ${index + 1}`;
  const changed = JSON.stringify(look) !== JSON.stringify(initial);
  const download = () => {
    if (!preview) return;
    const link = document.createElement('a');
    link.href = preview;
    link.download = `${name || 'avatar'}.png`;
    link.click();
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onCancel]);

  return (
    <div className="modal-backdrop look-backdrop" onClick={onCancel}>
      <div
        className="avatar-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="avatar-editor-title">{t('Editar avatar')}</h2>
          <button
            type="button"
            className="avatar-editor-close"
            aria-label={t('Cerrar ventana')}
            title={t('Cerrar ventana')}
            onClick={onCancel}
          >
            <X size={18} />
          </button>
        </header>
        <div className="avatar-editor-body">
          <nav className="look-categories" aria-label={t('Partes del avatar')}>
            {CATEGORIES.map((item) => (
              <CategoryButton
                key={item.id}
                item={item}
                look={look}
                active={item.id === category}
                onPick={() => setCategory(item.id)}
              />
            ))}
          </nav>
          <section className="look-options-panel">
            <div className="look-options">
              {Array.from({ length: count }, (_, index) => (
                <Option
                  key={index}
                  look={{ ...look, [category]: index }}
                  category={active}
                  selected={look[category] === index}
                  label={optionLabel(index)}
                  onPick={() => setLook((value) => ({ ...value, [category]: index }))}
                />
              ))}
            </div>
            {category !== 'glasses' &&
              category !== 'hat' &&
              category !== 'beard' &&
              category !== 'body' && (
                <div className="look-swatches" role="radiogroup" aria-label={t('Color')}>
                  {PALETTES[category].map((color, index) => (
                    <button
                      type="button"
                      key={color}
                      role="radio"
                      aria-checked={look[category] === index}
                      aria-label={`${t('Color')} ${index + 1}`}
                      className={look[category] === index ? 'is-selected' : ''}
                      style={{ background: color }}
                      onClick={() => setLook((value) => ({ ...value, [category]: index }))}
                    />
                  ))}
                </div>
              )}
          </section>
          <section className="look-preview" aria-label={t('Vista previa')}>
            <button
              type="button"
              className="look-tool top"
              aria-label={t('Descargar imagen')}
              title={t('Descargar imagen')}
              onClick={download}
            >
              <Download size={16} />
            </button>
            <div className="look-stage">
              <span className="look-nameplate">
                <i />
                {name || t('Invitado')}
              </span>
              {preview && <img src={preview} alt={t('Vista previa del avatar')} />}
            </div>
            <div className="look-rotate">
              <button
                type="button"
                className="look-tool"
                aria-label={t('Girar a la izquierda')}
                title={t('Girar a la izquierda')}
                onClick={() => setFacing((value) => (value + 3) % 4)}
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                className="look-tool"
                aria-label={t('Girar a la derecha')}
                title={t('Girar a la derecha')}
                onClick={() => setFacing((value) => (value + 1) % 4)}
              >
                <RotateCw size={15} />
              </button>
            </div>
            <button
              type="button"
              className="look-tool bottom"
              aria-label={t('Aleatorio')}
              title={t('Aleatorio')}
              onClick={() => setLook(randomLook(look.body))}
            >
              <Dices size={16} />
            </button>
          </section>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onCancel}>
            {t('Cancelar')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!changed}
            onClick={() => onDone(look)}
          >
            {t('Listo')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function CategoryButton({
  item,
  look,
  active,
  onPick,
}: {
  item: (typeof CATEGORIES)[number];
  look: AvatarLook;
  active: boolean;
  onPick: () => void;
}) {
  const src = useFrame(look);
  return (
    <button
      type="button"
      className={active ? 'is-active' : ''}
      aria-pressed={active}
      onClick={onPick}
    >
      <Crop src={src} crop={item.crop} size={24} />
      <span>{t(item.label)}</span>
    </button>
  );
}

/** A round avatar portrait (head and shoulders) for profile surfaces. */
export function AvatarPortrait({ look, size }: { look: AvatarLook; size: number }) {
  const src = useFrame(look);
  return (
    <span className="avatar-portrait" style={{ width: size, height: size }}>
      <Crop src={src} crop={[33, 20, 27, 30]} size={size * 0.78} />
    </span>
  );
}
