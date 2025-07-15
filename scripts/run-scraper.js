const { runLonelyPlanetScraper } = require('../scrapers/lonelyPlanetScraper.js');
require('dotenv').config();

(async () => {
  try {
    console.log('🟢 Starting scraper from GitHub Action...');
    await runLonelyPlanetScraper();
    console.log('✅ Scraping finished successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Scraping failed:', err.message);
    process.exit(1);
  }
})();
