export const PORTS = ['top', 'right', 'bottom', 'left'];
export const CATEGORIES = ['gray', 'blue', 'purple', 'teal', 'amber'];
export const EDGE_KINDS = ['data', 'enrichment', 'control'];
export const ROOT = 'system';
const KEY = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const fail = message => { throw new Error(message); };

function identifier(value, context) {
  return typeof value === 'string' && KEY.test(value) ? value : fail(`Invalid ${context} ID.`);
}

function note(value, limit) {
  if (typeof value !== 'string' || value.length > limit) fail('A text field is missing or too long.');
  return value;
}

function choice(value, choices) {
  if (!choices.includes(value)) fail('An unsupported color, connection type or port was used.');
  return value;
}

function coord(n) {
  if (!Number.isFinite(n) || Math.abs(n) > 100000) fail('A component has invalid coordinates.');
  return n;
}

export function validateArchitecture(input) {
  if (input?.version !== 1 || typeof input.graphs !== 'object' || !input.graphs || Array.isArray(input.graphs)) {
    fail('Select a GP2 Architecture JSON export using format version 1.');
  }
  const entries = Object.entries(input.graphs);
  if (!Object.hasOwn(input.graphs, ROOT) || entries.length > 250) fail('The file must have a system overview.');
  const graphs = Object.fromEntries(entries.map(([key, graph]) => {
    identifier(key, 'layer');
    if (!Array.isArray(graph?.nodes) || graph.nodes.length > 500 || !Array.isArray(graph?.edges) || graph.edges.length > 2000) fail('Invalid diagram.');
    const nodeIds = new Set();
    const edgeIds = new Set();
    const nodes = graph.nodes.map(n => {
      const id = identifier(n?.id, 'component');
      if (nodeIds.has(id)) fail('Component IDs must be unique within a diagram.');
      nodeIds.add(id);
      return { id, label: note(n.label, 90), summary: note(n.summary, 200), technology: note(n.technology, 80),
        category: choice(n.category, CATEGORIES), x: coord(n.x), y: coord(n.y), notes: note(n.notes, 3000) };
    });
    const edges = graph.edges.map(e => {
      const id = identifier(e?.id, 'connection');
      if (edgeIds.has(id)) fail('Connection IDs must be unique within a diagram.');
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target) || e.source === e.target) fail('A connection points to an invalid component.');
      edgeIds.add(id);
      return { id, source: e.source, target: e.target, label: note(e.label, 90), kind: choice(e.kind, EDGE_KINDS),
        sourcePort: choice(e.sourcePort, PORTS), targetPort: choice(e.targetPort, PORTS) };
    });
    return [key, { nodes, edges }];
  }));
  const topIds = new Set(graphs.system.nodes.map(n => n.id));
  if (entries.some(([key]) => key !== ROOT && !topIds.has(key))) fail('A detail diagram has no matching component in the overview.');
  return { version: 1, graphs };
}

export function deleteSelection(doc, scope, nodeIds = [], edgeIds = []) {
  const graph = doc.graphs[scope];
  const removed = new Set(nodeIds);
  const connections = new Set(edgeIds);
  const graphs = { ...doc.graphs, [scope]: {
    nodes: graph.nodes.filter(n => !removed.has(n.id)),
    edges: graph.edges.filter(e => !removed.has(e.source) && !removed.has(e.target) && !connections.has(e.id))
  } };
  if (scope === ROOT) for (const id of removed) delete graphs[id];
  return { ...doc, graphs };
}

export function changeGraph(doc, scope, update) {
  return { ...doc, graphs: { ...doc.graphs, [scope]: update(doc.graphs[scope]) } };
}

export function updateItem(doc, scope, collection, id, patch) {
  return changeGraph(doc, scope, graph => ({
    ...graph, [collection]: graph[collection].map(item => item.id === id ? { ...item, ...patch } : item)
  }));
}

export function canConnect(graph, c, ignoreId) {
  return Boolean(c.source && c.target && c.source !== c.target &&
    graph.nodes.some(n => n.id === c.source) && graph.nodes.some(n => n.id === c.target) &&
    !graph.edges.some(e => e.id !== ignoreId && e.source === c.source && e.target === c.target &&
      e.sourcePort === c.sourceHandle && e.targetPort === c.targetHandle));
}
