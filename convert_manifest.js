const fs = require('fs-extra');
const path = require('path');

const MANIFEST_FILE = path.resolve(__dirname, 'assets/songs_manifest.json');
const DEST_FILE = path.resolve(__dirname, 'data/all_compositions.json');

async function convertManifest() {
    console.log('Converting songs_manifest.json to Vault-compatible all_compositions.json...');
    const manifest = await fs.readJson(MANIFEST_FILE);
    console.log(`Loaded ${manifest.length} manifest entries.`);

    const library = manifest.map(song => {
        // Try to parse composer/title from friendlyName if not exists
        let composer = song.composer || "Unknown";
        let title = song.title || song.friendlyName || "Unknown";

        return {
            title: title,
            composer: composer,
            midi: true,
            midi_file_path: song.midi_file_path || `assets/${song.fileName}`,
            source: 'Aether Local',
            copyright: 'public_domain'
        };
    });

    await fs.writeJson(DEST_FILE, library, { spaces: 2 });
    console.log(`Library of ${library.length} works saved to ${DEST_FILE}`);
}

convertManifest().catch(console.error);
