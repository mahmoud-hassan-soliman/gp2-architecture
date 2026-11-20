const CLEARANCE = 10;
const BEND_COST = 9;
const SIDE = {
  right: [1, 0], bottom: [0, 1], left: [-1, 0], top: [0, -1]
};

function box(left, top, right, bottom) { return { left, top, right, bottom }; }

function expanded(rect) {
  return box(rect.left - CLEARANCE, rect.top - CLEARANCE, rect.right + CLEARANCE, rect.bottom + CLEARANCE);
}

function overlaps(a, b) {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}

function inside(p, r) {
  return p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;
}

function crosses(a, b, r) {
  return a.x === b.x
    ? a.x > r.left && a.x < r.right && Math.max(a.y, b.y) > r.top && Math.min(a.y, b.y) < r.bottom
    : a.y > r.top && a.y < r.bottom && Math.max(a.x, b.x) > r.left && Math.min(a.x, b.x) < r.right;
}

function port(rect, side, lane = 0) {
  const [dx, dy] = SIDE[side];
  const x = (rect.left + rect.right) / 2 + dx * (rect.right - rect.left) / 2 + Math.abs(dy) * lane;
  const y = (rect.top + rect.bottom) / 2 + dy * (rect.bottom - rect.top) / 2 + Math.abs(dx) * lane;
  return { side, axis: dx ? 0 : 1, point: { x: x + dx * 2, y: y + dy * 2 }, exit: { x: x + dx * CLEARANCE, y: y + dy * CLEARANCE } };
}

const sorted = list => [...new Set(list)].sort((a, b) => a - b);
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function buildGrid(obstacles, ports) {
  const xs = sorted([...obstacles.flatMap(b => [b.left, b.right]), ...ports.map(p => p.exit.x)]);
  const ys = sorted([...obstacles.flatMap(b => [b.top, b.bottom]), ...ports.map(p => p.exit.y)]);
  const width = xs.length;
  if (width * ys.length > 24_000) return null;
  const xi = new Map(xs.map((x, i) => [x, i]));
  const yi = new Map(ys.map((y, i) => [y, i]));
  const points = ys.flatMap(y => xs.map(x => ({ x, y })));
  const graph = points.map((point, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    if (obstacles.some(r => inside(point, r))) return [];
    const adjacent = [];
    if (x) adjacent.push(i - 1);
    if (x + 1 < width) adjacent.push(i + 1);
    if (y) adjacent.push(i - width);
    if (y + 1 < ys.length) adjacent.push(i + width);
    return adjacent.filter(j => !obstacles.some(r => crosses(point, points[j], r)));
  });
  return { points, graph, index: p => yi.get(p.y) * width + xi.get(p.x) };
}

class MinQueue {
  entries = [];
  push(item) {
    const heap = this.entries;
    let i = heap.length;
    heap.push(item);
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (heap[p].score <= item.score) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = item;
  }
  pop() {
    const heap = this.entries;
    const first = heap[0];
    const last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (2 * i + 1 < heap.length) {
        let j = 2 * i + 1;
        if (j + 1 < heap.length && heap[j + 1].score < heap[j].score) j++;
        if (heap[j].score >= last.score) break;
        heap[i] = heap[j];
        i = j;
      }
      heap[i] = last;
    }
    return first;
  }
}

function shorten(points) {
  const compact = [];
  for (const point of points) {
    const previous = compact.at(-1);
    if (previous && distance(previous, point) === 0) continue;
    const before = compact.at(-2);
    if (before && distance(before, previous) + distance(previous, point) === distance(before, point)
      && (before.x === previous.x && previous.x === point.x || before.y === previous.y && previous.y === point.y)) {
      compact.pop();
    }
    compact.push(point);
  }
  return compact;
}

function shortest(grid, start, end, preferred, usedSegments) {
  const { points, graph, index } = grid;
  const starts = new Map(start.map(p => [index(p.exit) * 2 + p.axis, p]));
  const goals = new Map(end.map(p => [index(p.exit), p]));
  const queue = new MinQueue();
  const best = new Map();
  const back = new Map();
  const heuristic = p => Math.min(...end.map(t => distance(p, t.exit)));
  for (const [state, p] of starts) {
    const cost = p.cost + (p.side === preferred.sourcePort ? 0 : 1);
    best.set(state, cost);
    queue.push({ state, cost, score: cost + heuristic(p.exit) });
  }
  let finish;
  let finishCost = Infinity;
  while (queue.entries.length) {
    const { state, cost, score } = queue.pop();
    if (score >= finishCost) break;
    if (best.get(state) !== cost) continue;
    const at = Math.floor(state / 2);
    const p = points[at];
    if (goals.has(at)) {
      const port = goals.get(at);
      const total = cost + port.cost + (port.axis !== state % 2 ? BEND_COST : 0) + (port.side === preferred.targetPort ? 0 : 1);
      if (total < finishCost) {
        finishCost = total;
        finish = { state, port };
      }
    }
    for (const next of graph[at]) {
      const q = points[next];
      const axis = p.y === q.y ? 0 : 1;
      const key = segmentKey(at, next);
      const added = distance(p, q) + (axis === state % 2 ? 0 : BEND_COST) + (usedSegments.has(key) ? Math.min(24, distance(p, q) * .6) : 0);
      const nextState = next * 2 + axis;
      const nextCost = cost + added;
      if (nextCost >= (best.get(nextState) ?? Infinity)) continue;
      best.set(nextState, nextCost);
      back.set(nextState, state);
      queue.push({ state: nextState, cost: nextCost, score: nextCost + heuristic(q) });
    }
  }
  if (!finish) return null;

  const route = [];
  let cursor = finish.state;
  while (back.has(cursor)) {
    const next = back.get(cursor);
    route.push(points[Math.floor(cursor / 2)]);
    usedSegments.add(segmentKey(Math.floor(cursor / 2), Math.floor(next / 2)));
    cursor = next;
  }
  route.push(points[Math.floor(cursor / 2)]);
  const from = starts.get(cursor);
  return { from, to: finish.port, sourcePort: from.side, targetPort: finish.port.side, points: shorten([from.point, ...route.reverse(), finish.port.point]) };
}

