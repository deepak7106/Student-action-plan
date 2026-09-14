const SUPABASE_URL = 'https://cotvenegsxfixgewkvyx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0h84BTWKfzygczbJSxuKUA_iEIBOeNi';
const STORAGE_KEY_PREFIX = 'student-action-planner.tasks.v1';
const supabaseClient = SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const categoryLabels = { critical: 'Critical', attention: 'Needs attention', ahead: 'Plan ahead', later: 'Later' };
const taskList = document.querySelector('#taskList');
let activeFilter = 'all';
let lastModalTrigger = null;
let recommendationOffset = 0;
const THEME_STORAGE_KEY = 'student-action-planner.theme';
const PREFERENCES_STORAGE_KEY = 'student-action-planner.preferences';
let preferences = { availableMinutes: 270, dayStart: '09:00', autoBreakdown: true, browserReminders: false };

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

let tasks = [];
let currentUser = null;

function saveTasks() {
  try {
    if (!currentUser) return;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}.${currentUser.id}`, JSON.stringify(tasks));
    if (supabaseClient) supabaseClient.from('user_plans').upsert({ user_id: currentUser.id, data: tasks }, { onConflict: 'user_id' }).then(({ error }) => { if (error) console.warn('Unable to sync tasks to Supabase.', error); });
  } catch (error) { console.warn('Unable to save tasks.', error); }
}

function preferencesStorageKey() { return currentUser ? `${PREFERENCES_STORAGE_KEY}.${currentUser.id}` : PREFERENCES_STORAGE_KEY; }
function savePreferences() { try { localStorage.setItem(preferencesStorageKey(), JSON.stringify(preferences)); } catch (error) { console.warn('Unable to save planner preferences.', error); } }
function loadPreferences() { preferences = { availableMinutes: 270, dayStart: '09:00', autoBreakdown: true, browserReminders: false }; try { const saved = localStorage.getItem(preferencesStorageKey()); if (saved) preferences = { ...preferences, ...JSON.parse(saved) }; } catch (error) { console.warn('Unable to load planner preferences.', error); } document.querySelector('#defaultTime').value = preferences.availableMinutes; document.querySelector('#dayStart').value = preferences.dayStart; document.querySelector('#autoBreakdown').checked = preferences.autoBreakdown; document.querySelector('#browserReminders').checked = preferences.browserReminders; document.querySelector('#availableTime').value = preferences.availableMinutes; }

async function loadUserTasks(user) {
  currentUser = user;
  try {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}.${user.id}`);
    const parsed = saved ? JSON.parse(saved) : defaultTasks();
    tasks = Array.isArray(parsed) ? parsed.map(normalizeTask) : defaultTasks().map(normalizeTask);
  } catch (error) {
    console.warn('Unable to load this user’s tasks; using defaults.', error);
    tasks = defaultTasks().map(normalizeTask);
  }
  if (supabaseClient) {
    const { data, error } = await supabaseClient.from('user_plans').select('data').eq('user_id', user.id).maybeSingle();
    if (!error && Array.isArray(data?.data)) { tasks = data.data.map(normalizeTask); localStorage.setItem(`${STORAGE_KEY_PREFIX}.${user.id}`, JSON.stringify(tasks)); }
    if (error) console.warn('Unable to load cloud tasks; using local tasks.', error);
  }
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

function inferAction(name, subject) {
  const text = `${name} ${subject}`.toLowerCase();
  if (text.includes('physics') || text.includes('study')) return 'Review the key concept, then solve 5 practice questions.';
  if (text.includes('project') || text.includes('report')) return 'Write the problem statement section and save a first draft.';
  if (text.includes('seminar') || text.includes('research')) return 'Find and save 3 credible sources for your talk.';
  if (text.includes('exam') || text.includes('math')) return 'Review one chapter and complete 5 practice questions.';
  return `Define the first 20-minute step for ${name.toLowerCase()}.`;
}

