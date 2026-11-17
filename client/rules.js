// Relic Rumble rules. The browser (solo play) and the Edgegap server (online play) both import
// this file, so the rules can't drift apart. No DOM, canvas, WebGL, audio, assets or timers here:
// characters are circles and pillars are boxes, whatever the 3D models look like.
//
// The floor is the x/z plane, centred on 0,0. Angles are radians around y (0 faces +z).

export const ARENA = 16; // half-size of the square floor
export const WIN_SCORE = 5;
export const PLAYER_RADIUS = 0.7;
export const HOME_RADIUS = 2.4;
export const SHOVE_RANGE = 2.6;
export const SHOVE_COOLDOWN = 1.2;
export const RELIC_COUNT = 3;

const ACCEL = 42;
const FRICTION = 6; // terminal speed = ACCEL / FRICTION = 7 units/s
const CARRY_ACCEL = 0.82; // carriers are a bit slower, so they can be caught
const SHOVE_ARC = 0.35; // cos of the half-angle in front of the shover (about 70 degrees)
const KNOCKBACK = 15;
const STUN = 0.9;
const SAFE = 0.7; // can't be shoved again right after a stun
const PICKUP_RANGE = 1.2;
const DROP_LOCK = 0.5; // a dropped relic can't be picked up for this long

/** Home pedestal of each seat (0..3), one per corner. */
export const HOMES = [
  { x: -12, z: -12 },
  { x: 12, z: 12 },
  { x: 12, z: -12 },
  { x: -12, z: 12 },
];

/** Pillars: axis-aligned boxes {x, z, w, d} (centre and size). */
export const OBSTACLES = [
  { x: -6, z: 0, w: 2.2, d: 2.2 },
  { x: 6, z: 0, w: 2.2, d: 2.2 },
  { x: 0, z: -6, w: 2.2, d: 2.2 },
  { x: 0, z: 6, w: 2.2, d: 2.2 },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const emptyInput = () => ({ mx: 0, mz: 0, shove: false });

function pushOutOfBox(c, r, b) {
  const nx = clamp(c.x, b.x - b.w / 2, b.x + b.w / 2);
  const nz = clamp(c.z, b.z - b.d / 2, b.z + b.d / 2);
  const dx = c.x - nx;
  const dz = c.z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    c.x = nx + (dx / d) * r;
    c.z = nz + (dz / d) * r;
  } else {
    const ex = b.w / 2 + r - Math.abs(c.x - b.x);
    const ez = b.d / 2 + r - Math.abs(c.z - b.z);
    if (ex < ez) c.x += Math.sign(c.x - b.x || 1) * ex;
    else c.z += Math.sign(c.z - b.z || 1) * ez;
  }
}

function placeRelic(world, relic) {
  // Somewhere in the middle of the floor, away from pillars and from the other relics.
  for (let tries = 0; tries < 40; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 1 + Math.random() * 7.5;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const inPillar = OBSTACLES.some((o) => Math.abs(x - o.x) < o.w / 2 + 1 && Math.abs(z - o.z) < o.d / 2 + 1);
    const crowded = world.relics.some((r) => r !== relic && r.holder == null && Math.hypot(r.x - x, r.z - z) < 3);
    if (inPillar || crowded) continue;
    relic.x = x;
    relic.z = z;
    break;
  }
  relic.holder = null;
  relic.lock = 0;
}

export function createWorld() {
  const world = { players: {}, inputs: {}, relics: [], winner: null, time: 0 };
  for (let i = 1; i <= RELIC_COUNT; i++) {
    const relic = { id: i, x: 0, z: 0, holder: null, lock: 0 };
    world.relics.push(relic);
    placeRelic(world, relic);
  }
  return world;
}

export function addPlayer(world, id, name, isBot) {
  const taken = new Set(Object.values(world.players).map((p) => p.seat));
  let seat = 0;
  while (taken.has(seat)) seat++;
  seat %= HOMES.length;
  const home = HOMES[seat];
  const player = {
    id, name, isBot: Boolean(isBot), seat,
    x: home.x * 0.8, z: home.z * 0.8, vx: 0, vz: 0,
    face: Math.atan2(-home.x, -home.z), // look at the middle
    carry: null, score: 0, stun: 0, safe: 0, cooldown: 0, shoveT: 0,
  };
  world.players[id] = player;
  world.inputs[id] = emptyInput();
  return player;
}

function drop(world, player) {
  const relic = world.relics.find((r) => r.id === player.carry);
  player.carry = null;
  if (!relic) return;
  relic.holder = null;
  relic.x = clamp(player.x, -ARENA + 1, ARENA - 1);
  relic.z = clamp(player.z, -ARENA + 1, ARENA - 1);
  relic.lock = DROP_LOCK;
}

export function removePlayer(world, id) {
  const player = world.players[id];
  if (!player) return;
  if (player.carry != null) drop(world, player);
  delete world.players[id];
  delete world.inputs[id];
}

/** input: { mx, mz } in -1..1 (x to the right, z toward the camera) and { shove } true/false. */
export function setInput(world, id, input) {
  if (!world.players[id]) return;
  const mx = Number.isFinite(input?.mx) ? clamp(input.mx, -1, 1) : 0;
  const mz = Number.isFinite(input?.mz) ? clamp(input.mz, -1, 1) : 0;
  world.inputs[id] = { mx, mz, shove: Boolean(input?.shove) };
}

/**
 * Bot brain. Reads positions only (players' x, z, seat, carry and relics' x, z, holder), so the
 * headless test players can call it on a server snapshot.
 */
