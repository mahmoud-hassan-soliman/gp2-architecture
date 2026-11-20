import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, ConnectionMode, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow } from '@xyflow/react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, CircuitBoard, GitFork, Layers3, Maximize, Network, PenLine, Plus, RotateCcw, X } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import './style.css';
import initial from './architecture.json';
import { Tasks } from './Tasks.jsx';
import { canConnect, CATEGORIES, changeGraph, deleteSelection, EDGE_KINDS, PORTS, ROOT, updateItem, validateArchitecture } from './model.js';

const STORAGE = 'gp2-architecture-draft-v2';
const EMPTY = { nodes: [], edges: [] };
const PORT_POSITIONS = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
const EDGE_COLORS = { data: '#83aeca', enrichment: '#bda1fb', control: '#f4b66e' };
const CATEGORY_LABELS = { gray: 'External', blue: 'Data', purple: 'Intelligence', teal: 'Application', amber: 'Operations' };
const TECH = { postgresql: 'postgresql', postgres: 'postgresql', python: 'python', fastapi: 'fastapi', react: 'react',
  docker: 'docker', 'docker compose': 'docker', linkedin: 'linkedin', 'github actions': 'githubactions' };
const ASSETS = import.meta.env.BASE_URL;
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const seeded = validateArchitecture(initial);

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? validateArchitecture(JSON.parse(raw)) : seeded;
  } catch { return seeded; }
}

function NodeCard({ data, selected }) {
  const mark = TECH[data.technology.trim().toLowerCase()];
  return (
    <div className={`node-card ${data.category} ${selected ? 'selected' : ''}`}>
      {PORTS.map(port => <Handle key={port} type="source" id={port} position={PORT_POSITIONS[port]} isConnectable={data.editing} />)}
      <span className="node-category"><span />{CATEGORY_LABELS[data.category]}</span>
      <strong>{data.label || 'Untitled component'}</strong>
      <span className="node-summary">{data.summary}</span>
      {data.technology && <span className="node-tech">
        {mark ? <img src={`${ASSETS}icons/${mark}.svg`} width="15" height="15" alt="" draggable={false} /> : <CircuitBoard size={14} />}
        {data.technology}
      </span>}
    </div>
  );
}

const nodeTypes = { card: NodeCard };

function Diagram({ graph, selection, editing, select, move, connect, reconnect, openDetails, scope }) {
  const movedDuringDrag = useRef({});
  const [positions, setPositions] = useState({});
  const validConnection = useCallback(connection => canConnect(graph, connection), [graph]);
  const nodes = useMemo(() => graph.nodes.map(node => ({
    id: node.id, type: 'card', position: positions[node.id] || { x: node.x, y: node.y },
    data: { ...node, editing }, selected: selection?.type === 'node' && node.id === selection.id,
    ariaLabel: node.label || 'Untitled component'
  })), [graph.nodes, positions, editing, selection]);
  const edges = useMemo(() => graph.edges.map(edge => ({
    id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourcePort, targetHandle: edge.targetPort,
    label: edge.label, className: 'nopan', type: 'smoothstep', pathOptions: { offset: edge.kind === 'enrichment' ? 43 : 19 }, selected: selection?.type === 'edge' && edge.id === selection.id,
    style: { stroke: EDGE_COLORS[edge.kind], strokeWidth: selection?.id === edge.id ? 3 : 1.7, strokeDasharray: edge.kind === 'control' ? '7 5' : undefined },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS[edge.kind], width: 19, height: 19 },
    labelStyle: { fill: '#c6d8e8', fontSize: 11 },
    labelBgStyle: { fill: '#101c2d', fillOpacity: .96 }, labelBgPadding: [5, 4], labelBgBorderRadius: 4,
    ariaLabel: edge.label || 'Unlabelled connection'
  })), [graph.edges, selection]);
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      colorMode="dark" connectionMode={ConnectionMode.Loose} nodesDraggable nodesConnectable={editing} autoPanOnNodeDrag={false} autoPanOnConnect={false}
      edgesReconnectable={editing} deleteKeyCode={null} multiSelectionKeyCode={null}
      selectionKeyCode={null} minZoom={0.16} maxZoom={2.5} fitView fitViewOptions={{ padding: '8%', maxZoom: scope === ROOT ? .95 : 1.12 }}
      isValidConnection={validConnection}
      onNodesChange={changes => {
        const positionChanges = changes.getByType('position').filter(c => c.position);
        positionChanges.filter(c => !c.dragging).forEach(c => move(c.id, c.position));
        const updates = Object.fromEntries(positionChanges.filter(c => c.dragging).map(c => [c.id, c.position]));
        if (Object.keys(updates).length) {
          movedDuringDrag.current = updates;
          setPositions(prev => ({ ...prev, ...updates }));
        }
      }}
      onNodeDragStop={(_, node) => {
        const point = movedDuringDrag.current[node.id] || node.position;
        move(node.id, point);
        movedDuringDrag.current = {};
        setPositions({});
      }}
      onNodeClick={(_, node) => select({ id: node.id, type: 'node' })}
      onNodeDoubleClick={(_, node) => openDetails(node.id)}
      onEdgeClick={(_, edge) => select({ id: edge.id, type: 'edge' })}
      onPaneClick={() => select(null)}
      onConnect={connect} onReconnect={reconnect} proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={23} size={1} color="#32445b" />
      <Controls position="bottom-left" showInteractive={false} />
      <FitButton />
    </ReactFlow>
  );
}

