# How the fal.ai assets were made

Everything in `client/assets/` came from fal.ai on 2026-11-17, run by a coding agent (Claude Code) through fal's `genmedia` CLI. The same calls work through the fal MCP server (`run_model` / `submit_job`). The game code never calls fal: the assets are files the page loads.

| Asset | fal model | List price | Files |
|---|---|---|---|
| 4 character concepts, 3 prop concepts, floor texture | `fal-ai/nano-banana-2` | $0.08 per image | `art/concepts/*.png`, `client/assets/floor.jpg` |
| 4 rigged characters, 3 props | `meshy/v7.1/image-to-3d` | $0.80 per model | `client/assets/*.glb` |
| 5 sound effects | `elevenlabs/sound-effects/v3` | $0.002 per second | `client/assets/sfx/*.mp3` |

At list prices that is about $6.30 for the whole game (8 images, 7 models, about 6 seconds of sound). The scripts in `art/` hold the exact calls.

## Characters

Concept images (`art/gen-concepts.sh`). One shared style paragraph, then one line per character:

> Stylized chunky low-poly toy character for a 3D party game, full body from head to feet, standing in an A-pose with arms held slightly away from the body and legs apart, facing the camera, front view, clearly separated arms and legs, big head, short limbs, simple shapes, flat matte colors with soft shading, no weapons, no props in hands, no cape, plain white background, single character centered, no text. Character: ...

- a cheerful explorer in a sky-blue jacket and a wide-brim hat, tan trousers, brown boots, small backpack.
- a sneaky masked thief in a hot-pink hooded outfit with a dark belt and soft boots, mischievous eyes.
- a friendly round mining robot painted warm yellow with a headlamp, two arms, two legs, dark grey joints.
- a small goblin scout with mint-green skin, big pointed ears, a leather vest and shorts, bare feet.

The A-pose, the separated limbs and "nothing in the hands" are there for the next step: auto-rigging needs a clear humanoid.

Each image then went to Meshy:

```bash
genmedia run meshy/v7.1/image-to-3d --image_url "<concept url>" \
  --enable_rigging true --pose_mode "a-pose" --target_polycount 12000 --rigging_height_meters 1.7 --async --json
genmedia status meshy/v7.1/image-to-3d <request_id> --result --json
```

With `enable_rigging`, the result has `rigged_character_glb` (the skinned model, about 3.5 MB) and `basic_animations.walking_armature_glb` / `running_armature_glb` (the clips alone, about 85 KB each). `art/fetch.py` downloads them and `art/build.sh` shrinks the model's 2048 px texture to a 1024 px WebP (3.5 MB to about 1.3 MB).

## Props and floor

`art/gen-props.sh`: a relic (golden sun idol with a turquoise gem), a square stone pillar, a low round pedestal, each as an image and then `meshy/v7.1/image-to-3d` with `--target_polycount 4000` and no rigging. The floor is one image used as a tiled texture.

## Sounds

`art/gen-sfx.sh`: pickup, score, shove, hit and win, 0.5 to 3 seconds each, MP3.

## What the game does with them

- `client/assets.js` lists the files. Every entry is optional: without it the renderer draws a plain shape, which is how the game was built and tested before any asset existed.
- `client/render.js` scales each model to a height or width in world units and puts its base on the floor, so a model of any size fits.
- Collisions never use the models: `client/rules.js` treats characters as circles and pillars as boxes. That file is also what the Edgegap server runs, so the server image holds no asset at all.
