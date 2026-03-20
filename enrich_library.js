const fs = require('fs-extra');
const path = require('path');

const ASSETS_DIR = path.resolve(__dirname, 'assets');
const SOURCE_FILE = path.resolve(__dirname, '../New folder (3)/K_MUSE/assets/all_compositions.json');
const DEST_FILE = path.resolve(__dirname, 'data/all_compositions.json');

const sanitize = (name) => {
    return name.toString()
        .replace(/[\/\\?%*:|"<>]/g, '_')
        .replace(/ /g, '_')
        .replace(/__/g, '_')
        .replace(/\.+/g, '_');
};

async function fixLibrary() {
    console.log('Enriching library with pre-rendered JS files...');
    
    // 1. Scan assets for .js files
    const jses = new Set();
    const files = await fs.readdir(ASSETS_DIR);
    files.forEach(f => {
        if (f.toLowerCase().endsWith('.js')) jses.add(f.toLowerCase());
    });
    console.log(`Found ${jses.size} .js assets.`);

    // 2. Load the big library
    const data = await fs.readJson(SOURCE_FILE);
    console.log(`Loaded ${data.length} compositions from source.`);

    let matched = 0;
    // 3. Mark matching works as midi: true
    for (const item of data) {
        const sComp = sanitize(item.composer);
        const sTitle = sanitize(item.title);
        const expected = `${sComp}_${sTitle}.js`.toLowerCase();

        if (jses.has(expected)) {
            item.midi = true;
            item.midi_file_path = `assets/${expected}`;
            matched++;
        } else {
            // Already have some midi property? Keep it if it has a file path?
            // Usually we want to trust our local assets first.
        }
    }
    console.log(`Matched ${matched} works with local assets.`);

    // 4. Save to destination
    await fs.writeJson(DEST_FILE, data, { spaces: 2 });
    console.log(`Library saved to ${DEST_FILE}`);
}

fixLibrary().catch(console.error);
