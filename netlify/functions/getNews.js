import fetch from "node-fetch";

export async function handler(event) {
  const { city = "Tokyo", country = "" } = event.queryStringParameters;

  try {
    const query = country ? `${city} ${country}` : city;

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
      query
    )}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${
      process.env.NEWSAPI_KEY
    }`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "ok") {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: data.message || "No news found" }),
      };
    }

    const articles = data.articles.map((a) => ({
      title: a.title,
      description: a.description,
      url: a.url,
      image: a.urlToImage,
      publishedAt: a.publishedAt,
      source: a.source.name,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ query, articles }),
    };
  } catch (err) {
    console.error("❌ Error in getNews:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
