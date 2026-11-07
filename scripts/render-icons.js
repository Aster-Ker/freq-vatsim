// Draws the Freq mark (seven rounded level bars, like the player's audio
// meter) on a 108 unit grid, the Android adaptive icon canvas, and renders
// every image app.json points at into a folder:
//
//   node scripts/render-icons.js assets
//
// Needs Playwright with Chromium (npx playwright install chromium). Expo then
// makes the per density launcher icons from these at build time. The status
// bar icon is drawn separately, as a vector, in
// modules/freq-playback/android/src/main/res/drawable/freq_notification.xml.
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2];

const INDIGO = '#5E6AD2';
const HEIGHTS = [10, 20, 32, 42, 28, 18, 12];   // reads as speech, not a symmetric logo
const BAR_W = 4.6, GAP = 2.6;

// Bars centred on (cx, cy), scaled by k from the 108 grid.
function bars(color, k = 1, cx = 54, cy = 54) {
  const total = HEIGHTS.length * BAR_W + (HEIGHTS.length - 1) * GAP;
  let x = cx - (total * k) / 2;
  return HEIGHTS.map((h) => {
    const r = `<rect x="${x.toFixed(2)}" y="${(cy - (h * k) / 2).toFixed(2)}" width="${(BAR_W * k).toFixed(2)}" height="${(h * k).toFixed(2)}" rx="${((BAR_W * k) / 2).toFixed(2)}" fill="${color}"/>`;
    x += (BAR_W + GAP) * k;
    return r;
  }).join('');
}

const svg = (body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108">${bg ? `<rect width="108" height="108" fill="${bg}"/>` : ''}${body}</svg>`;

const files = [
  // Full square icon: legacy launchers, iOS, store listings. The bars sit a
  // little larger here than in the adaptive layer, which masks its edges.
  { name: 'icon.png', size: 1024, svg: svg(bars('#FFFFFF', 1.25), INDIGO) },
  // Adaptive icon foreground: the mark inside the 66 unit safe circle, on transparent.
  { name: 'adaptive-icon.png', size: 1024, svg: svg(bars('#FFFFFF')), transparent: true },
  // Android 13 themed icon: the system tints it, so only the shape matters.
  { name: 'adaptive-monochrome.png', size: 1024, svg: svg(bars('#FFFFFF')), transparent: true },
  // Launch screen: indigo bars on the black splash.
  { name: 'splash-icon.png', size: 512, svg: svg(bars(INDIGO, 1.6)), transparent: true },
  { name: 'favicon.png', size: 48, svg: svg(bars('#FFFFFF', 1.35), INDIGO) },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const f of files) {
    await page.setViewportSize({ width: f.size, height: f.size });
    const sized = f.svg.replace('width="108" height="108"', `width="${f.size}" height="${f.size}"`);
    await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
    await page.screenshot({ path: path.join(out, f.name), omitBackground: !!f.transparent, clip: { x: 0, y: 0, width: f.size, height: f.size } });
  }
  await browser.close();
  console.log('rendered', files.length);
})();
