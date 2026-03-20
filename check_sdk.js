const sdk = require('cue-sdk');
console.log('SDK Exports:', Object.keys(sdk).filter(k => !k.startsWith('Corsair')));
// Look for LedId or similar
const constants = Object.keys(sdk).filter(k => k.includes('CLK') || k.includes('LED'));
console.log('Potential Constants:', constants.slice(0, 20));