function parseNaturalPlan(input) {
  const text = input.trim();
  const availableMatch = text.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?)/i);
  if (availableMatch && /free|available|today/i.test(text)) {
    const amount = Number(availableMatch[1]);
    document.querySelector('#availableTime').value = Math.round((/hour|hr|h/i.test(availableMatch[2]) ? amount * 60 : amount) / 15) * 15;
  }
  const chunks = text.split(/[,;]|\band\s+(?=(?:my\s+)?(?:physics|math|mathematics|ai|project|chemistry|design|biology|computer|english|history))/i).map(chunk => chunk.trim()).filter(chunk => chunk && !/\d+\s*(hours?|hrs?|h|minutes?|mins?).*(free|available)/i.test(chunk));
  const parsed = [];
  chunks.forEach((chunk, index) => {
    const lower = chunk.toLowerCase();
    if (/free|available|today$/.test(lower) && !/(assignment|exam|seminar|project|report|study|work on)/.test(lower)) return;
    const subjectMatch = lower.match(/(physics|mathematics|math|artificial intelligence|ai|chemistry|biology|design|history|english|computer science)/i);
    const subject = subjectMatch ? subjectMatch[1].replace(/\bai\b/i, 'Artificial Intelligence') : 'Personal study';
    const name = subjectMatch ? `${subject[0].toUpperCase()}${subject.slice(1)} ${/exam/i.test(chunk) ? 'Exam' : /seminar/i.test(chunk) ? 'Seminar' : /project/i.test(chunk) ? 'Project' : /report/i.test(chunk) ? 'Report' : 'Assignment'}` : chunk.replace(/\b(i have|my|a|an)\b/gi, '').trim();
    const deadline = /tomorrow/i.test(chunk) ? dateInputFromToday(1) : /today/i.test(chunk) ? dateInputFromToday(0) : /friday/i.test(chunk) ? dateInputFromWeekday(5) : /monday/i.test(chunk) ? dateInputFromWeekday(1) : /next week|next wednesday/i.test(chunk) ? dateInputFromToday(9) : dateInputFromToday(index + 3);
    const importance = /exam|tomorrow|urgent|important/i.test(chunk) ? 'high' : /project|report|seminar/i.test(chunk) ? 'medium' : 'low';
    const duration = /exam/i.test(chunk) ? 90 : /project|report/i.test(chunk) ? 180 : /seminar/i.test(chunk) ? 60 : /study/i.test(chunk) ? 40 : 60;
    const task = normalizeTask({ id: Date.now() + index, name: name || `New study task ${index + 1}`, subject, deadline, importance, duration, difficulty: duration >= 120 ? 'hard' : 'medium', progress: 0, action: inferAction(name, subject), blockedBy: '', subtasks: [] });
    if (task.duration >= 180) task.subtasks = makeSubtasks(task);
    parsed.push(task);
  });
  return parsed;
}

