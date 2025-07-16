import { runRawScraper } from '../scrapers/lonelyPlanetScraperRaw.js';

(async () => {
  try {
    await runRawScraper();
    process.exit(0);
  } catch (err) {
    console.error('❌ Scraping failed:', err.message);
    process.exit(1);
  }
})();
