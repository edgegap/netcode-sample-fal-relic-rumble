// Three.js view of Relic Rumble. It draws a plain "view" object ({players, relics, events}) that
// main.js builds either from the solo world or from the server's snapshots, so there is one draw
// path for both. Nothing here decides anything: the rules are in rules.js.
//
// Every model, texture and sound is optional (assets.js). Without them the game is a graybox.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import ASSETS from "./assets.js";
import { ARENA, HOMES, HOME_RADIUS, OBSTACLES, PLAYER_RADIUS, SHOVE_RANGE } from "./rules.js";

export const SEAT_COLORS = ["#4cc9f0", "#f72585", "#ffd166", "#80ed99"];

export function createView(canvas, labels) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#141a2a");
  scene.fog = new THREE.Fog("#141a2a", 55, 95);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight("#dfe9ff", "#3a2f4a", 1.1));
  const sun = new THREE.DirectionalLight("#fff1d6", 2.2);
  sun.position.set(-14, 28, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 });
  scene.add(sun);

  // ---- arena (graybox; fal assets replace parts of it in loadAssets) ---------------------------
  const floorMat = new THREE.MeshStandardMaterial({ color: "#5d6b82", roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(ARENA * 2, 16, "#8493ad", "#6d7b93");
  grid.position.y = 0.01;
  scene.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: "#39445a", roughness: 0.9 });
  for (const [x, z, w, d] of [[0, -ARENA - 0.5, ARENA * 2 + 2, 1], [0, ARENA + 0.5, ARENA * 2 + 2, 1], [-ARENA - 0.5, 0, 1, ARENA * 2], [ARENA + 0.5, 0, 1, ARENA * 2]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), wallMat);
    wall.position.set(x, 0.6, z);
    wall.castShadow = wall.receiveShadow = true;
    scene.add(wall);
  }

  const pillars = OBSTACLES.map((o) => {
    const holder = new THREE.Group();
    holder.position.set(o.x, 0, o.z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(o.w, 3, o.d), new THREE.MeshStandardMaterial({ color: "#8c7b6b", roughness: 0.8 }));
    box.position.y = 1.5;
    box.castShadow = box.receiveShadow = true;
    holder.add(box);
    scene.add(holder);
    return { holder, o };
  });

  const relicGeo = new THREE.IcosahedronGeometry(0.42, 0);
  const relicMat = new THREE.MeshStandardMaterial({ color: "#ffcf40", emissive: "#a86a00", emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 });
  let relicModel = null; // fal GLB, when loaded

  const homes = HOMES.map((h, seat) => {
    const color = new THREE.Color(SEAT_COLORS[seat]);
    const holder = new THREE.Group();
    holder.position.set(h.x, 0, h.z);
    const zone = new THREE.Mesh(new THREE.CircleGeometry(HOME_RADIUS, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22 }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.02;
    const rim = new THREE.Mesh(new THREE.RingGeometry(HOME_RADIUS - 0.12, HOME_RADIUS, 48), new THREE.MeshBasicMaterial({ color }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.03;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.7, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    stand.position.y = 0.35;
    stand.castShadow = stand.receiveShadow = true;
    holder.add(zone, rim, stand);
    scene.add(holder);
    return { holder, stand, trophies: [], standTop: 0.7 };
  });

  // ---- characters and relics ------------------------------------------------------------------
  const characterModels = []; // per seat: { scene, clips } once loaded
  const actors = new Map(); // player id -> actor
  const relics = new Map(); // relic id -> mesh

  function grayboxBody(seat) {
    const body = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: SEAT_COLORS[seat], roughness: 0.55 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(PLAYER_RADIUS * 0.8, 0.7, 6, 14), mat);
    torso.position.y = 0.95;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: "#1b2030" }));
    nose.position.set(0, 1.25, PLAYER_RADIUS * 0.8);
    body.add(torso, nose);
    body.traverse((m) => (m.castShadow = true));
    return { body, mixer: null, actions: {} };
  }

  function modelBody(seat) {
    const src = characterModels[seat];
    const body = SkeletonUtils.clone(src.scene);
    body.traverse((m) => m.isMesh && ((m.castShadow = true), (m.frustumCulled = false)));
    const mixer = src.clips.length ? new THREE.AnimationMixer(body) : null;
    const actions = {};
    for (const clip of src.clips) {
      const key = /run|sprint/i.test(clip.name) ? "run" : /walk/i.test(clip.name) ? "walk" : /idle|stand|breath/i.test(clip.name) ? "idle" : null;
      if (key && !actions[key]) actions[key] = mixer.clipAction(clip);
    }
    if (mixer && !Object.keys(actions).length) actions.walk = mixer.clipAction(src.clips[0]);
    return { body, mixer, actions };
  }

  function makeActor(p) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(PLAYER_RADIUS + 0.12, PLAYER_RADIUS + 0.3, 32), new THREE.MeshBasicMaterial({ color: SEAT_COLORS[p.seat] }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    const swipe = new THREE.Mesh(
      new THREE.RingGeometry(1.0, SHOVE_RANGE, 24, 1, -Math.PI / 2 - 1.2, 2.4),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    swipe.rotation.x = -Math.PI / 2; // the arc opens toward local +z, the facing direction
    swipe.position.y = 0.08;
    const turn = new THREE.Group(); // rotated to the facing angle
    turn.add(swipe);
    group.add(ring, turn);
    scene.add(group);
    const label = document.createElement("div");
    label.className = "label";
    labels.append(label);
    const actor = { group, turn, ring, swipe, label, seat: p.seat, face: p.face, x: p.x, z: p.z, current: null, parts: null, isModel: false };
    setBody(actor);
    return actor;
  }

  function setBody(actor) {
    if (actor.parts) actor.turn.remove(actor.parts.body);
    actor.isModel = !!characterModels[actor.seat];
    actor.parts = actor.isModel ? modelBody(actor.seat) : grayboxBody(actor.seat);
    actor.turn.add(actor.parts.body);
    actor.current = null;
  }

  function play(actor, name) {
    const { actions } = actor.parts;
    const next = actions[name] ?? actions.walk ?? actions.idle;
    if (!next || actor.current === next) return;
    next.reset().fadeIn(0.15).play();
    actor.current?.fadeOut(0.15);
    actor.current = next;
  }

  function makeRelic() {
    const mesh = relicModel ? relicModel.clone() : new THREE.Mesh(relicGeo, relicMat);
    mesh.traverse((m) => (m.castShadow = true));
    scene.add(mesh);
    return mesh;
  }

  // ---- fal assets -----------------------------------------------------------------------------
  const gltf = new GLTFLoader();
  const loadModel = (url) => (url ? gltf.loadAsync(url).catch((e) => (console.warn(`asset ${url}: ${e.message}`), null)) : Promise.resolve(null));

  /** Scale a model to a size and put its base on the floor, centred. */
  function fit(model, { height, width }) {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const s = height ? height / size.y : width / Math.max(size.x, size.z);
    model.scale.multiplyScalar(s);
    box.setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= box.min.y;
    const holder = new THREE.Group();
    holder.add(model);
    return holder;
  }

  async function loadAssets() {
    const tex = new THREE.TextureLoader();
    if (ASSETS.floor) {
      tex.load(ASSETS.floor, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(4, 4);
        t.colorSpace = THREE.SRGBColorSpace;
        floorMat.map = t;
        floorMat.color.set("#ffffff");
        floorMat.needsUpdate = true;
        grid.visible = false;
      });
    }
    if (ASSETS.backdrop) tex.load(ASSETS.backdrop, (t) => ((t.colorSpace = THREE.SRGBColorSpace), (scene.background = t), (scene.fog = null)));

    const jobs = [];
    (ASSETS.characters ?? []).forEach((url, seat) => {
      jobs.push(loadModel(url).then((g) => {
        if (!g) return;
        characterModels[seat] = { scene: fit(g.scene, { height: ASSETS.characterHeight ?? 1.9 }), clips: g.animations ?? [] };
        for (const a of actors.values()) if (a.seat === seat) setBody(a);
      }));
    });
    jobs.push(loadModel(ASSETS.relic).then((g) => {
      if (!g) return;
      relicModel = fit(g.scene, { height: 0.9 });
      relicModel.children[0].position.y -= 0.45; // spin around its middle
      for (const [id, mesh] of relics) (scene.remove(mesh), relics.delete(id));
      for (const h of homes) (h.trophies.forEach((t) => h.holder.remove(t)), (h.trophies = []));
    }));
    jobs.push(loadModel(ASSETS.pillar).then((g) => {
      if (!g) return;
      for (const { holder, o } of pillars) {
        holder.clear();
        const m = fit(g.scene.clone(), { width: Math.max(o.w, o.d) });
        m.traverse((x) => x.isMesh && (x.castShadow = x.receiveShadow = true));
        holder.add(m);
      }
    }));
    jobs.push(loadModel(ASSETS.pedestal).then((g) => {
      if (!g) return;
      for (const h of homes) {
        h.holder.remove(h.stand);
        const m = fit(g.scene.clone(), { width: 1.9 });
        m.traverse((x) => x.isMesh && (x.castShadow = x.receiveShadow = true));
        h.holder.add(m);
        h.stand = m;
        h.standTop = new THREE.Box3().setFromObject(m).max.y;
      }
    }));
    await Promise.all(jobs);
  }

  // ---- per frame ------------------------------------------------------------------------------
  const v = new THREE.Vector3();
  let clock = 0;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Pull back on narrow screens so the whole floor stays in view.
      const fit = Math.max(1, 1.25 / camera.aspect);
      camera.position.set(0, 34 * fit, 25 * fit);
      camera.lookAt(0, 0, 1.5);
      camera.updateProjectionMatrix();
    }
  }

  function render(view, dt) {
    resize();
    clock += dt;
    const seen = new Set();
    const scores = [0, 0, 0, 0];

    for (const p of view?.players ?? []) {
      seen.add(p.id);
      let a = actors.get(p.id);
      if (!a) actors.set(p.id, (a = makeActor(p)));
      if (a.seat !== p.seat) {
        a.seat = p.seat;
        a.ring.material.color.set(SEAT_COLORS[p.seat]);
        setBody(a);
      }
      const moved = Math.hypot(p.x - a.x, p.z - a.z) / Math.max(dt, 1e-3);
      a.x = p.x;
      a.z = p.z;
      let turn = p.face - a.face;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      a.face += turn * Math.min(1, dt * 14);
      a.group.position.set(p.x, 0, p.z);
      a.turn.rotation.y = a.face;
      a.ring.scale.setScalar(p.me ? 1 + Math.sin(clock * 5) * 0.06 : 0.8);
      a.ring.material.opacity = p.me ? 1 : 0.5;
      a.ring.material.transparent = !p.me;
      a.swipe.material.opacity = p.shove ? 0.55 : Math.max(0, a.swipe.material.opacity - dt * 3);
      const body = a.parts.body;
      body.rotation.z = p.stun ? Math.sin(clock * 30) * 0.25 : 0;
      body.position.z = p.shove ? 0.35 : 0;
      if (a.parts.mixer) {
        play(a, p.stun ? "idle" : moved > 4.5 ? "run" : moved > 0.6 ? "walk" : "idle");
        if (a.current) a.current.timeScale = a.current === a.parts.actions.idle ? 1 : THREE.MathUtils.clamp(moved / 5, 0.5, 1.6);
        a.parts.mixer.update(dt);
      } else if (!a.isModel) {
        body.position.y = moved > 0.6 ? Math.abs(Math.sin(clock * 12)) * 0.12 : 0;
      }
      scores[p.seat] = p.score;

      v.set(p.x, 2.7, p.z).project(camera);
      a.label.textContent = p.name;
      a.label.classList.toggle("me", !!p.me);
      a.label.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * canvas.clientWidth}px, ${((1 - v.y) / 2) * canvas.clientHeight}px)`;
    }
    for (const [id, a] of actors) {
      if (seen.has(id)) continue;
      scene.remove(a.group);
      a.label.remove();
      actors.delete(id);
    }

    const seenRelics = new Set();
    for (const r of view?.relics ?? []) {
      seenRelics.add(r.id);
      let mesh = relics.get(r.id);
      if (!mesh) relics.set(r.id, (mesh = makeRelic()));
      const held = r.holder != null;
      mesh.position.set(r.x, held ? 2.5 : 0.75 + Math.sin(clock * 3 + r.id) * 0.12, r.z);
      mesh.rotation.y = clock * 1.6 + r.id;
    }
    for (const [id, mesh] of relics) if (!seenRelics.has(id)) (scene.remove(mesh), relics.delete(id));

    // Banked relics sit on their owner's pedestal.
    homes.forEach((h, seat) => {
      const want = view ? scores[seat] : 0;
      while (h.trophies.length > want) h.holder.remove(h.trophies.pop());
      while (h.trophies.length < want) {
        const t = relicModel ? relicModel.clone() : new THREE.Mesh(relicGeo, relicMat);
        const i = h.trophies.length;
        t.scale.setScalar(0.5);
        t.position.set(Math.cos(i * 1.257) * 0.42, h.standTop + 0.3, Math.sin(i * 1.257) * 0.42);
        h.holder.add(t);
        h.trophies.push(t);
      }
    });

    renderer.render(scene, camera);
  }

  return { render, loadAssets };
}

// ---- sound: fal clips when present, a small synth beep otherwise --------------------------------
export function createSound() {
  let ctx = null;
  const buffers = {};
  let musicEl = null;
  const BEEPS = { pickup: [660, 0.08], score: [880, 0.22], shove: [180, 0.1], hit: [120, 0.16], win: [1040, 0.5] };

  async function unlock() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (const [name, url] of Object.entries(ASSETS.sounds ?? {})) {
      if (!url) continue;
      fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((b) => (buffers[name] = b)).catch(() => {});
    }
    if (ASSETS.music) {
      musicEl = new Audio(ASSETS.music);
      musicEl.loop = true;
      musicEl.volume = 0.25;
      musicEl.play().catch(() => {});
    }
  }

  function play(name) {
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    if (buffers[name]) {
      const src = ctx.createBufferSource();
      src.buffer = buffers[name];
      gain.gain.value = 0.6;
      src.connect(gain);
      src.start();
    } else if (BEEPS[name]) {
      const [freq, len] = BEEPS[name];
      const osc = ctx.createOscillator();
      osc.type = name === "hit" || name === "shove" ? "sawtooth" : "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + len);
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + len);
    }
  }
  return { unlock, play };
}
