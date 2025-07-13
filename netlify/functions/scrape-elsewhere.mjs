// netlify/functions/scrape-elsewhere.js
const { runElsewhereScraper } = require('../../scrapers/elsewhereItineraries');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    await runElsewhereScraper();

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'ok', source: 'elsewhere' }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
