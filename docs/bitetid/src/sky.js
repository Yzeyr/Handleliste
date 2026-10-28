/**
 * Himmelen øverst i appen følger været der du fisker, akkurat nå.
 *
 * Fargen kommer fra hvor sola står (natt, skumring, dag), og blandes mot grått
 * etter hvor overskyet det er. Oppå tegnes været selv: stjerner en klar natt,
 * skyer som driver med vinden, regn som faller skrått i vinden, snø, tåke og
 * lyn. Står telefonen på «reduser bevegelse», tegnes ett stillbilde.
 */
import { skyColors } from './ui.js?v=85190b6441';

export function weatherKind(code, cloud) {
  if (code >= 95) return 'torden';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'sno';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'regn';
  if (code === 45 || code === 48) return 'take';
  if (cloud >= 70 || code === 3) return 'overskyet';
  if (cloud >= 25 || code === 1 || code === 2) return 'lettskyet';
  return 'klart';
}

const GREY = {
  klart: [0, '#000000'],
  lettskyet: [0.22, null],
  overskyet: [0.58, null],
  take: [0.72, 'light'],
  regn: [0.7, 'dark'],
  sno: [0.55, 'light'],
  torden: [0.85, 'storm'],
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Himmelfargene for været nå. Ren funksjon, så den kan testes. */
export function weatherSky(sunAlt, kind) {
  const base = skyColors(sunAlt);
  const [amount, tone] = GREY[kind];
  if (amount === 0) return base;
  const night = sunAlt < -6;
  const target =
    tone === 'storm'
      ? night ? '#0c0f16' : '#2b313c'
      : tone === 'light'
        ? night ? '#26313a' : '#a9b4ba'
        : tone === 'dark'
          ? night ? '#141b22' : '#5d6974'
          : night ? '#1b242c' : '#7f8c96';
  return {
    top: mix(base.top, target, amount),
    mid: mix(base.mid, target, amount * 0.95),
    low: mix(base.low, target, amount * 0.85),
  };
}

export function createSky(canvas) {
  const ctx = canvas.getContext('2d');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = { kind: 'klart', sunAlt: 0, wind: 2, windDir: 270, precip: 0, cloud: 0 };
  let particles = [];
  let clouds = [];
  let stars = [];
  let flash = 0;
  let nextFlash = 0;
  let raf = 0;
  let w = 0;
  let h = 0;
  let last = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    const { kind, cloud, precip } = state;
    const night = state.sunAlt < -8;
    stars =
      night && cloud < 55
        ? Array.from({ length: Math.round((w * h) / 2600) }, () => ({
            x: Math.random() * w,
            y: Math.random() * h * 0.7,
            r: Math.random() * 1.1 + 0.3,
            p: Math.random() * Math.PI * 2,
          }))
        : [];
    const cloudCount = kind === 'klart' ? 0 : Math.round(2 + (cloud / 100) * 7);
    clouds = Array.from({ length: cloudCount }, (_, i) => ({
      x: Math.random() * (w + 300) - 150,
      y: 10 + Math.random() * h * 0.55,
      s: 60 + Math.random() * 90,
      speed: 0.4 + Math.random() * 0.6,
      i,
    }));
    let count = 0;
    if (kind === 'regn' || kind === 'torden') count = Math.round(60 + Math.min(precip, 6) * 30);
    if (kind === 'sno') count = Math.round(50 + Math.min(precip, 4) * 25);
    if (kind === 'take') count = 6;
    particles = Array.from({ length: count }, () => newParticle(true));
  }

  function newParticle(anywhere) {
    const kind = state.kind;
    if (kind === 'take') {
      return { x: Math.random() * w, y: h * 0.35 + Math.random() * h * 0.6, len: 140 + Math.random() * 200, speed: 0.15 + Math.random() * 0.25 };
    }
    return {
      x: Math.random() * (w + 80) - 40,
      y: anywhere ? Math.random() * h : -10,
      v: kind === 'sno' ? 0.5 + Math.random() * 0.7 : 7 + Math.random() * 5,
      r: kind === 'sno' ? 1 + Math.random() * 2.2 : 0,
      p: Math.random() * Math.PI * 2,
    };
  }

  // Vinden kommer FRA windDir; østlig komponent styrer driften sidelengs.
  const drift = () => -Math.sin((state.windDir * Math.PI) / 180) * Math.min(state.wind, 14) * 0.25;

  function frame(t) {
    const dt = last ? Math.min((t - last) / 16.7, 3) : 1;
    last = t;
    ctx.clearRect(0, 0, w, h);
    const night = state.sunAlt < -6;
    const dx = drift();

    for (const s of stars) {
      const a = 0.45 + 0.45 * Math.sin(t / 900 + s.p);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const cloudAlpha = state.kind === 'lettskyet' ? 0.22 : 0.3;
    for (const c of clouds) {
      c.x += (dx * 0.25 + c.speed * 0.15 * Math.sign(dx || 1)) * dt;
      if (c.x > w + 200) c.x = -200;
      if (c.x < -200) c.x = w + 200;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.s);
      const col = night ? '150,165,180' : '255,255,255';
      g.addColorStop(0, `rgba(${col},${cloudAlpha})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.s * 1.6, c.s * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state.kind === 'regn' || state.kind === 'torden') {
      ctx.strokeStyle = night ? 'rgba(180,200,220,0.35)' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const p of particles) {
        p.y += p.v * dt;
        p.x += dx * dt;
        if (p.y > h + 10 || p.x < -50 || p.x > w + 50) Object.assign(p, newParticle(false));
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - dx * 2.2, p.y - p.v * 1.6);
      }
      ctx.stroke();
    } else if (state.kind === 'sno') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const p of particles) {
        p.y += p.v * dt;
        p.p += 0.02 * dt;
        p.x += (dx * 0.4 + Math.sin(p.p) * 0.4) * dt;
        if (p.y > h + 10) Object.assign(p, newParticle(false));
        if (p.x < -20) p.x = w + 10;
        if (p.x > w + 20) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (state.kind === 'take') {
      for (const p of particles) {
        p.x += p.speed * dt;
        if (p.x - p.len > w) p.x = -p.len;
        const g = ctx.createLinearGradient(p.x - p.len, 0, p.x + p.len, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, night ? 'rgba(200,210,220,0.16)' : 'rgba(255,255,255,0.32)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.len, p.y, p.len * 2, 18);
      }
    }

    if (state.kind === 'torden') {
      if (t > nextFlash) {
        flash = 1;
        nextFlash = t + 5000 + Math.random() * 9000;
      }
      if (flash > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${(flash * 0.55).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        flash *= 0.82;
      }
    }

    if (!still.matches && document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
  }

  function start() {
    cancelAnimationFrame(raf);
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => {
    resize();
    start();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') start();
  });
  still.addEventListener?.('change', start);

  return {
    update(next) {
      const changed = next.kind !== state.kind || Math.abs(next.cloud - state.cloud) > 15 || (next.sunAlt < -8) !== (state.sunAlt < -8);
      state = { ...state, ...next };
      if (changed || w === 0) resize();
      start();
    },
  };
}
