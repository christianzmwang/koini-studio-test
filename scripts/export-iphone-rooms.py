"""Export only Koini rooms and their referenced assets from a paired iPhone.

Requires Xcode, an unlocked connected device, and Apple's permission to read
Koini's container. TestFlight may restrict container access. Does not modify
the phone, sign in, contact the backend, or retain other app preferences.
"""
import argparse
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = 'com.christianwang.koini'
ROOMS_KEY = 'roomscanner.rooms.v1'


def read_rooms(preferences):
    value = plistlib.loads(preferences).get(ROOMS_KEY)
    if value is None:
        raise ValueError('No saved rooms found in this Koini container.')
    rooms = json.loads(value)
    if not isinstance(rooms, list) or any(not isinstance(room, dict) for room in rooms):
        raise ValueError('Saved room data is not a room list.')
    return rooms


def referenced_assets(rooms):
    assets = set()
    for room in rooms:
        if room.get('meshFilename'):
            assets.add(('roommeshes', room['meshFilename']))
        for item in room.get('items', []):
            if item.get('glbFilename'):
                assets.add(('models', item['glbFilename']))
    for _, name in assets:
        if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}', name):
            raise ValueError('A saved asset has an invalid filename.')
    return sorted(assets)


def private_json(path, data):
    # Reject symlinks and replace atomically rather than overwriting unrelated files.
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as file:
        temporary = Path(file.name)
        try:
            json.dump(data, file, ensure_ascii=False, indent=2, allow_nan=False)
            file.write('\n')
            file.flush()
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', required=True, help='Paired iPhone name or identifier')
    parser.add_argument('--output', type=Path, default=ROOT / '.local/rooms')
    parser.add_argument('--rooms-only', action='store_true', help='Skip furniture model and room mesh files')
    args = parser.parse_args()
    output = args.output.resolve()
    for public in [ROOT / 'site', ROOT / 'dist', ROOT / 'public']:
        if output.is_relative_to(public):
            parser.error('Choose a private output folder outside the website and build directories.')
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='koini-room-export-') as scratch:
        scratch = Path(scratch)

        def receive(source, destination):
            command = ['xcrun', 'devicectl', 'device', 'copy', 'from',
                       '--device', args.device, '--domain-type', 'appDataContainer',
                       '--domain-identifier', BUNDLE, '--source', source,
                       '--destination', str(destination), '--timeout', '20',
                       '--json-output', str(scratch / 'transfer.json'), '--quiet']
            result = subprocess.run(command, capture_output=True, text=True, timeout=30)
            if result.returncode:
                raise RuntimeError(result.stderr.strip() or result.stdout.strip()
                                   or 'Apple could not read the Koini app container.')

        preferences = scratch / 'preferences.plist'
        receive(f'Library/Preferences/{BUNDLE}.plist', preferences)
        rooms = read_rooms(preferences.read_bytes())
        preferences.unlink()
        assets = referenced_assets(rooms)
        private_json(output / 'rooms.json', rooms)
        missing = []
        if not args.rooms_only:
            for folder, filename in assets:
                target = output / folder
                target.mkdir(mode=0o700, exist_ok=True)
                try:
                    staged = scratch / filename
                    receive(f'Documents/{folder}/{filename}', staged)
                    staged.chmod(0o600)
                    os.replace(staged, target / filename)
                except RuntimeError:
                    missing.append({'folder': folder, 'filename': filename})
        private_json(output / 'index.json', {
            'rooms': [{'id': room.get('id'), 'name': room.get('name'),
                       'items': len(room.get('items', []))} for room in rooms],
            'assetsSkipped': args.rooms_only, 'missingAssets': missing,
        })
        print(f'Exported {len(rooms)} rooms to {output}')
        if missing:
            print(f'{len(missing)} referenced assets were unavailable; see index.json.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        raise SystemExit(f'Room export failed: {error}')
