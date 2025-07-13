const { runElsewhereScraper } = require('../../scrapers/elsewhereItineraries');
require('dotenv').config();

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  await runElsewhereScraper();
  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'ok', source: 'elsewhere' }),
  };
};
