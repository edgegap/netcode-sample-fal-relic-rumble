// Relic Rumble page. Solo: this page runs rules.js itself, against bots. Online: an Edgegap server
// runs the same rules.js, this page sends inputs and draws the snapshots it gets back.
import { createWorld, addPlayer, setInput, step, botInput, WIN_SCORE } from "./rules.js";
import { LOCAL_PORT, autoplay, cancelMatchmaking, directServer, findMatch, joinServer, loadConfig } from "./online.js";
import { SEAT_COLORS, createSound, createView } from "./render.js";

const $ = (id) => document.getElementById(id);
const ui = { menu: $("menu"), name: $("name"), find: $("find"), solo: $("solo"), local: $("local"), cancel: $("cancel"),
  status: $("status"), leave: $("leave"), again: $("again"), banner: $("banner"), big: $("big"), sub: $("sub"),
  scores: $("scores"), shove: $("shove"), stick: $("stick"), knob: $("knob") };
const canvas = $("game");
const view3d = createView(canvas, $("labels"));
const sound = createSound();
view3d.loadAssets();

const FIXED_DT = 1 / 60;
let mode = "menu"; // "menu" | "solo" | "online"
let world = null; // solo world
let online = null; // { session, state, pos: Map, myId }
let accumulator = 0;
let previousTime = 0;
let pendingEvents = [];

try { ui.name.value = localStorage.getItem("relic-rumble-name") || ""; } catch {}
if (!ui.name.value) ui.name.value = `Raider${Math.floor(Math.random() * 900 + 100)}`;
const playerName = () => {
  const n = ui.name.value.trim().slice(0, 16) || "Raider";
  try { localStorage.setItem("relic-rumble-name", n); } catch {}
  return n;
};
if (["localhost", "127.0.0.1"].includes(location.hostname)) ui.local.hidden = false;

// ---- input: keyboard, or a touch stick and a Shove button -----------------------------------------

const keys = new Set();
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "Space"]);
let stick = { x: 0, z: 0 };
let shoveQueued = false; // a tap is kept until it has been sent or simulated once

