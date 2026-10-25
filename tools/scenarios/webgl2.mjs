// WebGL2 under headless Chrome (task 0.5): draws a triangle, reads its pixels back, and reports the renderer and whether
// EXT_clip_control exists (it decides the 3D depth strategy). Also self-checks the screenshot comparison helper.
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareToReference, diffPng, screenshot } from '../shot.mjs';

export const options = { webgl: true }; // the CLI passes this to withApp

export default async ctx => {
  const { run } = ctx;
  const gl = await run(`(() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const gl = c.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) return { webgl2: false };
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\\nin vec2 a; void main() { gl_Position = vec4(a, 0., 1.); }'));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, '#version 300 es\\nprecision mediump float; out vec4 o; void main() { o = vec4(1., 0., 0., 1.); }'));
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 0, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, 64, 64); gl.clearColor(0, 0, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = (x, y) => { const b = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return [...b]; };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return { webgl2: true, version: gl.getParameter(gl.VERSION),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null, vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
      clipControl: !!gl.getExtension('EXT_clip_control'), centre: px(32, 16), topLeft: px(2, 62), error: gl.getError() };
  })()`);
  console.log('UNMASKED_RENDERER_WEBGL: ' + gl.renderer + '\nUNMASKED_VENDOR_WEBGL: ' + gl.vendor + '\nVERSION: ' + gl.version + '\nEXT_clip_control: ' + gl.clipControl);

  // the helper: identical images differ by 0, a one-pixel shift by more than 0
  const png = async shift => Buffer.from(await run(`(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.fillRect(20 + ${shift}, 20, 24, 24);
    const b = await new Promise(r => c.toBlob(r, 'image/png')), u = new Uint8Array(await b.arrayBuffer());
    let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s);
  })()`), 'base64');
  const a = await png(0), same = await diffPng(ctx, a, await png(0)), shifted = await diffPng(ctx, a, await png(1));
  console.log('diffPng identical: ' + same + '\ndiffPng shifted by 1 px: ' + shifted);
  const ref = join(mkdtempSync(join(tmpdir(), 'apexlab-ref-')), 'ref.png');
  const missing = await compareToReference(ctx, a, ref, { update: false }), missingUnwritten = !existsSync(ref);
  const wrote = await compareToReference(ctx, a, ref, { update: true }), updated = existsSync(ref);
  const okRef = await compareToReference(ctx, a, ref, { update: false }), badRef = await compareToReference(ctx, await png(1), ref, { update: false });
  const empty = await compareToReference(ctx, Buffer.alloc(0), ref + '.empty', { update: true });
  const nonPng = await compareToReference(ctx, Buffer.from('not a PNG'), ref + '.invalid', { update: true });
  const checks = { missingReference: !missing.ok && missing.missing === true && missing.wrote === false && missingUnwritten,
    updateReference: wrote.wrote === true && wrote.update === true && !wrote.ok && updated,
    sameReference: okRef.ok && okRef.fraction === 0 && !okRef.wrote,
    shiftedReference: !badRef.ok && badRef.fraction === shifted,
    emptyCapture: !empty.ok && empty.empty === true && !existsSync(ref + '.empty'),
    nonPngCapture: !nonPng.ok && nonPng.empty === true && !existsSync(ref + '.invalid') };
  console.log('compareToReference: missing ' + JSON.stringify(missing) + ', update ' + JSON.stringify(wrote) + ', same ' + JSON.stringify(okRef) + ', shifted ' + JSON.stringify(badRef));
  const { png: shot, path } = await screenshot(ctx, join(mkdtempSync(join(tmpdir(), 'apexlab-shot-')), 'page.png'));
  const self = await diffPng(ctx, shot, shot);
  console.log('screenshot of the page saved: ' + path + ' (' + shot.length + ' bytes), diffPng against itself: ' + self);

  const px = gl.centre, bg = gl.topLeft;
  Object.assign(checks, { webgl2: gl.webgl2, noGlError: gl.error === 0,
    trianglePixel: !!px && px[0] > 250 && px[1] === 0 && px[2] === 0,
    backgroundPixel: !!bg && bg[2] > 250 && bg[0] === 0,
    identicalImages: same === 0, shiftedImages: shifted > 0, screenshotSelf: self === 0 });
  return { seen: { gl, triangle: px, background: bg, same, shifted, self, missing, wrote, okRef, badRef, empty, nonPng },
    allTrue: Object.values(checks).every(Boolean), checks };
};
