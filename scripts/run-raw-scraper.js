import { runRawScraper } from '../scrapers/lonelyPlanetScraperRaw.js';

(async () => {
  try {
    await runRawScraper();
    console.log('✅ Fallback scraper run complete!');
  } catch (err) {
    console.error('❌ Scraping failed:', err.message);
    process.exit(1);
  }
})();
