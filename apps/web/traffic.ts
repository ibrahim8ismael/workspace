import { TILE, TRAFFIC, WORLD } from '../shared/vivo-map.js';

/** Vehicle sprites (side view, facing right) and their size in pixels. */
export const VEHICLES: Record<string, { w: number; h: number }> = {
  'car-red': { w: 72, h: 44 },
  'car-blue': { w: 76, h: 44 },
  'car-taxi': { w: 76, h: 46 },
  'car-green': { w: 64, h: 42 },
  'van-white': { w: 84, h: 52 },
  'city-bus': { w: 140, h: 64 },
};

/** One vehicle on the street: its lane, its centre `x` in pixels and its current speed. */
export type Vehicle = {
  id: string;
  kind: string;
  lane: number;
  direction: 1 | -1;
  cruise: number;
  speed: number;
  x: number;
  y: number;
  w: number;
  h: number;
  top: number;
  bottom: number;
};
type Point = { x: number; y: number };

const MARGIN = 400; // vehicles drive on beyond the map edges before coming round again
const DISTANCE = WORLD.width + MARGIN * 2;
const KEEP_CLEAR = 10; // pixels kept between a vehicle's bumper and whatever is in front of it
const BRAKING = 150; // vehicles start slowing down this far from an obstacle

/** Every vehicle on the street, spread evenly along each lane. Positions start from the clock, so everyone in the
    space sees the traffic in about the same place. */
export const VEHICLES_ON_STREET: Vehicle[] = TRAFFIC.flatMap((lane, laneIndex) =>
  lane.vehicles.map((kind, index) => {
    const size = VEHICLES[kind] ?? { w: 72, h: 44 };
    const travelled =
      ((Date.now() / 1000) * lane.speed +
        (index * DISTANCE) / lane.vehicles.length +
        laneIndex * 260) %
      DISTANCE;
    return {
      id: `${laneIndex}-${index}`,
      kind,
      lane: laneIndex,
      direction: lane.direction,
      cruise: lane.speed,
      speed: lane.speed,
      x: lane.direction > 0 ? -MARGIN + travelled : WORLD.width + MARGIN - travelled,
      y: (lane.row + 1) * TILE - size.h - 9, // wheels inside the lane, clear of the centre line and the kerb
      w: size.w,
      h: size.h,
      top: (lane.row - 1) * TILE,
      bottom: (lane.row + 1) * TILE, // a lane is two tiles wide
    };
  }),
);

const ahead = (vehicle: Vehicle, x: number) => (x - vehicle.x) * vehicle.direction; // distance from the vehicle's centre, forwards

/** Moves the traffic on by `seconds`. A vehicle brakes for people standing in its lane and for the vehicle in front,
    and never drives into either. */
export function stepTraffic(seconds: number, people: Point[]) {
  const dt = Math.min(seconds, 0.1);
  for (const vehicle of VEHICLES_ON_STREET) {
    let gap = Infinity; // free road in front of the bumper
    for (const person of people) {
      if (person.y < vehicle.top || person.y >= vehicle.bottom) continue;
      const d = ahead(vehicle, person.x) - vehicle.w / 2 - TILE / 2;
      if (d > -vehicle.w) gap = Math.min(gap, Math.max(0, d));
    }
    for (const other of VEHICLES_ON_STREET) {
      if (other === vehicle || other.lane !== vehicle.lane) continue;
      const d = ahead(vehicle, other.x) - vehicle.w / 2 - other.w / 2;
      if (d >= -4) gap = Math.min(gap, Math.max(0, d));
    }
    const wanted = vehicle.cruise * Math.min(1, Math.max(0, (gap - KEEP_CLEAR) / BRAKING));
    // Brake firmly, pull away gently.
    vehicle.speed +=
      (wanted - vehicle.speed) * Math.min(1, dt * (wanted < vehicle.speed ? 8 : 1.5));
    const move = Math.min(vehicle.speed * dt, Math.max(0, gap - KEEP_CLEAR));
    vehicle.x += move * vehicle.direction;
    // Past the far end: come round again at the start, unless the start of the lane is still taken.
    const beyond = vehicle.direction > 0 ? vehicle.x > WORLD.width + MARGIN : vehicle.x < -MARGIN;
    if (beyond) {
      const start = vehicle.direction > 0 ? -MARGIN : WORLD.width + MARGIN;
      const taken = VEHICLES_ON_STREET.some(
        (other) =>
          other !== vehicle &&
          other.lane === vehicle.lane &&
          Math.abs(other.x - start) < (other.w + vehicle.w) / 2 + KEEP_CLEAR * 4,
      );
      if (!taken) vehicle.x = start;
    }
  }
}

/** Whether a vehicle covers the given tile, so nobody can walk into it. */
export function vehicleOnTile(tx: number, ty: number) {
  const left = tx * TILE,
    right = left + TILE,
    top = ty * TILE,
    bottom = top + TILE;
  return VEHICLES_ON_STREET.some(
    (vehicle) =>
      vehicle.x + vehicle.w / 2 > left + 2 &&
      vehicle.x - vehicle.w / 2 < right - 2 &&
      vehicle.bottom > top &&
      vehicle.top < bottom,
  );
}
