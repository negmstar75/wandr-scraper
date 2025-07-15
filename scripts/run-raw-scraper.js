import dotenv from 'dotenv';
dotenv.config();

(async () => {
  try {
    console.log('🟢 Starting fallback raw scraper...');
    await runRawScraper();
    console.log('✅ Scraping finished successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Scraping failed:', err.message);
    process.exit(1);
  }
})();
