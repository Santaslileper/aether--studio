const sdk = require('cue-sdk');
const codes = {};
for (const k in sdk) {
    if (k.startsWith('CLK_')) codes[k] = sdk[k];
}
console.log(JSON.stringify(codes));
