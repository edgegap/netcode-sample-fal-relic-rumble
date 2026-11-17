#!/usr/bin/env bash
# Character concept images (fal-ai/nano-banana-2). Run from the repo root: bash art/gen-concepts.sh
STYLE="Stylized chunky low-poly toy character for a 3D party game, full body from head to feet, standing in an A-pose with arms held slightly away from the body and legs apart, facing the camera, front view, clearly separated arms and legs, big head, short limbs, simple shapes, flat matte colors with soft shading, no weapons, no props in hands, no cape, plain white background, single character centered, no text."
gen() {
  genmedia run fal-ai/nano-banana-2 --prompt "$STYLE Character: $2" --aspect_ratio "1:1" --resolution "1K" \
    --download "art/concepts/$1.png" --json > "art/raw/$1.concept.json" 2>&1
  echo "$1 exit $?"
}
gen raider-blue "a cheerful explorer in a sky-blue jacket and a wide-brim hat, tan trousers, brown boots, small backpack." &
gen raider-pink "a sneaky masked thief in a hot-pink hooded outfit with a dark belt and soft boots, mischievous eyes." &
gen raider-yellow "a friendly round mining robot painted warm yellow with a headlamp, two arms, two legs, dark grey joints." &
gen raider-green "a small goblin scout with mint-green skin, big pointed ears, a leather vest and shorts, bare feet." &
wait
