import { language } from './i18n';

/** Decorator categories, in the order they appear, and the catalog families each one gathers. */
export const CATEGORIES: { id: string; es: string; en: string; families: string[] }[] = [
  { id: 'desks', es: 'Escritorios', en: 'Desks', families: ['Desk'] },
  { id: 'tables', es: 'Mesas', en: 'Tables', families: ['1x1 Table', '2x3 Table', 'Coffee Table'] },
  { id: 'chairs', es: 'Sillas', en: 'Chairs', families: ['Chair'] },
  {
    id: 'sofas',
    es: 'Sofás y sillones',
    en: 'Sofas and armchairs',
    families: ['Couch', 'Armchair'],
  },
  {
    id: 'storage',
    es: 'Almacenamiento',
    en: 'Storage',
    families: ['Bookcase', 'Cabinet', 'Shelf', 'Wall Cabinet'],
  },
  {
    id: 'tech',
    es: 'Tecnología',
    en: 'Technology',
    families: ['Computer Set', 'Mobile', 'Mounted Display', 'Arcade Machine'],
  },
  {
    id: 'kitchen',
    es: 'Cocina y café',
    en: 'Kitchen and coffee',
    families: ['Coffee', 'Fridge', 'Kitchen Counters', 'Hydration'],
  },
  {
    id: 'plants',
    es: 'Plantas y exterior',
    en: 'Plants and outdoors',
    families: [
      'Room Plant',
      'Desk Plant',
      'Ground Plant',
      'Tree',
      'Pond',
      'Garden',
      'Garden Seat',
      'Fountain',
    ],
  },
  {
    id: 'beach',
    es: 'Playa',
    en: 'Beach',
    families: ['Palm Tree', 'Beach Umbrella', 'Beach Seat', 'Beach Decor'],
  },
  { id: 'city', es: 'Ciudad', en: 'City', families: ['Street'] },
  { id: 'lighting', es: 'Iluminación', en: 'Lighting', families: ['Floor Lamp', 'Street Lamp'] },
  {
    id: 'decor',
    es: 'Decoración',
    en: 'Decoration',
    families: ['Painting', 'Wall Cover', 'Wall Clock', 'Globe', 'Small Fishtank', 'Duck'],
  },
  {
    id: 'stationery',
    es: 'Papelería y oficina',
    en: 'Stationery and office',
    families: ['Book', 'Document', 'Handwritten Notes', 'Easel'],
  },
];
const OTHER = { id: 'other', es: 'Otros', en: 'Other' };

