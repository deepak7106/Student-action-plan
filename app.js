const STORAGE_KEY = 'student-action-planner.tasks.v1';
const categoryLabels = { critical: 'Critical', attention: 'Needs attention', ahead: 'Plan ahead', later: 'Later' };
const taskList = document.querySelector('#taskList');
let activeFilter = 'all';
let lastModalTrigger = null;

function dateAtMidnight(value) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateInputFromToday(offset) {
  const date = dateAtMidnight(new Date());
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function defaultTasks() {
  return [
    { id: 1, name: 'Physics Assignment', subject: 'Physics · Problem set', deadline: dateInputFromToday(1), importance: 'high', duration: 120, difficulty: 'hard', progress: 0, action: 'Complete Questions 1–5.', blockedBy: '', subtasks: [] },
    { id: 2, name: 'AI Seminar Research', subject: 'Artificial Intelligence · Research', deadline: dateInputFromToday(3), importance: 'high', duration: 60, difficulty: 'medium', progress: 25, action: 'Find and save 3 credible sources.', blockedBy: '', subtasks: [] },
    { id: 3, name: 'Mathematics — Chapter 1', subject: 'Mathematics · Revision', deadline: dateInputFromToday(5), importance: 'medium', duration: 90, difficulty: 'medium', progress: 0, action: 'Review worked examples on page 12.', blockedBy: '', subtasks: [] },
    { id: 4, name: 'Project Report', subject: 'Final Year Project · Writing', deadline: dateInputFromToday(8), importance: 'high', duration: 180, difficulty: 'hard', progress: 15, action: 'Write the problem statement section.', blockedBy: '', subtasks: [], breakdown: true },
    { id: 5, name: 'Read UX article', subject: 'Design · Reading', deadline: dateInputFromToday(12), importance: 'low', duration: 30, difficulty: 'easy', progress: 0, action: 'Read the first 5 pages.', blockedBy: '', subtasks: [] },
    { id: 6, name: 'Submit lab notes', subject: 'Chemistry · Admin', deadline: dateInputFromToday(14), importance: 'medium', duration: 30, difficulty: 'easy', progress: 60, action: 'Add the final observation photo.', blockedBy: '', subtasks: [] }
  ];
}

function normalizeTask(task) {
  return { ...task, id: task.id || Date.now() + Math.random(), duration: Number(task.duration) || 30, progress: Math.max(0, Math.min(100, Number(task.progress) || 0)), importance: task.importance || 'medium', difficulty: task.difficulty || 'medium', subtasks: Array.isArray(task.subtasks) ? task.subtasks : [], blockedBy: task.blockedBy || '' };
}

function loadTasks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultTasks().map(normalizeTask);
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(normalizeTask) : defaultTasks().map(normalizeTask);
  } catch (error) {
    console.warn('Unable to load saved tasks; using defaults.', error);
    return defaultTasks().map(normalizeTask);
  }
}

let tasks = loadTasks();

function saveTasks() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (error) { console.warn('Unable to save tasks.', error); }
}

function scoreTask(task) {
  const today = dateAtMidnight(new Date());
  const deadline = dateAtMidnight(task.deadline);
  const days = Math.ceil((deadline - today) / 86400000);
  const factors = [];
  let score = 0;
  if (days < 0) { score += 45; factors.push('Overdue'); }
  else if (days === 0) { score += 40; factors.push('Due today'); }
  else if (days === 1) { score += 35; factors.push('Due tomorrow'); }
  else if (days <= 3) { score += 25; factors.push(`Due in ${days} days`); }
  else if (days <= 7) { score += 15; factors.push(`Due in ${days} days`); }
  else { score += 5; factors.push('Deadline has breathing room'); }
  const importancePoints = { high: 25, medium: 15, low: 5 }[task.importance] || 15;
  score += importancePoints;
  factors.push(`${task.importance[0].toUpperCase()}${task.importance.slice(1)} importance`);
  score += task.duration >= 180 ? 10 : task.duration >= 90 ? 7 : task.duration >= 60 ? 4 : 2;
  if (task.duration >= 90) factors.push(`${task.duration} minutes of work`);
  score += { hard: 10, medium: 6, easy: 2 }[task.difficulty] || 6;
  if (task.difficulty === 'hard') factors.push('Hard difficulty');
  if (task.progress === 0) { score += 8; factors.push('Not started'); }
  else if (task.progress < 50) { score += 4; factors.push('Still in early progress'); }
  if (task.blockedBy) { score += 8; factors.push('Blocks another task'); }
  const category = score >= 78 ? 'critical' : score >= 58 ? 'attention' : score >= 35 ? 'ahead' : 'later';
  return { score, category, explanation: factors.slice(0, 4), days };
}