function FitButton() {
  const { fitView } = useReactFlow();
  return <button className="fit-button" onClick={() => fitView({ padding: '8%', duration: 180 })}><Maximize size={15} /> Fit diagram</button>;
}

function Inspector({ item, selection, editing, patch, remove, graph, details, openDetails, close }) {
  const isNode = selection?.type === 'node';
  const endpoint = id => graph.nodes.find(n => n.id === id)?.label || id;
  if (!item) return <aside className="inspector empty">
    <span className="side-icon"><CircuitBoard size={20} /></span>
    <h2>Inspect an element</h2>
    <p>Select a component or connection on the canvas to see its details.</p>
    {editing && <p>Drag between connection handles to link components.</p>}
  </aside>;
  return <aside className="inspector">
    <div className="inspector-header"><span>{isNode ? 'Component' : 'Connection'}</span><button className="icon-button" onClick={close} aria-label="Close inspector"><X size={18} /></button></div>
    <h2>{isNode ? item.label || 'Untitled component' : item.label || 'Unlabelled connection'}</h2>
    {!isNode && <p className="endpoints">{endpoint(item.source)} <ChevronRight size={13} /> {endpoint(item.target)}</p>}
    {editing ? <div className="fields">
      <label>Name<input value={item.label} maxLength={90} onChange={e => patch({ label: e.target.value })} /></label>
      {isNode ? <>
        <label>Technology<input list="technologies" value={item.technology} maxLength={80} placeholder="Choose or type a technology" onChange={e => patch({ technology: e.target.value })} /></label>
        <datalist id="technologies">{['PostgreSQL', 'Python', 'FastAPI', 'React', 'Docker', 'Docker Compose', 'GitHub Actions', 'LinkedIn'].map(name => <option key={name} value={name} />)}</datalist>
        <label>Category<select value={item.category} onChange={e => patch({ category: e.target.value })}>{CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></label>
        <label>Summary<textarea rows={2} value={item.summary} maxLength={200} onChange={e => patch({ summary: e.target.value })} /></label>
        <label>Details<textarea rows={4} value={item.notes} maxLength={3000} onChange={e => patch({ notes: e.target.value })} /></label>
      </> : <>
        <label>Flow type<select value={item.kind} onChange={e => patch({ kind: e.target.value })}>{EDGE_KINDS.map(k => <option key={k}>{k}</option>)}</select></label>
        <label>From<select value={item.source} onChange={e => patch({ source: e.target.value })}>{graph.nodes.filter(n => n.id !== item.target).map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
        <label>To<select value={item.target} onChange={e => patch({ target: e.target.value })}>{graph.nodes.filter(n => n.id !== item.source).map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
      </>}
      <button className="danger" onClick={remove}>Delete {isNode ? 'component' : 'connection'}</button>
    </div> : isNode ? <>
      {item.technology && <span className="technology"><CircuitBoard size={15} /> {item.technology}</span>}
      <p>{item.summary}</p>{item.notes && <p className="notes">{item.notes}</p>}
    </> : <p className="technology">{item.kind} flow</p>}
    {isNode && details && <button className="open-layer" onClick={openDetails}><Layers3 size={16} /> Open layer diagram <ChevronRight size={16} /></button>}
  </aside>;
}

function App() {
  const [doc, setDoc] = useState(loadDraft);
  const [page, setPage] = useState(() => location.hash === '#architecture' ? 'architecture' : 'home');
  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState(ROOT);
  const [selection, setSelection] = useState(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const file = useRef(null);
  const graph = doc.graphs[scope] || EMPTY;
  const layer = doc.graphs[ROOT].nodes.find(n => n.id === scope);
  const active = selection && (selection.type === 'node' ? graph.nodes : graph.edges).find(item => item.id === selection.id);
  const layerNames = doc.graphs[ROOT].nodes.filter(node => doc.graphs[node.id]);
  const matches = search.trim() ? Object.entries(doc.graphs).flatMap(([location, branch]) => branch.nodes.filter(n =>
    (n.label + ' ' + n.technology).toLowerCase().includes(search.trim().toLowerCase()))
    .map(n => ({ node: n, scope: location }))).slice(0, 9) : [];
  useEffect(() => {
    try {
      if (doc === seeded) localStorage.removeItem(STORAGE);
      else localStorage.setItem(STORAGE, JSON.stringify(doc));
    } catch { setStatus('This browser could not save the draft. Export JSON before closing.'); }
  }, [doc]);

  useEffect(() => {
    const handleHash = () => setPage(location.hash === '#architecture' ? 'architecture' : 'home');
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  function switchPage(next) {
    setPage(next);
    location.hash = next === 'architecture' ? 'architecture' : 'home';
  }

  function go(next, nextSelection = null) {
    if (!doc.graphs[next]) return;
    setScope(next); setSelection(nextSelection); setSearch('');
  }

  function addComponent() {
    const x = Math.round((graph.nodes.length ? (Math.min(...graph.nodes.map(n => n.x))) : 0) / 5) * 5;
    const y = graph.nodes.length ? Math.max(...graph.nodes.map(n => n.y)) + 190 : 0;
    const node = { id: uid('component'), label: 'New component', summary: '', technology: '', category: layer?.category || 'blue', x, y, notes: '' };
    setDoc(d => changeGraph(d, scope, g => ({ ...g, nodes: [...g.nodes, node] })));
    setSelection({ type: 'node', id: node.id });
    setStatus('Component created. Use Fit diagram if it is outside your current view.');
  }

  function connect(c) {
    if (!canConnect(graph, c)) return;
    const edge = { id: uid('edge'), source: c.source, target: c.target, label: '', kind: 'data',
      sourcePort: c.sourceHandle || 'right', targetPort: c.targetHandle || 'left' };
    setDoc(d => changeGraph(d, scope, g => ({ ...g, edges: [...g.edges, edge] })));
    setSelection({ type: 'edge', id: edge.id });
  }

  function reconnect(edge, c) {
    if (!canConnect(graph, c, edge.id)) return;
    setDoc(d => updateItem(d, scope, 'edges', edge.id, {
      source: c.source, target: c.target, sourcePort: c.sourceHandle || 'right', targetPort: c.targetHandle || 'left'
    }));
  }

  async function importDraft(event) {
    const input = event.target;
    const selectedFile = input.files?.[0];
    input.value = '';
    if (!selectedFile) return;
    try {
      if (selectedFile.size > 2_000_000) throw new Error('The file is too large.');
      const next = validateArchitecture(JSON.parse(await selectedFile.text()));
      if (!window.confirm('Replace the current browser draft with this architecture? Export your draft first if you want to keep it.')) return;
      setDoc(next); setScope(ROOT); setSelection(null); setSearch(''); setStatus('Architecture imported.');
    } catch (error) { setStatus(`Import failed. ${error.message}`); }
  }

  function exportDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'gp2-architecture.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Architecture JSON exported.');
  }

  function addDetail() {
    if (!active || scope !== ROOT) return;
    setDoc(d => ({ ...d, graphs: { ...d.graphs, [active.id]: EMPTY } }));
    setScope(active.id); setSelection(null);
  }

  function removeActive() {
    if (!selection) return;
    const removeNode = selection.type === 'node';
    const hasDetails = removeNode && scope === ROOT && doc.graphs[selection.id];
    if (hasDetails && !window.confirm('Delete this component, its connections and its layer diagram from your draft?')) return;
    setDoc(d => deleteSelection(d, scope, removeNode ? [selection.id] : [], removeNode ? [] : [selection.id]));
    setSelection(null);
  }

  return <>
    <header className="top">
      <div className="brand"><img src={`${ASSETS}mark.svg`} alt="" width="38" height="38" /><div><strong>GP2 Architecture</strong><span>Arab Tech Job Market Analysis Platform</span></div></div>
      <nav className="main-nav" aria-label="Primary navigation">
        <button className={page === 'home' ? 'active' : ''} aria-current={page === 'home' ? 'page' : undefined} onClick={() => switchPage('home')}>Home</button>
        <button className={page === 'architecture' ? 'active' : ''} aria-current={page === 'architecture' ? 'page' : undefined} onClick={() => switchPage('architecture')}>Architecture</button>
      </nav>
      {page === 'architecture' && <div className="actions">
        <button className="secondary" onClick={() => file.current?.click()}><ArrowUpFromLine size={16} /> Import JSON</button>
        <input type="file" ref={file} accept=".json,application/json" onChange={importDraft} hidden />
        <button className="secondary" onClick={exportDraft}><ArrowDownToLine size={16} /> Export JSON</button>
        <button className={editing ? 'secondary editing' : 'primary'} onClick={() => { setEditing(!editing); setStatus(''); }} aria-pressed={editing}><PenLine size={16} />{editing ? 'Done editing' : 'Edit diagram'}</button>
      </div>}
    </header>
    {page === 'home' ? <Tasks openArchitecture={() => switchPage('architecture')} /> : <main>
      <div className="heading">
        <nav aria-label="Breadcrumb"><button onClick={() => go(ROOT)}>Architecture</button><ChevronRight size={14} /><span>{scope === ROOT ? 'System overview' : layer?.label}</span></nav>
        <div className="title-line"><h1>{layer?.label || 'System overview'}</h1>{editing && <button className="primary" onClick={addComponent}><Plus size={16} /> Add component</button>}</div>
        <p>{layer?.summary || 'Follow the data from job sources to market intelligence.'}</p>
      </div>
      <div className="workspace">
        <aside className="layers" aria-label="Layer diagrams">
          <label className="search"><span className="sr-only">Search components or technologies</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search diagrams…" /></label>
          {search.trim() ? <div className="layer-list">
            {matches.length ? matches.map(m => <button className="layer-button" key={m.scope + '/' + m.node.id} onClick={() => go(m.scope, { id: m.node.id, type: 'node' })}>{m.node.label}</button>) : <p className="no-match">No matching components</p>}
          </div> : <div className="layer-list">
            <button className={`layer-button ${scope === ROOT ? 'current' : ''}`} onClick={() => go(ROOT)}><Network size={16} /> System overview</button>
            {layerNames.map(node => <button className={`layer-button ${scope === node.id ? 'current' : ''}`} key={node.id} onClick={() => go(node.id)}><span className={`layer-dot ${node.category}`} /> {node.label}</button>)}
          </div>}
        </aside>
        <section className={`canvas ${editing ? 'is-editing' : ''}`} aria-label="Architecture diagram">
          <div className="canvas-mode"><span />Drag a component to move it · Drag empty space to pan</div>
          <Diagram key={scope} scope={scope} graph={graph} selection={selection} editing={editing} select={setSelection}
            move={(id, { x, y }) => setDoc(d => {
              const node = d.graphs[scope].nodes.find(n => n.id === id);
              return !node || (node.x === x && node.y === y) ? d : updateItem(d, scope, 'nodes', id, { x, y });
            })}
            connect={connect} reconnect={reconnect} openDetails={id => { if (scope === ROOT) go(id); }} />
          {graph.nodes.length === 0 && <p className="empty-canvas">This layer is empty. {editing ? 'Add a component to get started.' : 'Switch to Edit diagram to add a component.'}</p>}
        </section>
        <div className="side">
          <Inspector key={selection?.type + '/' + selection?.id} item={active} selection={selection} editing={editing} graph={graph}
            patch={fields => setDoc(d => updateItem(d, scope, selection.type === 'node' ? 'nodes' : 'edges', active.id, fields))}
            remove={removeActive} details={scope === ROOT && active && doc.graphs[active.id]}
            openDetails={() => go(active.id)} close={() => setSelection(null)} />
          {editing && scope === ROOT && active && selection?.type === 'node' && !doc.graphs[active.id] &&
            <button className="open-layer" onClick={addDetail}><GitFork size={16} /> Create layer diagram</button>}
        </div>
      </div>
      <footer>
        <div className="legend"><span><i className="data" /> Data flow</span><span><i className="enrichment" /> Enrichment</span><span><i className="control" /> Control flow</span></div>
        <span role="status">{status || (editing ? 'Drafts save in this browser. Export JSON to share changes.' : 'Component positions save in this browser.')}</span>
        {editing && <button className="reset" onClick={() => {
          if (window.confirm('Reset your local draft to the published architecture? Export your draft first if you want to keep it.')) {
            setDoc(seeded); setScope(ROOT); setSelection(null); setSearch(''); setStatus('Published baseline restored.');
          }
        }}><RotateCcw size={14} /> Reset draft</button>}
      </footer>
    </main>}
  </>;
}

import { createRoot } from 'react-dom/client';
createRoot(document.getElementById('root')).render(<App />);
