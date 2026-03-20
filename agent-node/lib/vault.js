const fs = require('fs-extra');
const path = require('path');
const { sanitizeFilename } = require('./utils');

/**
 * Merge individual .jsonl shards into a unified JSON vault.
 */
async function runVaultMerge(dataDir, midisDir, outputFile) {
    const allData = [];
    const seen = new Set();
    
    // Scan MIDIS_DIR for existing .mid files
    const existingMidis = new Set();
    if (await fs.exists(midisDir)) {
        const files = await fs.readdir(midisDir);
        files.forEach(f => {
            if (f.toLowerCase().endsWith('.mid')) existingMidis.add(f.toLowerCase());
        });
    }
    
    // Scan ASSETS_DIR for existing .js files (classical library)
    const assetsDir = path.resolve(midisDir, '../assets');
    const existingAssets = new Set();
    if (await fs.exists(assetsDir)) {
        const files = await fs.readdir(assetsDir);
        files.forEach(f => {
            if (f.toLowerCase().endsWith('.js')) existingAssets.add(f.toLowerCase());
        });
    }
    console.log(`[Vault] Scanned ${existingMidis.size} MIDIs and ${existingAssets.size} JS files.`);

    if (!(await fs.exists(dataDir))) {
        console.warn(`[Vault] Data directory ${dataDir} does not exist.`);
        return;
    }

    const files = await fs.readdir(dataDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    for (const f of jsonlFiles) {
        const filePath = path.join(dataDir, f);
        const composer = f.replace('.jsonl', '').replace(/_/g, ' ');
        
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const item = JSON.parse(line);
                if (!item.composer) item.composer = composer;

                const sComp = sanitizeFilename(item.composer);
                const sTitle = sanitizeFilename(item.title || 'Unknown');
                const expectedMid = `${sComp}_${sTitle}.mid`.toLowerCase();
                const expectedJs = `${sComp}_${sTitle}.js`.toLowerCase();

                if (existingMidis.has(expectedMid)) {
                    item.midi = true;
                    item.midi_file_path = expectedMid;
                } else if (existingAssets.has(expectedJs)) {
                    item.midi = true;
                    item.midi_file_path = `assets/${expectedJs}`;
                } else {
                    if (item.midi === true) item.midi = false;
                    delete item.midi_file_path;
                }

                const key = `${item.composer}|${item.title}`;
                if (seen.has(key)) continue;
                seen.add(key);

                allData.push(item);
            } catch (e) {
                console.error(`[Vault] Failed to parse line in ${f}:`, e.message);
            }
        }
    }

    await fs.writeJson(outputFile, allData, { spaces: 2 });
    console.log(`[Vault] Consolidated ${allData.length} compositions to ${outputFile}`);
}

module.exports = {
    runVaultMerge
};
