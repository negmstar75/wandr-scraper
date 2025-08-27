const fetch = require("node-fetch");

exports.handler = async (event) => {
  const city = event.queryStringParameters.city || "Paris";

  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${city}&gsrlimit=10&prop=pageimages&piprop=thumbnail&pithumbsize=500`;

  const res = await fetch(url, {
    headers: { "User-Agent": process.env.WIKIMEDIA_USER_AGENT },
  });
  const data = await res.json();

  const images = Object.values(data.query.pages).map((p) => ({
    title: p.title,
    image: p.thumbnail?.source || null,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ city, images }),
  };
};
