import fetch from "node-fetch";

export async function handler(event) {
  const { xid, place_id, debug = "false" } = event.queryStringParameters || {};

  if (!xid && !place_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "xid or place_id is required" }),
    };
  }

  const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
  const RAPID_KEY = process.env.RAPIDAPI_OPENTRIPMAP_KEY;
  const debugInfo = {};
  let details = null;

  try {
    // --- Step 1: Try OpenTripMap ---
    if (xid && RAPID_KEY) {
      const url = `https://opentripmap-places-v1.p.rapidapi.com/en/places/xid/${xid}`;
      const res = await fetch(url, {
        headers: {
          "X-RapidAPI-Key": RAPID_KEY,
          "X-RapidAPI-Host": "opentripmap-places-v1.p.rapidapi.com",
        },
      });
      if (!res.ok) {
        debugInfo.opentripmapStatus = res.status;
      } else {
        const data = await res.json();
        debugInfo.opentripmap = data;

        if (data) {
          details = {
            id: xid,
            source: "opentripmap",
            name: data.name || null,
            description: data.wikipedia_extracts?.text || null,
            rating: null,
            categories: data.kinds ? data.kinds.split(",") : [],
            photos: data.preview?.source ? [data.preview.source] : [],
            url: data.wikipedia || null,
            lat: data.point?.lat,
            lon: data.point?.lon,
          };
        }
      }
    }

    // --- Step 2: Fallback to Google Place Details ---
    if (!details && place_id && GOOGLE_KEY) {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&key=${GOOGLE_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      debugInfo.google = data;

      if (data?.result) {
        const r = data.result;
        details = {
          id: place_id,
          source: "google",
          name: r.name || null,
          description: r.editorial_summary?.overview || null,
          rating: r.rating || null,
          categories: r.types || [],
          photos: r.photos
            ? r.photos.map(
                (ph) =>
                  `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${ph.photo_reference}&key=${GOOGLE_KEY}`
              )
            : [],
          url: r.url || null,
          lat: r.geometry?.location?.lat,
          lon: r.geometry?.location?.lng,
        };
      }
    }

    if (!details) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "No details found", debug: debug === "true" ? debugInfo : undefined }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        details,
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
