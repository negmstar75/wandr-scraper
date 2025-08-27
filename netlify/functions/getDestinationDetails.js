import fetch from 'node-fetch';

export async function handler(event) {
  const { xid } = event.queryStringParameters;

  if (!xid) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing xid parameter' }),
    };
  }

  try {
    const res = await fetch(
      `https://api.opentripmap.com/0.1/en/places/xid/${xid}?apikey=${process.env.OPENTRIPMAP_API_KEY}`
    );
    const details = await res.json();

    return {
      statusCode: 200,
      body: JSON.stringify(details),
    };
  } catch (err) {
    console.error('❌ Error in getDestinationDetails:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

