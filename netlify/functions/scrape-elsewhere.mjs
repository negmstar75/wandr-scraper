const { runElsewhereScraper } = require('../../scrapers/elsewhereItineraries');

exports.handler = async function (event, context) {
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
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
