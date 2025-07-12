import { runElsewhereScraper } from '../scrapers/elsewhereItineraries.js';

export async function handler(req) {
  if (req.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  await runElsewhereScraper();
  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'ok', source: 'elsewhere' }),
  };
}
