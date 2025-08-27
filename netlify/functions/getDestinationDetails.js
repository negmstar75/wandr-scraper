// netlify/functions/getDestinationDetails.js
const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const { xid, place_id } = event.queryStringParameters;

    if (!xid && !place_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "xid (OTM) or place_id (Google) is required" }),
      };
    }

    const debug = {};

    // 1. If xid exists → try OpenTripMap
    if (xid) {
      const otmUrl = `https://api.opentripmap.com/0.1/en/places/xid/${xid}?apikey=${process.env.OPENTRIPMAP_API_KEY}`;
      debug.otmUrl = otmUrl;

      const otmRes = await fetch(otmUrl);
      const otmData = await otmRes.json();
      debug.otmData = otmData;

      if (otmData.error && otmData.error.includes("Unauthorized")) {
        debug.otmError = "Unauthorized → falling back to Google";
      } else if (otmData.name) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            source: "opentripmap",
            details: {
              name: otmData.name,
              address: otmData.address ? otmData.address.road : null,
              description: otmData.wikipedia_extracts
                ? otmData.wikipedia_extracts.text
                : null,
              url: otmData.url,
              kinds: otmData.kinds,
            },
            debug,
          }),
        };
      }
    }

    // 2. If OpenTripMap failed OR place_id provided → use Google
    if (place_id || xid) {
      const googleUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id ||
        xid}&fields=name,formatted_address,geometry,rating,types,photos,url&key=${
        process.env.GOOGLE_PLACES_API_KEY
      }`;
      debug.googleUrl = googleUrl;

      const googleRes = await fetch(googleUrl);
      const googleData = await googleRes.json();
      debug.googleData = googleData;

      if (googleData.result) {
        const g = googleData.result;
        return {
          statusCode: 200,
          body: JSON.stringify({
            source: "google",
            details: {
              name: g.name,
              address: g.formatted_address,
              rating: g.rating,
              types: g.types,
              url: g.url,
              photos: g.photos
                ? g.photos.map((p) => ({
                    photo_reference: p.photo_reference,
                    height: p.height,
                    width: p.width,
                  }))
                : [],
            },
            debug,
          }),
        };
      }
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Place not found", debug }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