function enrichTasks() { tasks.forEach(task => Object.assign(task, scoreTask(task))); }
function make(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function formatDeadline(dateString) { const { days } = scoreTask({ deadline: dateString, importance: 'low', duration: 30, difficulty: 'easy', progress: 100 }); if (days < 0) return 'Overdue'; if (days === 0) return 'Today'; if (days === 1) return 'Tomorrow'; return `In ${days} days`; }
function formatDuration(minutes) { return minutes >= 60 ? `${minutes / 60}h` : `${minutes} min`; }

function makeSubtasks(task) {
  const templates = [['Define the first concrete step', 20], ['Gather notes and useful sources', 30], ['Complete the main working section', 45], ['Review and polish the result', 20]];
  const count = task.duration >= 180 ? 4 : task.duration >= 90 ? 3 : 2;
  let remaining = Math.max(task.duration - 15, 20);
  return templates.slice(0, count).map(([title, minutes], index, list) => { const share = index === list.length - 1 ? Math.max(15, remaining) : Math.min(minutes, Math.max(15, remaining - (list.length - index - 1) * 15)); remaining -= share; return { id: `${task.id}-${index}`, title, minutes: share, completed: false }; });
}

function buildTaskCard(task, index) {
  const card = make('article', `task-card ${task.category}${task.progress >= 100 ? ' done' : ''}`); card.style.animationDelay = `${index * 70}ms`;
  const top = make('div', 'task-top'); top.append(make('span', 'priority-pip')); const heading = make('div'); heading.append(make('h3', 'task-title', task.name), make('p', 'task-subject', task.subject)); top.append(heading, make('span', 'priority-badge', categoryLabels[task.category])); card.append(top);
  const details = make('div', 'task-details'); details.append(make('span', '', `◷ ${formatDeadline(task.deadline)}`), make('span', '', `◒ ${formatDuration(task.duration)}`), make('span', '', `◈ ${task.difficulty[0].toUpperCase()}${task.difficulty.slice(1)}`)); card.append(details);
  const reason = make('div', 'task-reason'); reason.append(make('strong', '', `Priority score ${task.score}: `), document.createTextNode(task.explanation.join(' · '))); card.append(reason);
  if (task.subtasks.length) { const subtaskList = make('div', 'subtask-list'); task.subtasks.forEach(subtask => { const label = make('label', 'subtask-row'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = subtask.completed; checkbox.setAttribute('aria-label', `Complete ${subtask.title}`); checkbox.addEventListener('change', () => { subtask.completed = checkbox.checked; task.progress = Math.round(task.subtasks.filter(item => item.completed).length / task.subtasks.length * 100); saveTasks(); renderAll(); }); label.append(checkbox, make('span', '', `${subtask.title} · ${subtask.minutes} min`)); subtaskList.append(label); }); card.append(subtaskList); }
  const bottom = make('div', 'task-bottom'); const progressLine = make('div', 'progress-line'); const progress = make('span'); progress.style.width = `${task.progress}%`; progressLine.append(progress); bottom.append(progressLine, make('span', 'progress-text', `${task.progress}% complete`)); if (task.progress < 100) { const start = make('button', 'start-small', 'Start task →'); start.addEventListener('click', () => activateTask(task.id)); bottom.append(start); } card.append(bottom);
  return card;
}

function renderTasks() { enrichTasks(); const visible = tasks.filter(task => activeFilter === 'all' || task.category === activeFilter).sort((a, b) => b.score - a.score); taskList.replaceChildren(...visible.map(buildTaskCard)); }
function renderStats() {
  const incomplete = tasks.filter(task => task.progress < 100); const attention = incomplete.filter(task => task.category === 'critical' || task.category === 'attention'); const overdue = incomplete.filter(task => task.days < 0); const workload = incomplete.reduce((sum, task) => sum + Math.round(task.duration * (1 - task.progress / 100)), 0); const completion = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length) : 0;
  document.querySelector('#taskTotal').textContent = `${tasks.length} tasks`; document.querySelector('#navTaskCount').textContent = tasks.length; document.querySelector('#attentionTotal').textContent = `${attention.length} need attention`; document.querySelector('#upcomingTotal').textContent = `${incomplete.filter(task => task.days >= 0).length} upcoming`; document.querySelector('#workloadTotal').textContent = `${Math.floor(workload / 60)}h ${workload % 60}m`; document.querySelector('#completedCount').textContent = tasks.filter(task => task.progress >= 100).length; document.querySelector('#remainingCount').textContent = incomplete.length; document.querySelector('#overdueCount').textContent = overdue.length; document.querySelector('#completionRate').textContent = `${completion}%`; document.querySelector('#completionRing').replaceChildren(document.createTextNode(String(completion)), make('small', '', '%')); document.querySelector('.progress-ring').style.background = `conic-gradient(var(--blue) ${completion}%, #e9edfa 0)`;
}
function renderNextAction() { const task = tasks.filter(item => item.progress < 100).sort((a, b) => b.score - a.score)[0]; if (!task) return; document.querySelector('#nextActionTitle').textContent = `Start your ${task.name}`; document.querySelector('#nextActionDescription').textContent = task.action; const meta = document.querySelector('.action-meta'); meta.replaceChildren(make('span', '', `◷ ${formatDuration(task.duration)}`), make('span', '', `↗ ${task.difficulty === 'hard' ? 'Focused work' : 'Easy momentum'}`)); document.querySelector('.next-progress span').style.width = `${Math.max(task.progress, 17)}%`; const start = document.querySelector('#startNext'); start.dataset.start = task.id; start.disabled = false; }
function renderUpcoming() { const list = document.querySelector('#deadlineList'); const upcoming = tasks.filter(task => task.progress < 100).sort((a, b) => dateAtMidnight(a.deadline) - dateAtMidnight(b.deadline)).slice(0, 4); list.replaceChildren(...upcoming.map(task => { const item = make('div', `deadline-item${task.days <= 1 ? ' urgent' : ''}`); item.append(make('span', 'deadline-dot')); const copy = make('div'); copy.append(make('strong', '', task.name), make('span', '', formatDeadline(task.deadline))); item.append(copy, make('b', '', task.days < 0 ? 'late' : `${task.days}d`)); return item; })); }
function renderAll() { enrichTasks(); renderTasks(); renderStats(); renderNextAction(); renderUpcoming(); }

function activateTask(id) { const task = tasks.find(item => String(item.id) === String(id)); if (!task) return; task.progress = Math.min(100, task.progress + 25); if (task.progress >= 100) task.subtasks.forEach(subtask => { subtask.completed = true; }); saveTasks(); renderAll(); showToast(task.progress >= 100 ? `${task.name} completed.` : `${task.name} is now active.`); }
function timeLabel(totalMinutes) { const hour = 9 + Math.floor(totalMinutes / 60); const minute = totalMinutes % 60; return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; }
function addPlanRow(parent, start, duration, name, isBreak) { const row = make('div', isBreak ? 'break-row' : ''); row.append(make('b', '', `${timeLabel(start)} – ${timeLabel(start + duration)}`), make('span', '', name)); parent.append(row); }
function renderPlan() { const result = document.querySelector('#planResult'); result.replaceChildren(); const available = Math.max(15, Number(document.querySelector('#availableTime').value) || 0); const queue = tasks.filter(task => task.progress < 100).sort((a, b) => b.score - a.score); let used = 0; let cursor = 0; let scheduled = 0; queue.forEach(task => { const remaining = Math.round(task.duration * (1 - task.progress / 100)); const block = Math.min(remaining, available - used); if (block < 15) return; if (scheduled > 0) { if (used + 15 + block > available) return; addPlanRow(result, cursor, 15, 'Break', true); cursor += 15; used += 15; } addPlanRow(result, cursor, block, task.name, false); cursor += block; used += block; scheduled += 1; }); if (!scheduled) result.append(make('p', 'plan-empty', 'No incomplete task fits in this time window. Try adding more time or finishing a smaller task.')); }
function showToast(message) { const toast = document.querySelector('#toast'); toast.querySelector('p').textContent = message; toast.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2800); }
function setModal(open, trigger) { const modal = document.querySelector('#taskModal'); modal.classList.toggle('open', open); modal.setAttribute('aria-hidden', String(!open)); if (open) { lastModalTrigger = trigger || document.querySelector('#openAddTask'); document.querySelector('#taskName').focus(); } else if (lastModalTrigger) lastModalTrigger.focus(); }
function setView(view) { document.body.dataset.view = view; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view)); const taskHeading = document.querySelector('.main-column > .section-heading'); const taskCards = document.querySelector('.task-list'); const next = document.querySelector('#nextActionPanel'); const progress = document.querySelector('.progress-section'); const right = document.querySelector('.right-column'); taskHeading.classList.toggle('view-hidden', view === 'calendar' || view === 'insights'); taskCards.classList.toggle('view-hidden', view === 'calendar' || view === 'insights'); next.classList.toggle('view-hidden', view !== 'overview'); progress.classList.toggle('view-hidden', view === 'calendar' || view === 'tasks'); right.classList.toggle('view-hidden', view === 'tasks' || view === 'insights'); if (view === 'calendar') renderPlan(); }

