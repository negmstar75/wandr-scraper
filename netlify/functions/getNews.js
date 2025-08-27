// /netlify/functions/getNews.js
import fetch from "node-fetch";

export async function handler(event) {
  try {
    const { city, country } = event.queryStringParameters;

    if (!city) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing city parameter" }),
      };
    }

    const NEWS_API_KEY = process.env.NEWSAPI_KEY;
    const WIKIMEDIA_USER_AGENT = process.env.WIKIMEDIA_USER_AGENT || "Wandr/1.0 (contact: email@example.com)";

    let articles = [];

    // ---------- 1. Try NewsAPI ----------
    if (NEWS_API_KEY) {
      const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
        city
      )}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${NEWS_API_KEY}`;

      const newsRes = await fetch(newsUrl);
      const newsData = await newsRes.json();

      if (newsData.articles && newsData.articles.length > 0) {
        articles = newsData.articles.map((a) => ({
          source: a.source?.name || "NewsAPI",
          title: a.title,
          description: a.description,
          url: a.url,
          publishedAt: a.publishedAt,
          image: a.urlToImage,
        }));
      }
    }

    // ---------- 2. Fallback: Wikimedia / Wikivoyage ----------
    if (articles.length === 0) {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&titles=${encodeURIComponent(
        city
      )}&format=json`;

      const wikiRes = await fetch(wikiUrl, {
        headers: { "User-Agent": WIKIMEDIA_USER_AGENT },
      });
      const wikiData = await wikiRes.json();

      const pages = wikiData.query?.pages || {};
      const firstPage = Object.values(pages)[0];

      if (firstPage?.extract) {
        articles = [
          {
            source: "Wikipedia",
            title: `${city} Overview`,
            description: firstPage.extract.replace(/<[^>]+>/g, "").slice(0, 300) + "...",
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(city)}`,
            publishedAt: null,
            image: null,
          },
        ];
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        country: country || "",
        articles,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
