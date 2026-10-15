"""Run in Blender: Blender --background --python scripts/export-web-models.py -- /path/to/usdz-models

Source filenames must match gallery IDs. Exports geometry/materials without
simplification, embeds 2048px WebP textures, and converts the USD stage to Y up.
"""
import argparse
import json
import sys
from pathlib import Path
import bpy

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('--model', action='append', help='Export a specific model ID instead of the gallery')
parser.add_argument('--texture-size', type=int, default=2048)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = Path(__file__).resolve().parent.parent
assets = root / 'site/public/assets'
output = assets / 'models'
output.mkdir(parents=True, exist_ok=True)
models = [{'id': identifier} for identifier in args.model] if args.model else json.loads((assets / 'gallery.json').read_text())
for model in models:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.usd_import(filepath=str(args.source / f"{model['id']}.usdz"))
    for image in bpy.data.images:
        width, height = image.size
        if max(width, height) > args.texture_size:
            scale = args.texture_size / max(width, height)
            image.scale(round(width * scale), round(height * scale))
    bpy.ops.export_scene.gltf(
        filepath=str(output / f"{model['id']}.glb"), export_format='GLB',
        export_image_format='WEBP', export_image_quality=95, export_yup=True,
    )
