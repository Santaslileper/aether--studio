const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');
const { sanitizeFilename } = require('./utils');

async function processItem(item, browserContext, midisDir, shardId = 'TARGET') {
    const composer = item.composer || 'Unknown';
    const title = item.title || 'Unknown';
    
    if (item.midi === true) return false;

    const fileName = `${sanitizeFilename(composer)}_${sanitizeFilename(title)}.mid`;
    const filePath = path.join(midisDir, fileName);

    if (await fs.exists(filePath)) {
        item.midi = true;
        item.midi_file_path = fileName;
        return false;
    }

    const query = `${composer} ${title} piano midi`;
    const searchUrl = `https://bitmidi.com/search?q=${encodeURIComponent(query)}`;

    const page = await browserContext.newPage();
    try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        
        // Wait for potential links
        try {
            await page.waitForSelector('a[href*="-mid"]', { timeout: 8000 });
        } catch (e) {}

        const links = await page.$$('a[href*="-mid"]');
        let targetLink = null;
        for (const link of links) {
            const href = await link.getAttribute('href');
            if (href && (href.endsWith('-mid') || /-mid-\d+$/.test(href))) {
                targetLink = href;
                break;
            }
        }

        if (!targetLink) {
            item.midi = 'not_found';
            return false;
        }

        const midiPageUrl = `https://bitmidi.com${targetLink}`;
        await page.goto(midiPageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

        const dlBtn = await page.$('a[href^="/uploads/"]');
        if (dlBtn) {
            const dlUrl = `https://bitmidi.com${await dlBtn.getAttribute('href')}`;
            
            // Use page.request to stay within the session if needed, 
            // or just fetch if it's a direct link.
            const response = await page.request.get(dlUrl, {
                headers: { 'Referer': midiPageUrl }
            });

            if (response.ok()) {
                await fs.writeFile(filePath, await response.body());
                item.midi = true;
                item.midi_file_path = fileName;
                console.log(`[SHARD-${shardId}] SUCCESS: ${fileName}`);
                return true;
            } else {
                item.midi = `failed_${response.status()}`;
                console.error(`[SHARD-${shardId}] ERR: HTTP ${response.status()} for ${fileName}`);
            }
        } else {
            item.midi = 'no_dl_link';
        }
    } catch (e) {
        item.midi = 'error';
        console.error(`[SHARD-${shardId}] Error processing ${fileName}:`, e.message);
    } finally {
        await page.close();
    }
    return false;
}

module.exports = {
    processItem
};