function dateInputFromWeekday(targetDay) {
  const date = dateAtMidnight(new Date());
  const distance = (targetDay - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + distance);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

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
function renderNextAction() { const queue = tasks.filter(item => item.progress < 100).sort((a, b) => b.score - a.score); const task = queue.length ? queue[recommendationOffset % queue.length] : null; if (!task) return; document.querySelector('#nextActionTitle').textContent = `Start your ${task.name}`; document.querySelector('#nextActionDescription').textContent = task.action; const meta = document.querySelector('.action-meta'); meta.replaceChildren(make('span', '', `◷ ${formatDuration(task.duration)}`), make('span', '', `↗ ${task.explanation.slice(0, 2).join(' · ')}`)); document.querySelector('.next-progress span').style.width = `${Math.max(task.progress, 17)}%`; const start = document.querySelector('#startNext'); start.dataset.start = task.id; start.disabled = false; }
function renderUpcoming() { const list = document.querySelector('#deadlineList'); const upcoming = tasks.filter(task => task.progress < 100).sort((a, b) => dateAtMidnight(a.deadline) - dateAtMidnight(b.deadline)).slice(0, 4); list.replaceChildren(...upcoming.map(task => { const item = make('div', `deadline-item${task.days <= 1 ? ' urgent' : ''}`); item.append(make('span', 'deadline-dot')); const copy = make('div'); copy.append(make('strong', '', task.name), make('span', '', formatDeadline(task.deadline))); item.append(copy, make('b', '', task.days < 0 ? 'late' : `${task.days}d`)); return item; })); }
function renderAll() { enrichTasks(); renderTasks(); renderStats(); renderNextAction(); renderUpcoming(); }

function activateTask(id) { const task = tasks.find(item => String(item.id) === String(id)); if (!task) return; task.progress = Math.min(100, task.progress + 25); if (task.progress >= 100) task.subtasks.forEach(subtask => { subtask.completed = true; }); saveTasks(); renderAll(); showToast(task.progress >= 100 ? `${task.name} completed.` : `${task.name} is now active.`); }
function timeLabel(totalMinutes) { const [startHour, startMinute] = (preferences.dayStart || '09:00').split(':').map(Number); const total = startHour * 60 + startMinute + totalMinutes; return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
function addPlanRow(parent, start, duration, name, isBreak) { const row = make('div', isBreak ? 'break-row' : ''); row.append(make('b', '', `${timeLabel(start)} – ${timeLabel(start + duration)}`), make('span', '', name)); parent.append(row); }
function renderPlan() { const result = document.querySelector('#planResult'); const adaptive = document.querySelector('#adaptiveResult'); result.replaceChildren(); adaptive.replaceChildren(); const available = Math.max(15, Number(document.querySelector('#availableTime').value) || 0); const queue = tasks.filter(task => task.progress < 100).sort((a, b) => b.score - a.score); let used = 0; let cursor = 0; let scheduled = 0; const skipped = []; queue.forEach(task => { const remaining = Math.round(task.duration * (1 - task.progress / 100)); const block = Math.min(remaining, available - used); if (block < 15) { skipped.push(task); return; } if (scheduled > 0) { if (used + 15 + block > available) { skipped.push(task); return; } addPlanRow(result, cursor, 15, 'Break', true); cursor += 15; used += 15; } addPlanRow(result, cursor, block, task.name, false); cursor += block; used += block; scheduled += 1; }); if (!scheduled) result.append(make('p', 'plan-empty', 'No incomplete task fits in this time window. Try adding more time or finishing a smaller task.')); if (skipped.length && scheduled) { adaptive.append(make('strong', '', `${skipped.length} task${skipped.length > 1 ? 's' : ''} moved to tomorrow`), document.createTextNode(`You have ${Math.max(0, available - used)} minutes left. ${skipped[0].name} is lower priority than today’s scheduled work, so keep it for your next planning session.`)); } }
function showToast(message) { const toast = document.querySelector('#toast'); toast.querySelector('p').textContent = message; toast.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2800); }
function setModal(open, trigger) { const modal = document.querySelector('#taskModal'); modal.classList.toggle('open', open); modal.setAttribute('aria-hidden', String(!open)); if (open) { lastModalTrigger = trigger || document.querySelector('#openAddTask'); document.querySelector('#taskName').focus(); } else if (lastModalTrigger) lastModalTrigger.focus(); }
function setView(view) { document.body.dataset.view = view; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view)); const taskHeading = document.querySelector('.main-column > .section-heading'); const taskCards = document.querySelector('.task-list'); const next = document.querySelector('#nextActionPanel'); const progress = document.querySelector('.progress-section'); const right = document.querySelector('.right-column'); taskHeading.classList.toggle('view-hidden', view === 'calendar' || view === 'insights'); taskCards.classList.toggle('view-hidden', view === 'calendar' || view === 'insights'); next.classList.toggle('view-hidden', view !== 'overview'); progress.classList.toggle('view-hidden', view === 'calendar' || view === 'tasks'); right.classList.toggle('view-hidden', view === 'tasks' || view === 'insights'); if (view === 'calendar') renderPlan(); }

