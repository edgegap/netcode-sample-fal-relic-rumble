// The fal.ai assets the page loads. Every entry is optional: with a missing or empty entry the
// renderer draws a plain shape instead (the "graybox"), so the game plays before any asset exists
// and keeps playing if a file fails to load. The server never reads this file.
//
// Paths are relative to client/. How each file was generated is in PROMPTS.md.
export default {
  // One GLB per seat (0..3). Clips named like "idle", "walk" or "run" are played by speed; a
  // model without clips just slides.
  characters: [],
  // Height in world units each character is scaled to (its feet are put on the floor).
  characterHeight: 1.9,
  relic: "", // GLB
  pillar: "", // GLB, scaled to fit the 2.2 x 2.2 collision box
  pedestal: "", // GLB
  floor: "", // image, tiled 4 x 4
  backdrop: "", // image, shown behind the arena
  // Sounds (mp3 or wav), played on the matching rules event.
  sounds: { pickup: "", score: "", shove: "", hit: "", win: "" },
  music: "",
};
