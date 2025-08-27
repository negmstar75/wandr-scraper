// /netlify/functions/getEvents.js
import fetch from "node-fetch";

export async function handler(event) {
  try {
    const { city, lat, lon } = event.queryStringParameters;

    if (!city || !lat || !lon) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing city/lat/lon params" }),
      };
    }

    const EVENTBRITE_KEY = process.env.EVENTBRITE_API_KEY;
    const FOURSQUARE_KEY = process.env.FOURSQUARE_API_KEY;

    let events = [];

    // ---------- 1. Try Eventbrite ----------
    if (EVENTBRITE_KEY) {
      const ebUrl = `https://www.eventbriteapi.com/v3/events/search/?location.latitude=${lat}&location.longitude=${lon}&location.within=20km&sort_by=date`;
      const ebRes = await fetch(ebUrl, {
        headers: { Authorization: `Bearer ${EVENTBRITE_KEY}` },
      });
      const ebData = await ebRes.json();

      if (ebData.events && ebData.events.length > 0) {
        events = ebData.events.map((e) => ({
          id: e.id,
          name: e.name?.text || "",
          description: e.description?.text || "",
          start: e.start?.local || "",
          end: e.end?.local || "",
          url: e.url || "",
          category: e.category_id || "event",
          photos: e.logo ? [e.logo.original.url] : [],
          venue: e.venue_id || null,
        }));
      }
    }

    // ---------- 2. Fallback to Foursquare ----------
    if (events.length === 0 && FOURSQUARE_KEY) {
      // Foursquare category 10000 = Event spaces
      const fsqUrl = `https://api.foursquare.com/v3/places/search?ll=${lat},${lon}&radius=5000&categories=10000&limit=20`;
      const fsqRes = await fetch(fsqUrl, {
        headers: { Authorization: FOURSQUARE_KEY },
      });
      const fsqData = await fsqRes.json();

      if (fsqData.results && fsqData.results.length > 0) {
        events = fsqData.results.map((ev) => ({
          id: ev.fsq_id,
          name: ev.name,
          description: ev.location?.formatted_address || "",
          start: null,
          end: null,
          url: ev.link || "",
          category: ev.categories?.map((c) => c.name.toLowerCase()) || ["event"],
          photos: [],
          venue: ev.location?.formatted_address || "",
        }));
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        events,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