function edgePair(a, b) { return `${a}:${b}`; }

function segmentKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

function labelAt(points, label, obstacles) {
  if (!label) return null;
  const w = label.length * 5.7 + 11;
  const h = 18;
  let best = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (distance(a, b) < (a.y === b.y ? w + 6 : h + 6)) continue;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const rect = box(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
    if (obstacles.some(r => overlaps(rect, r))) continue;
    if (!best || distance(a, b) > best.length) best = { x, y, length: distance(a, b) };
  }
  return best;
}

export function routeDiagram(nodes, connections) {
  if (nodes.length > 70) return null;
  const geometry = nodes.map(n => {
    const card = box(n.x, n.y, n.x + n.width, n.y + n.height);
    const note = n.noteHeight ? box(n.x, n.y - 10 - n.noteHeight, n.x + n.width, n.y - 10) : null;
    return { id: n.id, card, note };
  });
  const actual = geometry.flatMap(n => n.note ? [n.card, n.note] : [n.card]);
  const obstacles = actual.map(expanded);
  const pairs = new Set(connections.map(e => edgePair(e.source, e.target)));
  const counts = new Map();
  for (const { source, target } of connections) {
    counts.set(source, (counts.get(source) ?? 0) + 1);
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const ports = new Map(geometry.map(n => [n.id, ((counts.get(n.id) ?? 0) > 1 ? [-14, 0, 14] : [0]).flatMap(lane => Object.keys(SIDE)
    .filter(side => !n.note || side !== 'top')
    .map(side => ({ ...port(n.card, side, lane), lane }))
    .filter(p => !obstacles.some(r => inside(p.exit, r)) && !actual.some(r => r !== n.card && crosses(p.point, p.exit, r))))]));
  const grid = buildGrid(obstacles, [...ports.values()].flat());
  if (!grid) return null;
  const cards = new Map(geometry.map(n => [n.id, n.card]));
  const usedSegments = new Set();
  const usedPorts = new Set();
  const portKey = (id, { side, lane }) => `${id}:${side}:${lane}`;
  const available = (id, lane) => ports.get(id)
    ?.filter(p => lane == null || lane === p.lane)
    .map(p => ({ ...p, cost: (p.lane ? 4 : 0) + (usedPorts.has(portKey(id, p)) ? 45 : 0) }));
  return new Map(connections.map(edge => {
    const hasReturn = pairs.has(edgePair(edge.target, edge.source));
    const lane = hasReturn ? (edge.source < edge.target ? -14 : 14) : null;
    const start = available(edge.source, lane);
    const end = available(edge.target, lane);
    const route = start?.length && end?.length && !overlaps(cards.get(edge.source), cards.get(edge.target))
      ? shortest(grid, start, end, edge, usedSegments) : null;
    if (!route) return [edge.id, null];
    const { from, to, ...path } = route;
    usedPorts.add(portKey(edge.source, from));
    usedPorts.add(portKey(edge.target, to));
    return [edge.id, { ...path, label: labelAt(path.points, edge.label, actual) }];
  }));
}

export function roundedPath(points) {
  const line = (command, p) => `${command} ${p.x} ${p.y}`;
  const commands = [line('M', points[0])];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const p = points[i];
    const b = points[i + 1];
    const radius = Math.min(5, distance(a, p) / 2, distance(p, b) / 2);
    const approach = { x: p.x + Math.sign(a.x - p.x) * radius, y: p.y + Math.sign(a.y - p.y) * radius };
    const leave = { x: p.x + Math.sign(b.x - p.x) * radius, y: p.y + Math.sign(b.y - p.y) * radius };
    commands.push(line('L', approach), `Q ${p.x} ${p.y} ${leave.x} ${leave.y}`);
  }
  commands.push(line('L', points.at(-1)));
  return commands.join(' ');
}
