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