const NAMES: Record<string, [string, string]> = {
  'office-desk': ['Escritorio', 'Desk'],
  'oval-desk': ['Mostrador ovalado', 'Oval counter'],
  'mid-century-side-table': ['Mesa auxiliar', 'Side table'],
  'round-table': ['Mesa redonda', 'Round table'],
  'simple-table-2x3': ['Mesa grande', 'Large table'],
  'round-coffee-table': ['Mesa de centro ovalada', 'Oval coffee table'],
  'simple-coffee-table': ['Mesa de centro', 'Coffee table'],
  'aeron-chair': ['Silla ergonómica', 'Ergonomic chair'],
  'beanbag-chair': ['Puf', 'Beanbag'],
  'lawn-chair': ['Silla de jardín', 'Lawn chair'],
  'simple-chair': ['Silla de madera', 'Wooden chair'],
  'barcelona-chair': ['Sillón Barcelona', 'Barcelona chair'],
  'gamer-chair': ['Silla gamer', 'Gaming chair'],
  'pp501-chair': ['Sillón de madera', 'Wooden armchair'],
  'space-chair': ['Butaca de concha', 'Shell chair'],
  'z-chair': ['Silla de comedor', 'Dining chair'],
  'mid-century-leather-couch': ['Sofá de cuero', 'Leather sofa'],
  'modular-couch-segment': ['Módulo de sofá', 'Sofa module'],
  'modular-couch-corner': ['Esquina de sofá', 'Sofa corner'],
  'u-shaped-armchair': ['Sillón envolvente', 'Tub armchair'],
  'cubicle-shelves': ['Estantería de cubos', 'Cube shelves'],
  'bookcase-tall': ['Librería', 'Bookcase'],
  'office-cabinet': ['Armario de oficina', 'Office cabinet'],
  'filing-cabinet': ['Archivador', 'Filing cabinet'],
  'portfolio-drawers': ['Cajonera de planos', 'Flat file drawers'],
  'floating-bookshelf': ['Estante flotante', 'Floating shelf'],
  'wall-cabinet': ['Armario de pared', 'Wall cabinet'],
  'digital-artist-computer': ['Equipo de diseño', 'Design workstation'],
  'hardware-dev-computer': ['Equipo de desarrollo', 'Developer workstation'],
  'laptop-computer': ['Portátil', 'Laptop'],
  'tablet-and-phone': ['Tableta y teléfono', 'Tablet and phone'],
  'television-screen-wall': ['Televisor de pared', 'Wall TV'],
  'arcade-machine': ['Máquina arcade', 'Arcade machine'],
  'mug-wide': ['Taza ancha', 'Wide mug'],
  'mug-regular': ['Taza', 'Mug'],
  'single-coffee-machine': ['Cafetera de cápsulas', 'Pod coffee maker'],
  'espresso-machine': ['Cafetera espresso', 'Espresso machine'],
  'mini-fridge': ['Nevera pequeña', 'Mini fridge'],
  'kitchen-cabinet-large': ['Encimera de cocina', 'Kitchen counter'],
  'water-cooler': ['Dispensador de agua', 'Water cooler'],
  'fiddle-leaf-fig': ['Ficus lira', 'Fiddle-leaf fig'],
  'ceramic-planter': ['Planta en maceta', 'Potted plant'],
  ficus: ['Ficus', 'Ficus'],
  philodendron: ['Filodendro', 'Philodendron'],
  'bamboo-planter': ['Bambú', 'Bamboo'],
  'aloe-vera': ['Aloe vera', 'Aloe vera'],
  'small-potted-hosta': ['Planta de escritorio', 'Desk plant'],
  sprout: ['Brote', 'Sprout'],
  fern: ['Helecho', 'Fern'],
  'pine-tree-small': ['Pino pequeño', 'Small pine'],
  'pine-tree-large': ['Pino grande', 'Large pine'],
  'birch-tree': ['Abedul', 'Birch'],
  'maple-tree': ['Arce', 'Maple'],
  'koi-pond': ['Estanque de peces', 'Koi pond'],
  'molecular-lamp': ['Lámpara de pie', 'Floor lamp'],
  'abstract-painting-rectangles': ['Cuadro abstracto', 'Abstract painting'],
  'mondrian-painting': ['Cuadro Mondrian', 'Mondrian painting'],
  'hip-wall-art': ['Cuadro moderno', 'Modern wall art'],
  'wall-clock-minimal-face': ['Reloj de pared', 'Wall clock'],
  globe: ['Globo terráqueo', 'Globe'],
  'small-fishtank': ['Acuario', 'Fish tank'],
  'rubber-ducky': ['Patito de goma', 'Rubber duck'],
  'book-open': ['Libro abierto', 'Open book'],
  'book-closed': ['Libro cerrado', 'Closed book'],
  'document-single': ['Documento', 'Document'],
  'inkpen-notes': ['Notas y bolígrafo', 'Notes and pen'],
  'poster-easel': ['Caballete con gráfico', 'Chart easel'],
  'palm-tree': ['Palmera', 'Palm tree'],
  'palm-tree-short': ['Palmera baja', 'Short palm tree'],
  'beach-umbrella': ['Sombrilla', 'Beach umbrella'],
  'sun-lounger': ['Tumbona', 'Sun lounger'],
  'beach-towel': ['Toalla de playa', 'Beach towel'],
  surfboard: ['Tabla de surf', 'Surfboard'],
  sandcastle: ['Castillo de arena', 'Sandcastle'],
  'beach-ball': ['Pelota de playa', 'Beach ball'],
  'lifeguard-tower': ['Torre de socorrista', 'Lifeguard tower'],
  rowboat: ['Barca', 'Rowboat'],
  'beach-rocks': ['Rocas', 'Rocks'],
  hedge: ['Seto', 'Hedge'],
  'flower-bed': ['Jardinera con flores', 'Flower bed'],
  'park-bench': ['Banco', 'Park bench'],
  'street-lamp': ['Farola', 'Street lamp'],
  fountain: ['Fuente', 'Fountain'],
  'bus-stop': ['Parada de autobús', 'Bus stop'],
  'traffic-light': ['Semáforo', 'Traffic light'],
  'fire-hydrant': ['Boca de incendio', 'Fire hydrant'],
  'bike-rack': ['Aparcabicis', 'Bike rack'],
  'trash-bin': ['Papelera', 'Trash bin'],
  'street-tree': ['Árbol de calle', 'Street tree'],
  'food-cart': ['Carrito de comida', 'Food cart'],
};
const COLORS: Record<string, [string, string]> = {
  purple: ['morado', 'purple'],
  black: ['negro', 'black'],
  white: ['blanco', 'white'],
  yellow: ['amarillo', 'yellow'],
  lightcoffee: ['madera clara', 'light wood'],
  coffee: ['madera', 'wood'],
  brown: ['marrón', 'brown'],
  blue: ['azul', 'blue'],
  pink: ['rosa', 'pink'],
  green: ['verde', 'green'],
  lightgreen: ['verde claro', 'light green'],
  grey: ['gris', 'grey'],
  teal: ['turquesa', 'teal'],
  sand: ['arena', 'sand'],
  glass: ['cristal', 'glass'],
  wood: ['madera', 'wood'],
  stone: ['piedra', 'stone'],
  lightteal: ['turquesa claro', 'light teal'],
  orange: ['naranja', 'orange'],
  lightblue: ['azul claro', 'light blue'],
  red: ['rojo', 'red'],
};
const FACINGS: Record<string, [string, string]> = {
  Down: ['de frente', 'facing front'],
  Up: ['de espaldas', 'facing back'],
  Left: ['hacia la izquierda', 'facing left'],
  Right: ['hacia la derecha', 'facing right'],
};

const pick = (pair: [string, string] | undefined, fallback: string) =>
  pair ? pair[language() === 'es' ? 0 : 1] : fallback;
const humanize = (kind: string) => kind.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const objectName = (kind: string) => pick(NAMES[kind], humanize(kind));
export const colorName = (color: string) => pick(COLORS[color], color);
export const facingName = (facing: string) => pick(FACINGS[facing], facing);
/** Name, colour and orientation, for titles and the edit toolbar. */
export const objectDescription = (kind: string, color?: string) =>
  color ? `${objectName(kind)} · ${colorName(color)}` : objectName(kind);
export function categoryOf(family: string) {
  const found = CATEGORIES.find((category) => category.families.includes(family)) ?? OTHER;
  return {
    id: found.id,
    name: language() === 'es' ? found.es : found.en,
    order: found === OTHER ? 99 : CATEGORIES.indexOf(found as (typeof CATEGORIES)[number]),
  };
}
/** Text the catalog search matches: names in both languages, colours and the internal kind. */
export const searchText = (kind: string, color: string, family: string) =>
  [NAMES[kind]?.join(' '), COLORS[color]?.join(' '), kind, family, categoryOf(family).name]
    .join(' ')
    .toLowerCase();
