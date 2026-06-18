import fs from 'node:fs';
import path from 'node:path';
import gifenc from 'gifenc';
import pngjs from 'pngjs';

const { GIFEncoder, applyPalette, quantize } = gifenc;
const { PNG } = pngjs;
const frameDirectory = path.resolve(process.argv[2] ?? 'docs/assets/demo-frames');
const output = path.resolve(process.argv[3] ?? 'docs/assets/demo.gif');
const files = fs.readdirSync(frameDirectory)
  .filter((name) => /^frame-\d+\.png$/.test(name))
  .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]));

if (files.length === 0) throw new Error(`No PNG frames found in ${frameDirectory}`);

const gif = GIFEncoder();
const frameDelays = [1800, 1800, 800, 800, 800, 800, 2500];
for (let index = 0; index < files.length; index += 1) {
  const png = PNG.sync.read(fs.readFileSync(path.join(frameDirectory, files[index])));
  const palette = quantize(png.data, 128, { format: 'rgb444' });
  const pixels = applyPalette(png.data, palette, 'rgb444');
  gif.writeFrame(pixels, png.width, png.height, {
    palette,
    delay: frameDelays[index] ?? 800,
    repeat: 0
  });
}
gif.finish();
fs.writeFileSync(output, gif.bytes());
console.log(output);
