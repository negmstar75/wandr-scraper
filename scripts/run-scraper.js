// scripts/run-scraper.js
import { runLonelyPlanetScraper } from '../scrapers/lonelyPlanetScraper.js';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  try {
    console.log('🟢 Starting scraper from GitHub Action...');
    await runLonelyPlanetScraper();
    console.log('✅ Scraping finished successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Scraping failed:', err);
    process.exit(1);
  }
})();