function setAuthScreen(visible) { document.querySelector('#authScreen').classList.toggle('visible', visible); document.querySelector('.app-shell').classList.toggle('protected-hidden', visible); }
function setAuthStatus(message, isError = false, showResend = false) { const status = document.querySelector('#authStatus'); status.textContent = message; status.classList.toggle('error', isError); document.querySelector('#resendConfirmation').hidden = !showResend; }
function updateUserIdentity(user) { const email = user.email || ''; const name = user.user_metadata?.full_name || email.split('@')[0] || 'Student'; const initials = name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(); document.querySelector('#userName').textContent = name; document.querySelector('#userEmail').textContent = email; document.querySelector('#userAvatar').textContent = initials; document.querySelector('#headerAvatar').textContent = initials; document.querySelector('#settingsName').textContent = name; document.querySelector('#settingsEmail').textContent = email; document.querySelector('#settingsAvatar').textContent = initials; }
async function startAuthenticatedSession(session) { currentUser = session.user; await loadUserTasks(currentUser); loadTheme(); loadPreferences(); updateUserIdentity(currentUser); setAuthScreen(false); renderAll(); renderPlan(); }
async function initializeAuth() {
  if (!supabaseClient) { setAuthScreen(true); document.querySelector('#googleSignIn').disabled = true; document.querySelector('#authSubmit').disabled = true; setAuthStatus('Authentication is not configured yet.'); return; }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) await startAuthenticatedSession(session); else setAuthScreen(true);
  supabaseClient.auth.onAuthStateChange(async (event, nextSession) => { if (nextSession) await startAuthenticatedSession(nextSession); else { currentUser = null; tasks = []; setAuthScreen(true); } });
}

document.querySelector('#startNext').addEventListener('click', event => activateTask(event.currentTarget.dataset.start));
document.querySelector('#changeRecommendation').addEventListener('click', () => { const count = tasks.filter(task => task.progress < 100).length; if (!count) return; recommendationOffset = (recommendationOffset + 1) % count; renderNextAction(); showToast('Recommendation changed.'); });
document.querySelector('#generatePlan').addEventListener('click', () => { renderPlan(); showToast('Your day is mapped out.'); });
document.querySelector('#aiPlanForm').addEventListener('submit', event => { event.preventDefault(); const input = document.querySelector('#aiTaskInput'); const created = parseNaturalPlan(input.value); if (!created.length) { showToast('Add a task, deadline, or study goal first.'); return; } tasks.push(...created); saveTasks(); renderAll(); renderPlan(); input.value = ''; showToast(`${created.length} action${created.length > 1 ? 's' : ''} added to your plan.`); });
document.querySelector('#filterButton').addEventListener('click', event => { const filters = ['all', 'critical', 'attention', 'ahead', 'later']; activeFilter = filters[(filters.indexOf(activeFilter) + 1) % filters.length]; event.currentTarget.replaceChildren(document.createTextNode(activeFilter === 'all' ? 'All tasks' : categoryLabels[activeFilter]), make('span', '', '⌄')); renderTasks(); });
document.querySelector('#openAddTask').addEventListener('click', event => setModal(true, event.currentTarget)); document.querySelector('#closeModal').addEventListener('click', () => setModal(false)); document.querySelector('#cancelModal').addEventListener('click', () => setModal(false)); document.querySelector('#taskModal').addEventListener('click', event => { if (event.target.id === 'taskModal') setModal(false); }); document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.querySelector('#taskModal').classList.contains('open')) setModal(false); });
document.querySelector('#taskForm').addEventListener('submit', event => { event.preventDefault(); const form = new FormData(event.currentTarget); const task = normalizeTask({ id: Date.now(), name: form.get('name'), subject: form.get('subject'), deadline: form.get('deadline'), importance: form.get('importance'), duration: Number(form.get('duration')), difficulty: form.get('difficulty'), progress: Number(form.get('progress')), action: form.get('description') || 'Break this task into the first 20-minute step.', blockedBy: '', subtasks: [] }); if (form.get('breakdown') || (preferences.autoBreakdown && task.duration >= 180)) task.subtasks = makeSubtasks(task); tasks.push(task); saveTasks(); renderAll(); setModal(false); event.currentTarget.reset(); showToast('Task added to your action plan.'); });
document.querySelector('#mobileMenu').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open')); document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => { setView(item.dataset.view); document.querySelector('#sidebar').classList.remove('open'); }));

