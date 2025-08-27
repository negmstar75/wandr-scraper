const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const city = event.queryStringParameters.city || "Paris";
    const apiKey = process.env.OPENTRIPMAP_API_KEY;

    // 1. Get coords from OpenTripMap geoname
    let geoRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(city)}&apikey=${apiKey}`
    );
    let geoData = await geoRes.json();

    // 2. Fallback to Nominatim if needed
    if (!geoData || !geoData.lat || !geoData.lon) {
      const nominatimRes = await fetch(
        `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&format=json&limit=1`,
        {
          headers: {
            "User-Agent": process.env.WIKIMEDIA_USER_AGENT || "Wandr/1.0 (contact: you@example.com)",
          },
        }
      );
      const nominatimData = await nominatimRes.json();
      if (nominatimData.length > 0) {
        geoData = { lat: nominatimData[0].lat, lon: nominatimData[0].lon };
      } else {
        return { statusCode: 400, body: JSON.stringify({ error: "City not found" }) };
      }
    }

    // 3. Query POIs (try multiple fallbacks)
    let poiRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/radius?radius=10000&lon=${geoData.lon}&lat=${geoData.lat}&rate=1&limit=30&apikey=${apiKey}`
    );
    let poiData = await poiRes.json();

    if (!poiData || !poiData.features || poiData.features.length === 0) {
      // fallback: try bbox
      const bboxRes = await fetch(
        `https://api.opentripmap.com/0.1/en/places/bbox?lon_min=${geoData.lon - 0.1}&lat_min=${geoData.lat - 0.1}&lon_max=${geoData.lon + 0.1}&lat_max=${geoData.lat + 0.1}&limit=30&apikey=${apiKey}`
      );
      poiData = await bboxRes.json();
    }

    if (!poiData || !poiData.features || poiData.features.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ city, attractions: [] }) };
    }

    const attractions = poiData.features.map((p) => ({
      xid: p.properties.xid,
      name: p.properties.name,
      kind: p.properties.kinds,
      dist: p.properties.dist,
    }));

    return { statusCode: 200, body: JSON.stringify({ city, attractions }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
