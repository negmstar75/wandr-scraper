const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const city = event.queryStringParameters.city || "Paris";
    const apiKey = process.env.OPENTRIPMAP_API_KEY;

    // Get coordinates for the city
    const geoRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(city)}&apikey=${apiKey}`
    );
    const geoData = await geoRes.json();

    if (!geoData || !geoData.lat || !geoData.lon) {
      return { statusCode: 400, body: JSON.stringify({ error: "City not found" }) };
    }

    // Get attractions list
    const poiRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/radius?radius=5000&lon=${geoData.lon}&lat=${geoData.lat}&rate=2&limit=20&apikey=${apiKey}`
    );
    const poiData = await poiRes.json();

    if (!poiData || !poiData.features) {
      return { statusCode: 400, body: JSON.stringify({ error: "No attractions found" }) };
    }

    const attractions = poiData.features.map((p) => ({
      xid: p.properties.xid,
      name: p.properties.name,
      kind: p.properties.kinds,
      dist: p.properties.dist,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ city, attractions }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