document.querySelector('#startNext').addEventListener('click', event => activateTask(event.currentTarget.dataset.start));
document.querySelector('#generatePlan').addEventListener('click', () => { renderPlan(); showToast('Your day is mapped out.'); });
document.querySelector('#filterButton').addEventListener('click', event => { const filters = ['all', 'critical', 'attention', 'ahead', 'later']; activeFilter = filters[(filters.indexOf(activeFilter) + 1) % filters.length]; event.currentTarget.replaceChildren(document.createTextNode(activeFilter === 'all' ? 'All tasks' : categoryLabels[activeFilter]), make('span', '', '⌄')); renderTasks(); });
document.querySelector('#openAddTask').addEventListener('click', event => setModal(true, event.currentTarget)); document.querySelector('#closeModal').addEventListener('click', () => setModal(false)); document.querySelector('#cancelModal').addEventListener('click', () => setModal(false)); document.querySelector('#taskModal').addEventListener('click', event => { if (event.target.id === 'taskModal') setModal(false); }); document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.querySelector('#taskModal').classList.contains('open')) setModal(false); });
document.querySelector('#taskForm').addEventListener('submit', event => { event.preventDefault(); const form = new FormData(event.currentTarget); const task = normalizeTask({ id: Date.now(), name: form.get('name'), subject: form.get('subject'), deadline: form.get('deadline'), importance: form.get('importance'), duration: Number(form.get('duration')), difficulty: form.get('difficulty'), progress: Number(form.get('progress')), action: form.get('description') || 'Break this task into the first 20-minute step.', blockedBy: '', subtasks: [] }); if (form.get('breakdown') || task.duration >= 180) task.subtasks = makeSubtasks(task); tasks.push(task); saveTasks(); renderAll(); setModal(false); event.currentTarget.reset(); showToast('Task added to your action plan.'); });
document.querySelector('#mobileMenu').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open')); document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => { setView(item.dataset.view); document.querySelector('#sidebar').classList.remove('open'); }));

const currentDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
document.querySelector('#currentDate').textContent = currentDate.toUpperCase();
enrichTasks(); renderAll(); renderPlan();