const path = require('path');
const fs = require('fs');
const pptxgen = require('/tmp/ddos-deck/node_modules/pptxgenjs');

const dir = '/tmp/ddos-deck-v2';
const pptx = new pptxgen();
pptx.defineLayout({ name: 'W169', width: 13.333, height: 7.5 });
pptx.layout = 'W169';
pptx.author = 'DueDiligenceOS';
pptx.title = 'DueDiligenceOS — Band of Agents (Track 3)';

const pngs = fs.readdirSync(dir).filter(f => /^slide-\d+\.png$/.test(f)).sort();
for (const f of pngs) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addImage({ path: path.join(dir, f), x: 0, y: 0, w: 13.333, h: 7.5 });
}
pptx.writeFile({ fileName: path.join(dir, 'DueDiligenceOS.pptx') }).then(() => {
  console.log('wrote pptx with', pngs.length, 'slides');
});