export function botInput(world, id) {
  const me = world.players[id];
  if (!me) return emptyInput();
  const others = Object.values(world.players).filter((p) => p.id !== id);
  const dist = (o) => Math.hypot(o.x - me.x, o.z - me.z);
  let target;
  let shove = false;

  if (me.carry != null) {
    target = HOMES[me.seat];
  } else {
    const thief = others.filter((p) => p.carry != null).sort((a, b) => dist(a) - dist(b))[0];
    const free = world.relics.filter((r) => r.holder == null).sort((a, b) => dist(a) - dist(b))[0];
    if (thief && (!free || dist(thief) < dist(free) * 0.7)) target = thief;
    else target = free ?? thief ?? { x: 0, z: 0 };
    const near = others.filter((p) => dist(p) < SHOVE_RANGE * 0.8).sort((a, b) => dist(a) - dist(b))[0];
    if (near && (near.carry != null || dist(near) < 1.7)) {
      target = near; // face them, then push
      shove = true;
    }
  }

  let dx = target.x - me.x;
  let dz = target.z - me.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  // Walk around a pillar that is in the way.
  for (const o of OBSTACLES) {
    const ox = o.x - me.x;
    const oz = o.z - me.z;
    const od = Math.hypot(ox, oz);
    if (od < 3.2 && od < d && (ox * dx + oz * dz) / od > 0.6) {
      const side = ox * dz - oz * dx > 0 ? 1 : -1;
      dx += (-oz / od) * side * 1.4;
      dz += (ox / od) * side * 1.4;
    }
  }
  const n = Math.hypot(dx, dz) || 1;
  return { mx: dx / n, mz: dz / n, shove };
}

/** Advance the world by dt seconds. Returns what happened, for scores, sounds and effects. */
export function step(world, dt) {
  const events = [];
  if (world.winner != null) return events;
  world.time += dt;
  const players = Object.values(world.players);

  for (const p of players) {
    p.stun = Math.max(0, p.stun - dt);
    p.safe = Math.max(0, p.safe - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.shoveT = Math.max(0, p.shoveT - dt);

    const input = p.stun > 0 ? emptyInput() : world.inputs[p.id] ?? emptyInput();
    let { mx, mz } = input;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const accel = ACCEL * (p.carry != null ? CARRY_ACCEL : 1);
    p.vx += mx * accel * dt;
    p.vz += mz * accel * dt;
    const keep = Math.exp(-FRICTION * dt);
    p.vx *= keep;
    p.vz *= keep;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    if (len > 0.15) p.face = Math.atan2(mx, mz);

    const limit = ARENA - PLAYER_RADIUS;
    if (Math.abs(p.x) > limit) {
      p.x = Math.sign(p.x) * limit;
      p.vx = 0;
    }
    if (Math.abs(p.z) > limit) {
      p.z = Math.sign(p.z) * limit;
      p.vz = 0;
    }
    for (const o of OBSTACLES) pushOutOfBox(p, PLAYER_RADIUS, o);

    // Shove: everyone in front, within reach, is knocked back, stunned and drops their relic.
    if (input.shove && p.cooldown <= 0 && p.carry == null) {
      p.cooldown = SHOVE_COOLDOWN;
      p.shoveT = 0.25;
      events.push({ type: "shove", player: p.id });
      const fx = Math.sin(p.face);
      const fz = Math.cos(p.face);
      for (const o of players) {
        if (o === p || o.safe > 0) continue;
        const dx = o.x - p.x;
        const dz = o.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > SHOVE_RANGE || (d > 0.01 && (dx * fx + dz * fz) / d < SHOVE_ARC)) continue;
        const nx = d > 0.01 ? dx / d : fx;
        const nz = d > 0.01 ? dz / d : fz;
        o.vx = nx * KNOCKBACK;
        o.vz = nz * KNOCKBACK;
        o.stun = STUN;
        o.safe = STUN + SAFE;
        const dropped = o.carry != null;
        if (dropped) drop(world, o);
        events.push({ type: "hit", player: p.id, victim: o.id, dropped });
      }
    }
  }

  // Players don't overlap.
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const overlap = PLAYER_RADIUS * 2 - d;
      if (overlap <= 0 || d < 1e-6) continue;
      const nx = dx / d;
      const nz = dz / d;
      a.x -= (nx * overlap) / 2;
      a.z -= (nz * overlap) / 2;
      b.x += (nx * overlap) / 2;
      b.z += (nz * overlap) / 2;
    }
  }

  for (const relic of world.relics) {
    relic.lock = Math.max(0, relic.lock - dt);
    if (relic.holder != null) {
      const holder = world.players[relic.holder];
      if (!holder) {
        relic.holder = null;
        continue;
      }
      relic.x = holder.x;
      relic.z = holder.z;
      const home = HOMES[holder.seat];
      if (Math.hypot(holder.x - home.x, holder.z - home.z) < HOME_RADIUS) {
        holder.carry = null;
        holder.score++;
        placeRelic(world, relic);
        events.push({ type: "score", player: holder.id, score: holder.score });
        if (holder.score >= WIN_SCORE) {
          world.winner = holder.id;
          events.push({ type: "win", player: holder.id });
          return events;
        }
      }
    } else if (relic.lock <= 0) {
      const taker = players
        .filter((p) => p.carry == null && p.stun <= 0 && Math.hypot(p.x - relic.x, p.z - relic.z) < PICKUP_RANGE)
        .sort((a, b) => Math.hypot(a.x - relic.x, a.z - relic.z) - Math.hypot(b.x - relic.x, b.z - relic.z))[0];
      if (taker) {
        relic.holder = taker.id;
        taker.carry = relic.id;
        events.push({ type: "pickup", player: taker.id });
      }
    }
  }
  return events;
}
