import fetch from "node-fetch";

export async function handler(event) {
  const { city, country, limit = 10, debug = "false" } =
    event.queryStringParameters || {};

  if (!city) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "City is required" }),
    };
  }

  const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
  const RAPID_KEY = process.env.RAPIDAPI_OPENTRIPMAP_KEY; // for OTM RapidAPI
  const debugInfo = {};
  let standardized = [];

  try {
    // --- Step 1: Get city coordinates ---
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
      city
    )}${country ? "&country=" + encodeURIComponent(country) : ""}&format=json&limit=1`;

    const geoRes = await fetch(nominatimUrl, {
      headers: { "User-Agent": "WandrApp/1.0" },
    });
    const geoData = await geoRes.json();
    debugInfo.nominatim = geoData;

    if (!geoData?.[0]) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "City not found", debug: debug === "true" ? debugInfo : undefined }),
      };
    }

    const { lat, lon } = geoData[0];

    // --- Step 2: Try OpenTripMap via RapidAPI ---
    if (RAPID_KEY) {
      const otmUrl = `https://opentripmap-places-v1.p.rapidapi.com/en/places/radius?radius=10000&lon=${lon}&lat=${lat}&rate=2&limit=${limit}`;
      const poiRes = await fetch(otmUrl, {
        headers: {
          "X-RapidAPI-Key": RAPID_KEY,
          "X-RapidAPI-Host": "opentripmap-places-v1.p.rapidapi.com",
        },
      });

      const poiData = await poiRes.json();
      debugInfo.opentripmap = poiData;

      if (poiData?.features) {
        standardized = poiData.features.map((f) => ({
          id: f.properties.xid,
          source: "opentripmap",
          name: f.properties.name || null,
          description: null,
          rating: null,
          categories: f.properties.kinds ? f.properties.kinds.split(",") : [],
          photos: [],
          url: null,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
        }));
      }
    }

    // --- Step 3: Google fallback if no results ---
    if (standardized.length === 0 && GOOGLE_KEY) {
      const googleUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=attractions+in+${encodeURIComponent(
        city
      )}&key=${GOOGLE_KEY}`;
      const gRes = await fetch(googleUrl);
      const gData = await gRes.json();
      debugInfo.google = gData;

      if (gData?.results) {
        standardized = gData.results.slice(0, limit).map((p) => ({
          id: p.place_id,
          source: "google",
          name: p.name || null,
          description: p.editorial_summary?.overview || null,
          rating: p.rating || null,
          categories: p.types || [],
          photos: p.photos
            ? p.photos.map(
                (ph) =>
                  `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${ph.photo_reference}&key=${GOOGLE_KEY}`
              )
            : [],
          url: p.url || null,
          lat: p.geometry?.location?.lat,
          lon: p.geometry?.location?.lng,
        }));
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        attractions: standardized,
        debug: debug === "true" ? debugInfo : undefined,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, debug: debug === "true" ? debugInfo : undefined }),
    };
  }
}
