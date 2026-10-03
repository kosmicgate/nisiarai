const $ = id => document.getElementById(id), P = window.PALETTE;
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const toHex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
function lab([r, g, b]) { // sRGB -> CIELAB (D65)
  const f = v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  [r, g, b] = [f(r), f(g), f(b)];
  const q = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const x = q((.4124 * r + .3576 * g + .1805 * b) / .95047), y = q(.2126 * r + .7152 * g + .0722 * b), z = q((.0193 * r + .1192 * g + .9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
P.forEach(c => c.lab = lab(hex2rgb(c.hex)));
// ponytail: CIE76 distance; swap in ΔE2000 if blues/neutrals misclassify
function nearest(rgb) {
  const l = lab(rgb); let best, bd = 1e9;
  for (const c of P) { const d = (c.lab[0] - l[0]) ** 2 + (c.lab[1] - l[1]) ** 2 + (c.lab[2] - l[2]) ** 2; if (d < bd) { bd = d; best = c; } }
  return best;
}
const show = id => document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === id));
let saved = []; try { saved = JSON.parse(localStorage.cf || '[]'); } catch {}
const persist = () => { try { localStorage.cf = JSON.stringify(saved); } catch {} };

$('grid').innerHTML = P.map((c, i) => `<div class="chip" data-i="${i}"><div style="background:${c.hex}"></div><p>${c.name}<br><small>${c.nameTh}</small></p></div>`).join('');
const chips = [...$('grid').children];

// image + sampling
const cv = $('cv'), ctx = cv.getContext('2d', { willReadFrequently: true });
let fx = .5, fy = .5, rgb = [128, 128, 128], near = P[0], last = -1;
let curImg;
function draw(img, reset = true) {
  curImg = img; const k = devicePixelRatio || 1, st = $('stage');
  const W = Math.round(st.clientWidth * k), H = Math.round(st.clientHeight * k);
  if (!W || !H) return;
  cv.width = W; cv.height = H; // canvas matches stage so crosshair maps 1:1; cover-fit
  const r = Math.max(W / img.width, H / img.height), w = img.width * r, h = img.height * r;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  if (reset) fx = fy = .5;
  sample();
}
new ResizeObserver(() => curImg && draw(curImg, false)).observe($('stage'));
function sample() {
  const px = Math.round(fx * (cv.width - 1)), py = Math.round(fy * (cv.height - 1));
  const x0 = Math.max(0, Math.min(cv.width - 5, px - 2)), y0 = Math.max(0, Math.min(cv.height - 5, py - 2));
  const d = ctx.getImageData(x0, y0, 5, 5).data; let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  rgb = [r / 25 | 0, g / 25 | 0, b / 25 | 0]; near = nearest(rgb);
  $('xh').style.left = fx * 100 + '%'; $('xh').style.top = fy * 100 + '%';
  const hx = toHex(rgb);
  $('sw').style.background = hx; $('cap').textContent = 'UNDER CROSSHAIR · ' + hx;
  $('nm').innerHTML = `${near.name} <span>· ${near.nameTh}</span>`; $('pan').textContent = near.pantone;
  const i = P.indexOf(near);
  if (i !== last) {
    chips[last]?.classList.remove('on'); chips[i].classList.add('on'); last = i;
    chips[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
function load(e) {
  const f = e.target.files[0]; if (!f) return;
  const u = URL.createObjectURL(f), img = new Image();
  // EXIF orientation is applied by browsers on decode (image-orientation: from-image default)
  img.onload = () => { show('pick'); draw(img); URL.revokeObjectURL(u); };
  img.onerror = () => alert("Couldn't read that image.");
  img.src = u; e.target.value = '';
}
$('fcam').onchange = $('fup').onchange = load;
$('cam').onclick = () => $('fcam').click(); $('up').onclick = () => $('fup').click();

const st = $('stage'); let drag = false;
const move = e => { const b = st.getBoundingClientRect(); fx = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)); fy = Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)); sample(); };
st.onpointerdown = e => { st.setPointerCapture(e.pointerId); drag = true; move(e); };
st.onpointermove = e => drag && move(e);
st.onpointerup = st.onpointercancel = () => drag = false;
// tapping a palette chip is informational only; keyboard users nudge the crosshair
addEventListener('keydown', e => { const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (d && $('pick').classList.contains('on') && e.target.tagName !== 'INPUT') { e.preventDefault(); fx = Math.min(1, Math.max(0, fx + d[0] * .01)); fy = Math.min(1, Math.max(0, fy + d[1] * .01)); sample(); } });

// save flow
const sheet = $('sheet');
$('save').onclick = () => {
  $('nsw').style.background = near.hex; $('ninfo').innerHTML = `Nearest: ${near.name} · ${near.nameTh}<br>${near.pantone}`;
  $('nin').value = near.name; sheet.classList.add('on'); $('nin').select();
};
$('cancel').onclick = () => sheet.classList.remove('on');
$('ok').onclick = () => {
  saved.unshift({ name: $('nin').value.trim() || near.name, nameTh: near.nameTh, hex: near.hex, pantone: near.pantone });
  persist(); sheet.classList.remove('on'); renderSaved();
};
function renderSaved() {
  $('goSaved').textContent = `Saved colors (${saved.length})`;
  $('list').innerHTML = saved.length ? '' : '<div class="empty">Nothing saved yet.<br>Press Save on the Pick screen.</div>';
  saved.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'it';
    d.innerHTML = `<div class="sw" style="background:${s.hex};width:48px;height:48px"></div><div class="t"><b></b><div class="cap">${s.nameTh}</div><div class="cap">${s.pantone} · ${s.hex}</div></div><button aria-label="Delete">✕</button>`;
    d.querySelector('b').textContent = s.name; // user text: no innerHTML
    d.querySelector('button').onclick = () => { saved.splice(i, 1); persist(); renderSaved(); };
    $('list').append(d);
  });
}
$('goSaved').onclick = () => show('saved');
$('back1').onclick = $('back2').onclick = () => show('home');
renderSaved();
