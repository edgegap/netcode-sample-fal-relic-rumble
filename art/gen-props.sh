#!/usr/bin/env bash
# Prop concepts and the floor texture (fal-ai/nano-banana-2). Run from the repo root.
PROP="Stylized chunky low-poly game prop, simple shapes, flat matte colors with soft shading, three-quarter view from slightly above, the whole object visible, plain white background, single object centered, no text, no characters."
gen() {
  genmedia run fal-ai/nano-banana-2 --prompt "$2" --aspect_ratio "1:1" --resolution "1K" \
    --download "art/concepts/$1.png" --json > "art/raw/$1.concept.json" 2>&1
  echo "$1 exit $?"
}
gen relic "$PROP Object: a small golden relic, a sun-shaped idol with a round turquoise gem in the middle, on a tiny base." &
gen pillar "$PROP Object: a short square ancient stone pillar, as wide as it is deep and a bit taller than wide, carved with simple glyphs, a little moss, flat top." &
gen pedestal "$PROP Object: a low round stone pedestal, wide and short like a drum, with a carved ring around its edge and a flat top." &
gen floor "Seamless tileable texture, top-down orthographic view of ancient sandstone floor slabs of different sizes with thin dark gaps and a few mossy patches, stylized low-poly look, flat matte colors, even lighting, no shadows, no objects, no text." &
wait
