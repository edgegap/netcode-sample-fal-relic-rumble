"""Download a finished Meshy job's files into art/models/<name>/. Usage: python art/fetch.py <name>"""
import json, sys, os, urllib.request
name = sys.argv[1]
r = json.load(open(f"art/raw/{name}.result.json"))["result"]
out = f"art/models/{name}"
os.makedirs(out, exist_ok=True)
files = {"model.glb": r["model_glb"]["url"]}
if r.get("rigged_character_glb"):
    files["rigged.glb"] = r["rigged_character_glb"]["url"]
    files["walk.glb"] = r["basic_animations"]["walking_armature_glb"]["url"]
    files["run.glb"] = r["basic_animations"]["running_armature_glb"]["url"]
for f, url in files.items():
    assert url.startswith("https://") and ".fal.media/" in url, url
    urllib.request.urlretrieve(url, f"{out}/{f}")
    print(f, os.path.getsize(f"{out}/{f}"))
