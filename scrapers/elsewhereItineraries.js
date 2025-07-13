const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const slugify = require('slugify');
const { OpenAI } = require('openai');

require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const countryList = [
  { slug: 'jordan', country: 'Jordan', region: 'Middle East', continent: 'Asia' },
  { slug: 'japan', country: 'Japan', region: 'Asia', continent: 'Asia' },
  { slug: 'italy', country: 'Italy', region: 'Europe', continent: 'Europe' },
];

function generateSlug(country, title) {
  return `${slugify(country, { lower: true })}/${slugify(title, { lower: true })}`;
}

async function scrapeItinerary({ slug: countrySlug, country, region, continent }) {
  const url = `https://www.elsewhere.io/${countrySlug}`;
  console.log(`🌍 Scraping ${url}`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    const title = $('h1').first().text().trim() || `Trip to ${country}`;

    // 🧠 Extract deeper itinerary sections
    let fullText = '';
    $('section, article, div').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 100) {
        fullText += text + '\n\n';
      }
    });

    fullText = fullText.replace(/\s+/g, ' ').trim();

    if (fullText.length < 400) {
      console.warn(`⏭️ Skipping ${country} – not enough content`);
      return;
    }

    // ✨ OpenAI to summarize
    const aiSummary = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You're a travel copywriter. Given full itinerary text, summarize it in a rich 3-5 sentence overview.`,
        },
        { role: 'user', content: fullText },
      ],
    });

    const overview_md = aiSummary.choices?.[0]?.message?.content?.trim() || '';

    const aiItinerary = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You're formatting a multi-day itinerary for a travel app. Convert the input into Markdown with headings for each day.`,
        },
        { role: 'user', content: fullText },
      ],
    });

    const itinerary_md = aiItinerary.choices?.[0]?.message?.content?.trim() || '';

    const image = $('meta[property="og:image"]').attr('content') || `https://source.unsplash.com/featured/?${country},travel`;
    const slug = generateSlug(country, title);

    await supabase.from('travel_itineraries').upsert([
      {
        slug,
        title,
        region,
        country,
        continent,
        theme: 'Classic',
        days: 7, // hardcoded fallback
        markdown: fullText,
        itinerary_md,
        overview_md,
        ai_markdown: fullText,
        source: 'elsewhere',
        link: url,
        image,
        interests: ['culture', 'adventure'],
        popularity: Math.floor(Math.random() * 100),
        attractions: [],
      },
    ]);

    console.log(`✅ Saved: ${title}`);
  } catch (err) {
    console.error(`❌ Error scraping ${url}:`, err.message);
  }
}

async function runElsewhereScraper() {
  for (const country of countryList) {
    await scrapeItinerary(country);
  }
  console.log('🎉 All done');
}

module.exports = { runElsewhereScraper };