let authSignUp = false;
document.querySelector('#authMode').addEventListener('click', event => { authSignUp = !authSignUp; document.querySelector('#authTitle').innerHTML = authSignUp ? 'Start your focused<br />workspace.' : 'Make progress<br />feel possible.'; document.querySelector('#authSubmit').innerHTML = authSignUp ? 'Create account <span>→</span>' : 'Sign in <span>→</span>'; event.currentTarget.innerHTML = authSignUp ? 'Already have an account? <strong>Sign in</strong>' : 'Need an account? <strong>Sign up</strong>'; });
document.querySelector('#authForm').addEventListener('submit', async event => { event.preventDefault(); if (!supabaseClient) return; const email = document.querySelector('#authEmail').value; const password = document.querySelector('#authPassword').value; const result = authSignUp ? await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } }) : await supabaseClient.auth.signInWithPassword({ email, password }); if (result.error) { const needsConfirmation = /confirm|verified|email/i.test(result.error.message); setAuthStatus(result.error.message, true, needsConfirmation); } else if (authSignUp && !result.data.session) { setAuthStatus(`Account created for ${email}. Open the confirmation link we emailed you, then return here to sign in.`, false, true); } else setAuthStatus(authSignUp ? 'Account created. Loading your planner...' : 'Signed in. Loading your planner...'); });
document.querySelector('#resendConfirmation').addEventListener('click', async () => { if (!supabaseClient) return; const email = document.querySelector('#authEmail').value; const { error } = await supabaseClient.auth.resend({ type: 'signup', email, options: { emailRedirectTo: window.location.origin } }); setAuthStatus(error ? error.message : `A new confirmation email was sent to ${email}.`, Boolean(error)); });
document.querySelector('#googleSignIn').addEventListener('click', async () => { if (!supabaseClient) return; const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); if (error) setAuthStatus(error.message, true); });
function setSettings(open) { const panel = document.querySelector('#settingsPanel'); panel.classList.toggle('open', open); panel.setAttribute('aria-hidden', String(!open)); if (open) document.querySelector('#closeSettings').focus(); }
function themeStorageKey() { return currentUser ? `${THEME_STORAGE_KEY}.${currentUser.id}` : THEME_STORAGE_KEY; }
function applyTheme(theme) { const dark = theme === 'dark'; document.body.classList.toggle('dark-mode', dark); document.querySelectorAll('[data-theme]').forEach(button => { const selected = button.dataset.theme === theme; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }); try { localStorage.setItem(themeStorageKey(), theme); } catch (error) { console.warn('Unable to save theme preference.', error); } }
function loadTheme() { let theme = 'light'; try { theme = localStorage.getItem(themeStorageKey()) || localStorage.getItem(THEME_STORAGE_KEY) || 'light'; } catch (error) { console.warn('Unable to load theme preference.', error); } applyTheme(theme); }
async function signOut() { if (!supabaseClient) { setAuthStatus('Authentication is not configured.', true); return; } const { error } = await supabaseClient.auth.signOut(); if (error) showToast(`Could not sign out: ${error.message}`); }
document.querySelector('#settingsButton').addEventListener('click', () => setSettings(true));
document.querySelector('#closeSettings').addEventListener('click', () => setSettings(false));
document.querySelector('#settingsPanel').addEventListener('click', event => { if (event.target.id === 'settingsPanel') setSettings(false); });
document.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => applyTheme(button.dataset.theme)));
document.querySelector('#defaultTime').addEventListener('change', event => { preferences.availableMinutes = Math.max(15, Math.min(1440, Number(event.target.value) || 270)); document.querySelector('#availableTime').value = preferences.availableMinutes; savePreferences(); renderPlan(); });
document.querySelector('#dayStart').addEventListener('change', event => { preferences.dayStart = event.target.value || '09:00'; savePreferences(); renderPlan(); });
document.querySelector('#autoBreakdown').addEventListener('change', event => { preferences.autoBreakdown = event.target.checked; savePreferences(); });
document.querySelector('#browserReminders').addEventListener('change', async event => { if (event.target.checked && 'Notification' in window) { const permission = await Notification.requestPermission(); if (permission !== 'granted') event.target.checked = false; } preferences.browserReminders = event.target.checked; savePreferences(); });
document.querySelector('#resetPlan').addEventListener('click', () => { if (!window.confirm('Reset your local plan and restore the starter tasks?')) return; tasks = defaultTasks().map(normalizeTask); saveTasks(); renderAll(); renderPlan(); showToast('Your starter plan has been restored.'); });
document.querySelector('#logoutButton').addEventListener('click', signOut);
document.querySelector('#settingsLogout').addEventListener('click', signOut);
document.addEventListener('keydown', event => { if (event.key === 'Escape') setSettings(false); });

const currentDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
document.querySelector('#currentDate').textContent = currentDate.toUpperCase();
loadTheme();
loadPreferences();
initializeAuth();