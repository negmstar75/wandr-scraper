import fetch from 'node-fetch';

export async function handler(event) {
  const { city = 'Tokyo', lat, lon } = event.queryStringParameters;

  try {
    // Step 1: Geocode city → lat/lon (OpenTripMap or Google)
    let latitude = lat;
    let longitude = lon;

    if (!lat || !lon) {
      const geoRes = await fetch(
        `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(city)}&apikey=${process.env.OPENTRIPMAP_API_KEY}`
      );
      const geoData = await geoRes.json();
      latitude = geoData.lat;
      longitude = geoData.lon;
    }

    // Step 2: Get attractions from OpenTripMap
    const poiRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/radius?radius=5000&lon=${longitude}&lat=${latitude}&rate=2&format=json&limit=20&apikey=${process.env.OPENTRIPMAP_API_KEY}`
    );
    const poiData = await poiRes.json();

    const attractions = poiData.map(p => ({
      xid: p.xid,
      name: p.name,
      kinds: p.kinds,
      dist: p.dist,
      point: p.point,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        coordinates: { lat: latitude, lon: longitude },
        attractions,
      }),
    };
  } catch (err) {
    console.error('❌ Error in getCityAttractions:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

