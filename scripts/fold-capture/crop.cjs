const { PNG } = require('/Users/evandrosantos/Desktop/dosetrace/node_modules/pngjs');
const fs = require('fs');
const [,, src, dst, top] = process.argv;
const img = PNG.sync.read(fs.readFileSync(src));
const t = Number(top), h = img.height - t;
const out = new PNG({ width: img.width, height: h });
img.data.copy(out.data, 0, t * img.width * 4, img.height * img.width * 4);
fs.writeFileSync(dst, PNG.sync.write(out));
console.log(img.width + 'x' + h);
