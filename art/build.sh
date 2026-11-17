#!/usr/bin/env bash
# Shrink the downloaded GLBs for the web and copy them to client/assets/. Run from the repo root:
#   bash art/build.sh raider-blue        (a rigged character: model + walk and run clips)
#   bash art/build.sh relic prop         (a prop)
# 2048 px JPEG textures become 1024 px WebP; meshes are left alone so skinning stays intact.
set -e
name=$1; kind=${2:-character}
src=art/models/$name; out=client/assets
gt() { npx -y @gltf-transform/cli@4 "$@" > /dev/null; }
in=$src/rigged.glb; [ "$kind" = prop ] && in=$src/model.glb
gt resize "$in" "$src/tmp.glb" --width 1024 --height 1024
gt webp "$src/tmp.glb" "$out/$name.glb" --quality 85
rm "$src/tmp.glb"
if [ "$kind" != prop ]; then cp "$src/walk.glb" "$out/$name-walk.glb"; cp "$src/run.glb" "$out/$name-run.glb"; fi
ls -la "$out" | grep "$name"
