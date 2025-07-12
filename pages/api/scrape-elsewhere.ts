import { runElsewhereScraper } from '../../scrapers/elsewhereItineraries.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await runElsewhereScraper();
  return res.status(200).json({ status: 'ok', source: 'elsewhere' });
}
