// The fal.ai assets the page loads. Every entry is optional: with a missing or empty entry the
// renderer draws a plain shape instead (the "graybox"), so the game plays before any asset exists
// and keeps playing if a file fails to load. The server never reads this file.
//
// Paths are relative to client/. How each file was generated is in PROMPTS.md.
export default {
  // One entry per seat (0..3): a GLB path, or { model, walk, run } when the clips are separate
  // armature-only GLBs. Clips named like "idle", "walk" or "run" are played by speed; a model
  // without clips just slides.
  characters: [
    { model: "assets/raider-blue.glb", walk: "assets/raider-blue-walk.glb", run: "assets/raider-blue-run.glb" },
    { model: "assets/raider-pink.glb", walk: "assets/raider-pink-walk.glb", run: "assets/raider-pink-run.glb" },
    { model: "assets/raider-yellow.glb", walk: "assets/raider-yellow-walk.glb", run: "assets/raider-yellow-run.glb" },
    { model: "assets/raider-green.glb", walk: "assets/raider-green-walk.glb", run: "assets/raider-green-run.glb" },
  ],
  // Height in world units each character is scaled to (its feet are put on the floor).
  characterHeight: 2.5,
  relic: "assets/relic.glb",
  pillar: "assets/pillar.glb", // scaled to fit the 2.2 x 2.2 collision box
  pedestal: "assets/pedestal.glb",
  floor: "assets/floor.jpg", // image, tiled 2 x 2
  backdrop: "", // image, shown behind the arena
  // Sounds (mp3 or wav), played on the matching rules event.
  sounds: {
    pickup: "assets/sfx/pickup.mp3", score: "assets/sfx/score.mp3", shove: "assets/sfx/shove.mp3",
    hit: "assets/sfx/hit.mp3", win: "assets/sfx/win.mp3",
  },
  music: "",
};
