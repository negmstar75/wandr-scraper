const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const city = event.queryStringParameters.city || "Paris";
    const apiKey = process.env.OPENTRIPMAP_API_KEY;

    // 1. Try OpenTripMap geoname
    let geoRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(city)}&apikey=${apiKey}`
    );
    let geoData = await geoRes.json();

    // 2. If no lat/lon, fallback to Nominatim with User-Agent
    if (!geoData || !geoData.lat || !geoData.lon) {
      const nominatimRes = await fetch(
        `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&format=json&limit=1`,
        {
          headers: {
            "User-Agent": process.env.WIKIMEDIA_USER_AGENT || "Wandr/1.0 (contact: your_email@example.com)"
          }
        }
      );
      const nominatimData = await nominatimRes.json();

      if (nominatimData.length > 0) {
        geoData = {
          lat: nominatimData[0].lat,
          lon: nominatimData[0].lon,
        };
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "City not found" }),
        };
      }
    }

    // 3. Get attractions from OpenTripMap using coords
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