function humanInput() {
  let mx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  let mz = (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
  if (!mx && !mz) ({ x: mx, z: mz } = stick);
  return { mx: Math.round(mx * 100) / 100, mz: Math.round(mz * 100) / 100, shove: shoveQueued || keys.has("Space") };
}

addEventListener("keydown", (e) => {
  if (e.target === ui.name) return;
  if (MOVE_KEYS.has(e.code)) {
    e.preventDefault();
    keys.add(e.code);
    if (e.code === "Space") shoveQueued = true;
  }
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

ui.shove.addEventListener("pointerdown", (e) => (e.preventDefault(), (shoveQueued = true)));
let stickPointer = null;
const moveStick = (e) => {
  const r = ui.stick.getBoundingClientRect();
  let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let z = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const len = Math.hypot(x, z);
  if (len > 1) (x /= len), (z /= len);
  stick = { x, z };
  ui.knob.style.transform = `translate(${x * 34}px, ${z * 34}px)`;
};
ui.stick.addEventListener("pointerdown", (e) => ((stickPointer = e.pointerId), ui.stick.setPointerCapture(e.pointerId), moveStick(e)));
ui.stick.addEventListener("pointermove", (e) => e.pointerId === stickPointer && moveStick(e));
for (const type of ["pointerup", "pointercancel"]) {
  ui.stick.addEventListener(type, () => ((stickPointer = null), (stick = { x: 0, z: 0 }), (ui.knob.style.transform = "")));
}

// ---- solo -----------------------------------------------------------------------------------------

function startSolo() {
  sound.unlock();
  world = createWorld();
  addPlayer(world, "human", playerName(), false);
  for (const n of [1, 2, 3]) addPlayer(world, `bot${n}`, `Bot ${n}`, true);
  accumulator = 0;
  mode = "solo";
  ui.menu.hidden = true;
  ui.leave.hidden = false;
  ui.again.hidden = true;
}

function updateSolo(dt) {
  setInput(world, "human", humanInput());
  shoveQueued = false;
  for (const p of Object.values(world.players)) if (p.isBot) setInput(world, p.id, botInput(world, p.id));
  const events = step(world, dt);
  pendingEvents.push(...events);
  if (events.some((e) => e.type === "win")) ui.again.hidden = false;
}

function soloView() {
  const players = Object.values(world.players).map((p) => ({
    id: p.id, name: p.name, score: p.score, seat: p.seat, x: p.x, z: p.z, face: p.face,
    stun: p.stun > 0, shove: p.shoveT > 0, me: p.id === "human",
  }));
  const w = world.winner != null && world.players[world.winner];
  return { players, relics: world.relics, big: w ? `${w.name} wins!` : "", sub: "", banner: w ? "" : `First to ${WIN_SCORE} relics` };
}

// ---- online (Edgegap) -----------------------------------------------------------------------------

async function play(url, ticket) {
  ui.status.textContent = "Connecting to the match server...";
  online = { state: null, pos: new Map(), myId: null, session: null };
  const session = await joinServer(url, playerName(), ticket, {
    onState: (msg) => {
      if (!online) return;
      online.state = msg;
      pendingEvents.push(...(msg.s?.ev ?? []));
    },
    onClose: () => online && backToMenu(online.state?.phase === "over" ? "Match finished. Find another?" : "Disconnected from the match server."),
    onStatus: (t) => (ui.status.textContent = t),
  });
  online.session = session;
  online.myId = session.myId;
  mode = "online";
  ui.menu.hidden = true;
  ui.leave.hidden = false;
  ui.again.hidden = true;
}

async function onFindMatch() {
  sound.unlock();
  setBusy(true);
  try {
    const config = await loadConfig();
    if (!config.matchmakerUrl || !config.matchmakerToken) throw new Error("No matchmaker configured (client/config.js).");
    const { url, ticketId } = await findMatch(config, (t) => (ui.status.textContent = t));
    await play(url, ticketId);
  } catch (err) {
    ui.status.textContent = err?.message === "cancelled" || err?.event?.status === "CANCELLED" ? "Search cancelled." : `Could not find a match: ${err?.message ?? err}`;
  } finally {
    setBusy(false);
  }
}

async function onDirect(url) {
  sound.unlock();
  setBusy(true);
  try {
    await play(url, undefined);
  } catch (err) {
    ui.status.textContent = `Could not join: ${err?.message ?? err}`;
  } finally {
    setBusy(false);
  }
}

function setBusy(busy) {
  ui.find.disabled = ui.solo.disabled = ui.local.disabled = busy;
  ui.cancel.hidden = !busy;
}

function sendOnlineInput() {
  if (online?.state?.phase !== "playing") return;
  if (online.session.sendInput(humanInput())) shoveQueued = false;
}

// Ease every character toward the latest server position: no rules here, only smoothing.
function onlineView(dt) {
  const st = online.state;
  if (!st) return { players: [], relics: [], big: "", sub: "", banner: "Waiting for the server..." };
  const info = new Map(st.players.map((p) => [p.id, p]));
  const k = 1 - Math.exp(-16 * dt);
  const players = st.s.p.map((s) => {
    let v = online.pos.get(s.id);
    if (!v) online.pos.set(s.id, (v = { x: s.x, z: s.z }));
    if (Math.hypot(s.x - v.x, s.z - v.z) > 8) Object.assign(v, { x: s.x, z: s.z });
    v.x += (s.x - v.x) * k;
    v.z += (s.z - v.z) * k;
    const p = info.get(s.id) ?? { name: "?", score: 0 };
    return { id: s.id, name: p.name, score: p.score, seat: s.seat, x: v.x, z: v.z, face: s.f, stun: s.st, shove: s.sv, me: s.id === online.myId };
  });
  const relics = st.s.r.map(([id, x, z, holder]) => {
    const h = holder != null && online.pos.get(holder);
    return { id, x: h ? h.x : x, z: h ? h.z : z, holder };
  });
  const t = st.timer;
  let banner = "", big = "", sub = "";
  if (st.phase === "waiting") banner = st.waitingFor > 0 ? `Waiting for ${st.waitingFor} more player(s)...` : "Waiting for players...";
  else if (st.phase === "countdown") big = t > 0 ? String(t) : "GO!";
  else if (st.phase === "playing") banner = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")} · first to ${WIN_SCORE} relics`;
  else if (st.phase === "over") { big = st.result?.winner ?? "Match over"; sub = t != null ? `Server closes in ${t}s` : ""; }
  return { players, relics, big, sub, banner };
}

function backToMenu(message = "") {
  const s = online?.session;
  online = null;
  world = null;
  mode = "menu";
  s?.close();
  ui.menu.hidden = false;
  ui.leave.hidden = true;
  ui.again.hidden = true;
  ui.status.textContent = message;
}

// ---- frame ----------------------------------------------------------------------------------------

function drawHud(view) {
  ui.banner.textContent = view?.banner ?? "";
  ui.big.textContent = view?.big ?? "";
  ui.sub.textContent = view?.sub ?? "";
  const rows = [...(view?.players ?? [])].sort((a, b) => a.seat - b.seat);
  const html = rows.map((p) => `<li class="${p.me ? "me" : ""}"><i style="background:${SEAT_COLORS[p.seat]}"></i><span></span><b>${p.score}</b></li>`).join("");
  if (ui.scores.dataset.html !== html) {
    ui.scores.innerHTML = ui.scores.dataset.html = html;
    [...ui.scores.querySelectorAll("span")].forEach((el, i) => (el.textContent = rows[i].name));
  }
}

function frame(timestamp) {
  if (!previousTime) previousTime = timestamp;
  const elapsed = Math.min((timestamp - previousTime) / 1000, 0.1);
  previousTime = timestamp;

  let view = null;
  if (mode === "solo") {
    accumulator += elapsed;
    while (accumulator >= FIXED_DT) {
      if (world.winner == null) updateSolo(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    view = soloView();
  } else if (mode === "online") {
    sendOnlineInput();
    view = onlineView(elapsed);
  }
  for (const e of pendingEvents.splice(0)) sound.play(e.type);
  drawHud(view);
  view3d.render(view, elapsed);
  requestAnimationFrame(frame);
}

ui.solo.onclick = startSolo;
ui.again.onclick = startSolo;
ui.find.onclick = onFindMatch;
ui.local.onclick = () => onDirect(`ws://${location.hostname}:${LOCAL_PORT}`);
ui.cancel.onclick = () => { cancelMatchmaking(); ui.status.textContent = "Cancelling..."; };
ui.leave.onclick = () => backToMenu();

requestAnimationFrame(frame);
if (directServer) onDirect(directServer);
else if (autoplay === "1") onFindMatch();
else if (autoplay === "local") onDirect(`ws://${location.hostname}:${LOCAL_PORT}`);
else if (autoplay === "solo") startSolo();
