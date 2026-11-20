import { useEffect, useState } from 'react';
import { CalendarDays, ClipboardCheck, ListChecks } from 'lucide-react';
import plan from './team-plan.json';
import { addDays, dateLabel, taskWindows, teamDate } from './task-model.js';

const PROGRESS_KEY = 'gp2-team-checkmarks-v1';
const PERSON_KEY = 'gp2-task-profile-v1';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

function TaskSection({ title, description, icon, tasks, checks, toggle, empty }) {
  const completed = tasks.filter(task => checks[task.id] === true).length;
  return <section className="task-section">
    <div className="task-section-header"><div className="task-section-title">{icon}<div><h2>{title}</h2><p>{description}</p></div></div><span className="task-progress">{completed}/{tasks.length} complete</span></div>
    {tasks.length ? <ul className="tasks">
      {tasks.map(task => <li key={task.id} className={checks[task.id] === true ? 'complete' : ''}>
        <label className="task-check">
          <input type="checkbox" checked={checks[task.id] === true} onChange={e => toggle(task.id, e.target.checked)} />
          <span className="task-text">
            <span className="task-meta"><span>{task.id}</span><time dateTime={task.date}>{dateLabel(task.date)}</time><span>{task.hours} h</span></span>
            <strong>{task.action}</strong>
            <span className="task-evidence">{task.evidence}</span>
          </span>
        </label>
      </li>)}
    </ul> : <p className="no-tasks">{empty}</p>}
  </section>;
}

export function Tasks({ openArchitecture }) {
  const [today, setToday] = useState(() => teamDate());
  const [person, setPerson] = useState(() => {
    const saved = read(PERSON_KEY);
    return plan.people.some(p => p.name === saved) ? saved : plan.people[0].name;
  });
  const [checks, setChecks] = useState(() => {
    const saved = read(PROGRESS_KEY);
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  });
  const [problem, setProblem] = useState(false);
  useEffect(() => {
    const refresh = () => setToday(teamDate());
    const timer = setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    refresh();
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  function choose(value) {
    setPerson(value);
    if (!write(PERSON_KEY, value)) setProblem(true);
  }
  function toggle(id, done) {
    const next = { ...checks, [id]: done };
    setChecks(next);
    if (!write(PROGRESS_KEY, next)) setProblem(true);
  }
  const { throughToday, nextWeek } = taskWindows(plan.tasks, person, today);

  return <main className="tasks-page">
    <section className="tasks-hero">
      <div>
        <h1>My tasks</h1>
        <p>{dateLabel(today, true)} · Cairo time</p>
      </div>
      <button className="secondary" onClick={openArchitecture}>Open architecture</button>
    </section>
    <div className="person-bar">
      <label>Team member<select value={person} onChange={e => choose(e.target.value)}>
        {plan.people.map(member => <option key={member.name} value={member.name}>{member.name}</option>)}
      </select></label>
      <span>{plan.people.find(p => p.name === person)?.role}</span>
      <p role="status">{problem ? 'Browser storage is unavailable. Checkmarks may clear when you leave.' : 'Checkmarks save in this browser.'}</p>
    </div>
    <div className="task-columns">
      <TaskSection title="Due through today" description={`From ${dateLabel(plan.start)} through today`}
        icon={<ClipboardCheck size={21} />} tasks={throughToday} checks={checks} toggle={toggle}
        empty="Nothing is due yet for this team member." />
      <TaskSection title="Next 7 days" description={`${dateLabel(addDays(today, 1))} – ${dateLabel(addDays(today, 7))}`}
        icon={<CalendarDays size={21} />} tasks={nextWeek} checks={checks} toggle={toggle}
        empty={today >= plan.end ? 'The current plan has no later scheduled tasks.' : 'No tasks scheduled in this window.'} />
    </div>
    <p className="plan-range"><ListChecks size={16} /> Project schedule · {dateLabel(plan.start, true)} – {dateLabel(plan.end, true)}</p>
  </main>;
}
