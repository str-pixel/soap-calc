// Implements the workability spec EXACTLY as written, to verify its own claims.
const FLOOR = 4, CAP = 336, BUFFER = 4, WIDTH = 1.5;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// piecewise-linear through sorted knees, flat outside
function pw(x, knees) {
  if (x <= knees[0][0]) return knees[0][1];
  if (x >= knees[knees.length - 1][0]) return knees[knees.length - 1][1];
  for (let i = 0; i < knees.length - 1; i++) {
    const [x0, y0] = knees[i], [x1, y1] = knees[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
}
const gelF = m => ({ none: 1.30, natural: 1.00, forced: 0.55 }[m] ?? 1.00);
const lyeF = p => pw(p, [[25, 1.30], [33, 1.00], [40, 0.78]]);
const sfF  = p => pw(p, [[2, 0.90], [5, 1.00], [10, 1.20]]);
const slF  = d => pw(clamp(d, 0, 3), [[0, 1.00], [3, 0.90]]);
const saltF= d => pw(clamp(d, 0, 1), [[0, 1.00], [1, 0.90]]);

function baseBand(h) {
  h = clamp(h, 0, 60);
  if (h >= 45) return [12, 36];
  if (h >= 38) return [36, 72];
  if (h >= 30) return [72, 120];
  if (h >= 22) return [120, 192];
  return [192, 336];
}

// returns {unmold:[min,max], cut:[min,max], stamp:[min,max]} or null
function estimate({ hardness, coverage, lye, superfat, process, gel = 'natural', sl = 0, salt = 0 }) {
  if (process === 'ls') return null;
  for (const v of [hardness, coverage, lye, superfat]) if (!Number.isFinite(v)) return null;
  if (process === 'hp') return { unmold: [6, 18], cut: [6, 18], stamp: null, conf: 'moderate' };
  if (coverage <= 0) return null;
  const conf = coverage < 80 ? 'low' : 'moderate';

  const [b0, b1] = baseBand(hardness);
  const m = gelF(gel) * lyeF(lye) * sfF(superfat) * slF(sl) * saltF(salt);
  // FIX: floor only, NO hard cap (cap is a display ceiling). min-width always achievable.
  let umin = Math.max(FLOOR, b0 * m), umax = Math.max(FLOOR, b1 * m);
  if (umax < umin * WIDTH) umax = umin * WIDTH;
  const cut = [umin + BUFFER, umax + BUFFER];
  const stamp = [cut[1], cut[1] * 1.3];
  return { unmold: [umin, umax], cut, stamp, conf, m };
}

const r2 = x => Math.round(x * 100) / 100;
const show = e => e && `unmold ${r2(e.unmold[0])}-${r2(e.unmold[1])}h · cut ${r2(e.cut[0])}-${r2(e.cut[1])}h · stamp ${r2(e.stamp[0])}-${r2(e.stamp[1])}h · w=${r2(e.unmold[1]/e.unmold[0])} · m=${e.m?r2(e.m):'-'}`;

console.log('--- baseline composite (claim: exactly 1.0) ---');
const base = estimate({ hardness: 47, coverage: 100, lye: 33, superfat: 5, process: 'cp' });
console.log('composite =', base.m, base.m === 1 ? 'PASS' : 'FAIL');

console.log('\n--- worked FAST case (claim ~5-14h, cut ~9-18, stamp ~18-23) ---');
console.log(show(estimate({ hardness: 47, coverage: 100, lye: 38, superfat: 3, process: 'cp', gel: 'forced', sl: 3 })));

console.log('\n--- worked SLOW case (claim capped ~2 weeks / 330-336h) ---');
const slow = estimate({ hardness: 14, coverage: 100, lye: 28, superfat: 8, process: 'cp', gel: 'none' });
console.log(show(slow), '| width =', r2(slow.unmold[1] / slow.unmold[0]), slow.unmold[1] / slow.unmold[0] >= 1.5 ? 'width OK' : 'WIDTH VIOLATION (<1.5x)');

console.log('\n--- all-unsaturated (score 0, coverage high) => NOT null ---');
console.log(estimate({ hardness: 0, coverage: 95, lye: 33, superfat: 5, process: 'cp' }) ? 'PASS (returns band)' : 'FAIL (null)');

console.log('\n--- gates ---');
console.log('ls:', estimate({ process: 'ls', hardness: 40, coverage: 90, lye: 33, superfat: 5 }) === null ? 'null PASS' : 'FAIL');
console.log('hp sparse coverage:', estimate({ process: 'hp', hardness: 40, coverage: 5, lye: 33, superfat: 5 }) ? 'band PASS' : 'FAIL null');
console.log('cp coverage 0:', estimate({ process: 'cp', hardness: 40, coverage: 0, lye: 33, superfat: 5 }) === null ? 'null PASS' : 'FAIL');
console.log('non-finite lye:', estimate({ process: 'cp', hardness: 40, coverage: 90, lye: NaN, superfat: 5 }) === null ? 'null PASS' : 'FAIL');

console.log('\n--- monotonic in hardness (non-decreasing unmold as hardness DROPS) ---');
let prev = 0, mono = true;
for (let h = 60; h >= 0; h -= 2) {
  const e = estimate({ hardness: h, coverage: 100, lye: 33, superfat: 5, process: 'cp' });
  if (e.unmold[0] < prev - 1e-9) { mono = false; console.log('  VIOLATION at h=', h); }
  prev = e.unmold[0];
}
console.log(mono ? 'monotonic PASS' : 'monotonic FAIL');

console.log('\n--- min-width across a fuzz (claim: max >= min*1.5 ALWAYS) ---');
let widthFails = 0, orderFails = 0, n = 0;
const gels = ['none', 'natural', 'forced'];
for (let h = 0; h <= 60; h += 3)
  for (const lye of [22, 28, 33, 38, 44])
    for (const sf of [1, 3, 5, 8, 12])
      for (const g of gels)
        for (const sl of [0, 1.5, 3, 50])
          for (const salt of [0, 0.5, 1, 5]) {
            const e = estimate({ hardness: h, coverage: 100, lye, superfat: sf, process: 'cp', gel: g, sl, salt });
            n++;
            if (e.unmold[1] < e.unmold[0] * WIDTH - 1e-6) widthFails++;
            if (!(e.unmold[0] <= e.cut[0] + 1e-9 && e.cut[1] <= e.stamp[0] + 1e-9)) orderFails++;
          }
console.log(`n=${n} · width violations=${widthFails} · ordering violations=${orderFails}`);
