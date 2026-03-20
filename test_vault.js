const fs = require('fs-extra');
const path = require('path');
const { runVaultMerge } = require('./agent-node/lib/vault');

const DATA_DIR = path.join(__dirname, 'data');
const MIDIS_DIR = path.join(__dirname, 'midis');
const COMPS_FILE = path.join(__dirname, 'data/all_compositions.json');

async function test() {
    console.log('Testing Vault Merge...');
    console.log('DATA_DIR:', DATA_DIR);
    const files = await fs.readdir(DATA_DIR);
    console.log('Found files:', files.length);
    const jsonl = files.filter(f => f.endsWith('.jsonl'));
    console.log('JSONL files:', jsonl.length);
    
    await runVaultMerge(DATA_DIR, MIDIS_DIR, COMPS_FILE);
    console.log('Merge complete.');
}

test().catch(console.error);
