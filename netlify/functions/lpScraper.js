// netlify/functions/lpScraper.js
import { runRawScraper } from '../../scrapers/legacy/lonelyPlanetScraperRaw.js';

export async function handler(event) {
  try {
    console.log('🚀 Triggering Lonely Planet legacy scraper...');

    // Optional: you can pass ?city=Tokyo to filter later
    await runRawScraper();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '✅ Lonely Planet scraper finished',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error('❌ Scraper failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

