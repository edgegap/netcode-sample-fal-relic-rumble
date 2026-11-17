// Relic Rumble on the server. The rules are client/rules.js, the same file the browser runs for
// solo play; here the server owns the world and players only send inputs. The server never loads a
// 3D model, texture or sound: those are fal.ai assets for the page only.
// Implements the room.js game contract from the edgegap-threejs skill (assets/server/game.js).

import * as R from "../client/rules.js";
import { axisIn, ffaResult } from "./util.js";

const r2 = (v) => Math.round(v * 100) / 100;

export function createGame() {
  let world = R.createWorld();
  let events = []; // what happened since the last snapshot, for client sounds and effects

  return {
    name: "relic-rumble",
    // Bots fill every empty seat, so 1 to 4 humans always play a 4-character match.
    config: { tickHz: 60, sendHz: 20, maxPlayers: 4, botFill: 4, matchSeconds: 240 },
    info: () => ({ scoreToWin: R.WIN_SCORE }),

    addPlayer(p) {
      R.addPlayer(world, p.id, p.name, p.bot);
    },
    removePlayer(p) {
      R.removePlayer(world, p.id);
    },
    // Never trust the wire: clamped numbers and booleans only.
    input(p, msg) {
      R.setInput(world, p.id, { mx: axisIn(msg.mx), mz: axisIn(msg.mz), shove: msg.shove === true });
    },
    // A fresh world for each match, with the room's current players in it.
    start(room) {
      world = R.createWorld();
      for (const p of room.players.values()) R.addPlayer(world, p.id, p.name, p.bot);
      events = [];
    },
    reset() {
      world = R.createWorld();
    },

    update(dt, room) {
      for (const p of Object.values(world.players)) if (p.isBot) R.setInput(world, p.id, R.botInput(world, p.id));
      for (const e of R.step(world, dt)) {
        if (e.type === "score") {
          const scorer = room.players.get(e.player);
          if (scorer) scorer.score = e.score;
        }
        events.push(e);
      }
    },

    result(room) {
      return world.winner != null ? ffaResult(room) : null;
    },
    timeUp: (room) => ffaResult(room),

    snapshot() {
      const s = {
        p: Object.values(world.players).map((p) => ({
          id: p.id, seat: p.seat, x: r2(p.x), z: r2(p.z), f: r2(p.face),
          c: p.carry, st: p.stun > 0, sv: p.shoveT > 0, cd: r2(p.cooldown),
        })),
        r: world.relics.map((r) => [r.id, r2(r.x), r2(r.z), r.holder]),
        ev: events,
      };
      events = [];
      return s;
    },
  };
}
