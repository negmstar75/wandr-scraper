const { runLonelyPlanetScraper } = require('../../scrapers/lonelyPlanetScraper');
require('dotenv').config();

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    await runLonelyPlanetScraper();
    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'ok', source: 'lonelyplanet' }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Scraper failed', details: err.message }),
    };
  }
};
