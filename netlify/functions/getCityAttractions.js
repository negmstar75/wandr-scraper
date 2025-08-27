const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const city = event.queryStringParameters.city || "Paris";
    const apiKey = process.env.OPENTRIPMAP_API_KEY;

    let debug = {};

    // 1. Try OpenTripMap geoname API
    const geoUrl = `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(
      city
    )}&apikey=${apiKey}`;
    let geoRes = await fetch(geoUrl);
    let geoData = await geoRes.json();
    debug.geoUrl = geoUrl;
    debug.geoData = geoData;

    // 2. If no lat/lon, fallback to Nominatim
    if (!geoData || !geoData.lat || !geoData.lon) {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
        city
      )}&format=json&limit=1`;

      const nominatimRes = await fetch(nominatimUrl, {
        headers: {
          "User-Agent":
            process.env.WIKIMEDIA_USER_AGENT ||
            "Wandr/1.0 (contact: you@example.com)",
        },
      });
      const nominatimData = await nominatimRes.json();
      debug.nominatimUrl = nominatimUrl;
      debug.nominatimData = nominatimData;

      if (nominatimData.length > 0) {
        geoData = { lat: nominatimData[0].lat, lon: nominatimData[0].lon };
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "City not found", debug }),
        };
      }
    }

    // 3. Query POIs (radius search)
    const radiusUrl = `https://api.opentripmap.com/0.1/en/places/radius?radius=10000&lon=${
      geoData.lon
    }&lat=${geoData.lat}&rate=1&limit=30&apikey=${apiKey}`;
    let poiRes = await fetch(radiusUrl);
    let poiData = await poiRes.json();
    debug.radiusUrl = radiusUrl;
    debug.poiData = poiData;

    // 4. If still empty, try bbox fallback
    if (!poiData || !poiData.features || poiData.features.length === 0) {
      const bboxUrl = `https://api.opentripmap.com/0.1/en/places/bbox?lon_min=${
        geoData.lon - 0.1
      }&lat_min=${geoData.lat - 0.1}&lon_max=${geoData.lon + 0.1}&lat_max=${
        geoData.lat + 0.1
      }&limit=30&apikey=${apiKey}`;

      const bboxRes = await fetch(bboxUrl);
      poiData = await bboxRes.json();

      debug.bboxUrl = bboxUrl;
      debug.bboxData = poiData;
    }

    // 5. Still empty? return debug info
    if (!poiData || !poiData.features || poiData.features.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ city, attractions: [], debug }),
      };
    }

    // 6. Parse results
    const attractions = poiData.features.map((p) => ({
      xid: p.properties.xid,
      name: p.properties.name,
      kind: p.properties.kinds,
      dist: p.properties.dist,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ city, attractions, debug }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
