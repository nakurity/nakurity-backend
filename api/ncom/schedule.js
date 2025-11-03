// api/ncom/schedule.js
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data', 'ncom');
const scheduleFile = path.join(dataDir, 'videoSchedule.json');

// Refresh intervals: 1h, 5h, 1 day (ms)
const intervals = [3600000, 5 * 3600000, 24 * 3600000];
const pickRandomInterval = () => intervals[Math.floor(Math.random() * intervals.length)];

// Simple Fisher–Yates shuffle (in-place)
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const loadSchedule = () => {
  if (!fs.existsSync(scheduleFile)) return null;
  try {
    const raw = fs.readFileSync(scheduleFile, 'utf-8');
    const parsed = JSON.parse(raw);

    // If file is an array (old format), wrap it into the object format and persist it.
    if (Array.isArray(parsed)) {
      const now = Date.now();
      const wrapped = { schedule: parsed, nextRefresh: now + pickRandomInterval() };
      // Persist the normalized shape back to disk
      fs.writeFileSync(scheduleFile, JSON.stringify(wrapped, null, 2), 'utf-8');
      return wrapped;
    }

    // If it's already an object with schedule, ensure fields exist
    if (parsed && Array.isArray(parsed.schedule)) {
      // if nextRefresh missing, set a sensible default
      if (!parsed.nextRefresh || typeof parsed.nextRefresh !== 'number') {
        parsed.nextRefresh = Date.now() + pickRandomInterval();
        fs.writeFileSync(scheduleFile, JSON.stringify(parsed, null, 2), 'utf-8');
      }
      return parsed;
    }

    // Unknown shape
    console.error('schedule file has an unexpected shape');
    return null;
  } catch (err) {
    console.error('Failed to read schedule:', err);
    return null;
  }
};

const saveSchedule = (schedule, nextRefresh) => {
  ensureDir(dataDir);
  const payload = { schedule, nextRefresh };
  fs.writeFileSync(scheduleFile, JSON.stringify(payload, null, 2), 'utf-8');
};

export default function handler(req, res) {
  ensureDir(dataDir);

  let data = loadSchedule();
  const now = Date.now();

  // If no schedule exists at all, return 500 with hint
  if (!data) {
    return res.status(500).json({ error: 'No valid schedule found on disk. Please seed data/ncom/videoSchedule.json with an array of items or the object { schedule, nextRefresh }.' });
  }

  // If expired → rotate (shuffle) and set a new nextRefresh
  if (now >= data.nextRefresh) {
    const currentSchedule = Array.isArray(data.schedule) ? data.schedule.slice() : [];
    const newSchedule = shuffle(currentSchedule.map(v => ({ ...v })));
    const nextRefresh = now + pickRandomInterval();
    saveSchedule(newSchedule, nextRefresh);
    data = { schedule: newSchedule, nextRefresh };
  }

  if (req.method === 'GET') {
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const newSchedule = req.body;
    if (!Array.isArray(newSchedule)) {
      return res.status(400).json({ error: 'Schedule must be an array' });
    }
    saveSchedule(newSchedule, now + pickRandomInterval());
    return res.status(200).json({ success: true, schedule: newSchedule });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
