// api/ncom/schedule.js
import fs from 'fs';
import path from 'path';

const scheduleFile = path.join(process.cwd(), 'data', 'ncom', 'videoSchedule.json');

// Helper: load schedule
const loadSchedule = () => {
  try {
    if (fs.existsSync(scheduleFile)) {
      const raw = fs.readFileSync(scheduleFile, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(err);
  }
  // Default schedule if file doesn't exist
  return [
    { videoIndex: 0, delay: 45000 },
    { videoIndex: 1, delay: 120000 }
  ];
};

export default function handler(req, res) {
  if (req.method === 'GET') {
    const schedule = loadSchedule();
    return res.status(200).json(schedule);
  }

  if (req.method === 'POST') {
    const newSchedule = req.body;
    if (!Array.isArray(newSchedule)) {
      return res.status(400).json({ error: 'Schedule must be an array' });
    }
    try {
      fs.writeFileSync(scheduleFile, JSON.stringify(newSchedule, null, 2));
      return res.status(200).json({ success: true, schedule: newSchedule });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to write schedule' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
