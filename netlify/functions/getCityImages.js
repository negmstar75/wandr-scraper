import fetch from "node-fetch";

export async function handler(event) {
  const { city = "Tokyo" } = event.queryStringParameters;

  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&generator=search&gsrsearch=${encodeURIComponent(
      city
    )}&gsrlimit=10&iiprop=url&iiurlwidth=800&iiurlheight=600&origin=*`;

    const res = await fetch(url, {
      headers: { "User-Agent": process.env.WIKIMEDIA_USER_AGENT },
    });
    const data = await res.json();

    const images = Object.values(data.query?.pages || {}).map((p) => ({
      title: p.title,
      url: p.imageinfo?.[0]?.url,
      thumb: p.imageinfo?.[0]?.thumburl,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ city, images }),
    };
  } catch (err) {
    console.error("❌ Error in getCityImages:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
