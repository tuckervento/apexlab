// Screenshots for cdp.mjs scenarios, with a tolerant compare (zero dependencies). GPUs and rasterisers differ in the last bits,
// so images are never compared exactly: the compare runs in the page (createImageBitmap decodes both PNGs), counts the pixels
// whose largest channel difference exceeds a threshold, and returns the fraction of pixels that differ.
//
//   const { png } = await screenshot(ctx, '/tmp/x.png');               // Page.captureScreenshot, saved and returned (a Buffer)
//   const f = await diffPng(ctx, pngA, pngB, { threshold: 16 });       // 0..1; 1 if the sizes differ
//   const r = await compareToReference(ctx, png, 'ref.png', { maxFraction: 0.01 });  // {fraction, ok, wrote}
//
// ctx is what a scenario receives from withApp ({run, call, ...}). A missing reference (or APEX_UPDATE_REFS=1) is written from
// the shot and reported as wrote:true, ok:true: review and commit it next to the scenario.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export async function screenshot({ call }, path) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  if (r.error) throw new Error(`Page.captureScreenshot: ${r.error.message}`);
  const png = Buffer.from(r.result.data, 'base64');
  if (path) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, png); }
  return { path, png };
}

// Fraction of pixels whose largest per-channel difference (0..255, alpha included) exceeds `threshold`.
export async function diffPng({ run }, a, b, { threshold = 16 } = {}) {
  return run(`(async () => {
    const px = async b64 => { const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), bm = await createImageBitmap(new Blob([u], { type: 'image/png' }));
      const c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
      return { w: bm.width, h: bm.height, d: g.getImageData(0, 0, bm.width, bm.height).data }; };
    const A = await px(${JSON.stringify(Buffer.from(a).toString('base64'))}), B = await px(${JSON.stringify(Buffer.from(b).toString('base64'))});
    if (A.w !== B.w || A.h !== B.h) return 1;
    let n = 0;
    for (let i = 0; i < A.d.length; i += 4) {
      const m = Math.max(Math.abs(A.d[i] - B.d[i]), Math.abs(A.d[i + 1] - B.d[i + 1]), Math.abs(A.d[i + 2] - B.d[i + 2]), Math.abs(A.d[i + 3] - B.d[i + 3]));
      if (m > ${+threshold}) n++;
    }
    return n / (A.w * A.h);
  })()`);
}

export async function compareToReference(ctx, png, refPath, { threshold = 16, maxFraction = 0.01 } = {}) {
  if (!existsSync(refPath) || process.env.APEX_UPDATE_REFS === '1') {
    mkdirSync(dirname(refPath), { recursive: true }); writeFileSync(refPath, png);
    return { fraction: 0, ok: true, wrote: true };
  }
  const fraction = await diffPng(ctx, png, readFileSync(refPath), { threshold });
  return { fraction, ok: fraction <= maxFraction, wrote: false };
}
