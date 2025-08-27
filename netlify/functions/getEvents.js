import fetch from "node-fetch";

export async function handler(event) {
  const { city = "Berlin" } = event.queryStringParameters;

  try {
    const url = `https://www.eventbriteapi.com/v3/events/search/?q=${encodeURIComponent(
      city
    )}&sort_by=date&token=${process.env.EVENTBRITE_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.events) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "No events found" }),
      };
    }

    const events = data.events.map((e) => ({
      id: e.id,
      name: e.name.text,
      description: e.description?.text?.slice(0, 300) || "",
      start: e.start.local,
      end: e.end.local,
      url: e.url,
      online_event: e.online_event,
      image: e.logo?.url || null,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ city, events }),
    };
  } catch (err) {
    console.error("❌ Error in getEvents:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
