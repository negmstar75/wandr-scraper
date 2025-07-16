import { runRawScraper } from '../scrapers/lonelyPlanetScraperRaw.js';

(async () => {
  try {
    await runRawScraper();
  } catch (err) {
    console.error('❌ Scraping failed:', err.message);
    process.exit(1);
  }
})();
