import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { canConnect, deleteSelection, updateItem, validateArchitecture } from '../src/model.js';
import { addDays, taskWindows, teamDate } from '../src/task-model.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../src/${name}.json`, import.meta.url), 'utf8'));
const baseline = read('architecture');
const plan = read('team-plan');

test('task periods are member-specific, inclusive and do not overlap', () => {
  for (const { name } of plan.people) {
    const result = taskWindows(plan.tasks, name, '2026-11-25');
    assert.equal(result.throughToday.length, 6);
    assert.equal(result.throughToday[0].date, '2026-11-20');
    assert.equal(result.throughToday.at(-1).date, '2026-11-25');
    assert.equal(result.nextWeek.length, 7);
    assert.equal(result.nextWeek[0].date, '2026-11-26');
    assert.equal(result.nextWeek.at(-1).date, '2026-12-02');
    assert.ok([...result.throughToday, ...result.nextWeek].every(t => t.person === name));
  }
  assert.equal(taskWindows(plan.tasks, 'David', '2026-11-19').throughToday.length, 0);
  assert.equal(taskWindows(plan.tasks, 'David', '2026-12-19').nextWeek.length, 0);
  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
});

test('dates follow the Cairo midnight boundary', () => {
  assert.equal(teamDate(new Date('2026-11-20T21:59:59Z')), '2026-11-20');
  assert.equal(teamDate(new Date('2026-11-20T22:00:00Z')), '2026-11-21');
});

test('technology edits round-trip in JSON without changing the shared baseline', () => {
  const changed = updateItem(validateArchitecture(baseline), 'system', 'nodes', 'storage', { technology: 'SQLite' });
  assert.equal(baseline.graphs.system.nodes.find(n => n.id === 'storage').technology, 'PostgreSQL');
  assert.deepEqual(validateArchitecture(JSON.parse(JSON.stringify(changed))), changed);
  assert.equal(changed.graphs.system.nodes.find(n => n.id === 'storage').technology, 'SQLite');
});

test('deleting a root component cleans up connections and its detail diagram', () => {
  const updated = deleteSelection(baseline, 'system', ['storage']);
  assert.equal(updated.graphs.storage, undefined);
  assert.ok(updated.graphs.system.edges.every(e => e.source !== 'storage' && e.target !== 'storage'));
  assert.deepEqual(validateArchitecture(updated), updated);
});

test('invalid imported or duplicate connections are rejected', () => {
  const graph = baseline.graphs.system;
  assert.equal(canConnect(graph, { source: 'backend', target: 'backend' }), false);
  const edge = graph.edges[0];
  assert.equal(canConnect(graph, { source: edge.source, target: edge.target, sourceHandle: edge.sourcePort, targetHandle: edge.targetPort }), false);
  const invalid = structuredClone(baseline);
  invalid.graphs.system.edges[0].target = 'missing';
  assert.throws(() => validateArchitecture(invalid), /invalid component/);
});

test('all published nodes have Arabic notes and drafts preserve Arabic edits and edge bends', () => {
  const document = validateArchitecture(baseline);
  const nodes = Object.values(document.graphs).flatMap(graph => graph.nodes);
  assert.ok(nodes.every(node => /\p{Script=Arabic}/u.test(node.noteAr)));
  let draft = updateItem(document, 'system', 'nodes', 'storage', { noteAr: 'شرح محدث للتخزين' });
  draft = updateItem(draft, 'system', 'edges', 'processing-storage', { bend: { x: 1020, y: 110 } });
  assert.deepEqual(validateArchitecture(JSON.parse(JSON.stringify(draft))), draft);
  delete draft.graphs.system.nodes[0].noteAr;
  assert.doesNotThrow(() => validateArchitecture(draft));
});

test('connections switch attachment sides as a component moves and ignore old detours', async () => {
  const { routeDiagram } = await import('../src/routing.js');
  const node = (id, x, y, noteHeight = 0) => ({ id, x, y, width: 100, height: 70, noteHeight });
  const edge = { id: 'first', source: 'a', target: 'b', sourcePort: 'right', targetPort: 'left', bend: { x: 800, y: 800 } };
  const first = routeDiagram([node('a', 0, 0), node('b', 300, 0)], [edge]).get('first');
  assert.deepEqual(first.points, [{ x: 102, y: 35 }, { x: 298, y: 35 }]);
  const reversed = routeDiagram([node('a', 0, 0), node('b', -300, 0)], [edge]).get('first');
  assert.equal(reversed.sourcePort, 'left');
  assert.equal(reversed.targetPort, 'right');
  assert.deepEqual(reversed.points, [{ x: -2, y: 35 }, { x: -198, y: 35 }]);
});

test('automatic routing clears both cards and Arabic notes and rejoins after overlap', async () => {
  const { routeDiagram, roundedPath } = await import('../src/routing.js');
  const node = (id, x, y, height = 70, noteHeight = 0) => ({ id, x, y, width: 100, height, noteHeight });
  const edge = { id: 'first', source: 'a', target: 'b', label: 'Jobs' };
  const blocked = node('c', 180, 55, 60, 35);
  const route = routeDiagram([node('a', 0, 0), node('b', 400, 0), blocked], [edge]).get('first');
  assert.ok(route.points.some(p => p.y < 10 || p.y > 115));
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1];
    const b = route.points[i];
    assert.ok(a.x === b.x || a.y === b.y);
    if (a.x === b.x && a.x > 180 && a.x < 280) {
      assert.ok(Math.max(a.y, b.y) <= 10 || Math.min(a.y, b.y) >= 115);
    } else if (a.y === b.y && a.y > 10 && a.y < 115) {
      assert.ok(Math.max(a.x, b.x) <= 180 || Math.min(a.x, b.x) >= 280);
    }
  }
  assert.match(roundedPath(route.points), /^M .* Q .* L /);
  const overlap = routeDiagram([node('a', 0, 0), node('b', 0, 0)], [edge]).get('first');
  assert.equal(overlap, null);
  assert.ok(routeDiagram([node('a', 0, 0), node('b', 160, 0)], [edge]).get('first'));
});

test('two-way flows have separate attachment points', async () => {
  const { routeDiagram } = await import('../src/routing.js');
  const nodes = [{ id: 'a', x: 0, y: 0, width: 100, height: 70 }, { id: 'b', x: 290, y: 0, width: 100, height: 70 }];
  const routes = routeDiagram(nodes, [{ id: 'go', source: 'a', target: 'b' }, { id: 'return', source: 'b', target: 'a' }]);
  assert.equal(routes.get('go').points.length, 2);
  assert.equal(routes.get('return').points.length, 2);
  assert.notEqual(routes.get('go').points[0].y, routes.get('return').points.at(-1).y);
});
