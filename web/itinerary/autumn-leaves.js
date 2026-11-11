const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const ns = 'http://www.w3.org/2000/svg';
let layer;

// A handful of leaves, spaced through the fall cycle so they never arrive as a shower.
const leaves = [
  {x: 9, size: 21, fall: 24, delay: -7, sway: 5.6, turn: 8, color: '#ac5737'},
  {x: 48, size: 18, fall: 28, delay: -21, sway: 6.8, turn: 10, color: '#bc713e'},
  {x: 82, size: 24, fall: 26, delay: -13, sway: 6.2, turn: 9, color: '#aa4935'},
  {x: 29, size: 17, fall: 31, delay: -2, sway: 7.1, turn: 11, color: '#ba7847'},
  {x: 68, size: 20, fall: 29, delay: -25, sway: 5.9, turn: 8.5, color: '#aa563c'},
];

function pauseWhenHidden() {
  layer?.classList.toggle('autumn-leaves-paused', document.hidden);
}

function mountLeaves() {
  layer?.remove();
  layer = undefined;
  if (motionPreference.matches) return;
  layer = document.createElement('div');
  layer.className = 'autumn-leaves';
  layer.setAttribute('aria-hidden', 'true');
  for (const leaf of leaves) {
    const fall = document.createElement('span');
    fall.className = 'autumn-leaf-fall';
    for (const [name, value] of Object.entries({
      '--leaf-x': leaf.x + '%', '--leaf-size': leaf.size + 'px',
      '--leaf-fall': leaf.fall + 's', '--leaf-delay': leaf.delay + 's',
      '--leaf-sway': leaf.sway + 's', '--leaf-turn': leaf.turn + 's',
      '--leaf-color': leaf.color,
    })) fall.style.setProperty(name, value);
    const sway = document.createElement('span');
    sway.className = 'autumn-leaf-sway';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 64 70');
    svg.setAttribute('focusable', 'false');
    const blade = document.createElementNS(ns, 'path');
    blade.setAttribute('d', 'M32 3 37 19 42 14 42 28 56 18 51 32 61 33 47 43 51 49 36 48 34 59 29 59 28 48 13 50 17 43 3 34 14 32 8 19 23 28 22 14 27 19Z');
    blade.setAttribute('fill', 'currentColor');
    const veins = document.createElementNS(ns, 'path');
    veins.setAttribute('d', 'M32 14 31 58 27 67 M31 42 18 32 M32 40 46 29');
    veins.setAttribute('fill', 'none');
    veins.setAttribute('stroke', '#6e4935');
    veins.setAttribute('stroke-width', '1.6');
    veins.setAttribute('stroke-linecap', 'round');
    svg.append(blade, veins);
    sway.append(svg);
    fall.append(sway);
    layer.append(fall);
  }
  document.body.append(layer);
  pauseWhenHidden();
}

motionPreference.addEventListener('change', mountLeaves);
document.addEventListener('visibilitychange', pauseWhenHidden);
mountLeaves();
