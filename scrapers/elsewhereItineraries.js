// scrapers/elsewhereItineraries.js
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const slugify = require('slugify');
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const countryList = [
  { slug: 'jordan', country: 'Jordan', region: 'Middle East' },
  { slug: 'japan', country: 'Japan', region: 'Asia' },
  { slug: 'italy', country: 'Italy', region: 'Europe' },
];

function generateSlug(country, title) {
  return `${slugify(country, { lower: true })}/${slugify(title, { lower: true })}`;
}

async function scrapeItinerary({ slug: countrySlug, country, region }) {
  const url = `https://www.elsewhere.io/${countrySlug}`;
  console.log(`🌍 Scraping ${url}`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const title = $('h1').first().text().trim() || `Trip to ${country}`;
    const itineraryBlocks = $('h3:contains("Day"), h4:contains("Day"), p');

    let markdown = '';
    let days = 0;

    itineraryBlocks.each((_, el) => {
      const text = $(el).text().trim();
      if (/^day\s*\d+/i.test(text)) {
        markdown += `\n\n### ${text}\n`;
        days++;
      } else if (el.tagName === 'p' && text.length > 30) {
        markdown += `${text}\n`;
      }
    });

    if (days === 0 || days > 7) {
      console.warn(`⏭️ Skipping ${country}`);
      return;
    }

    // Generate AI summary
    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'Summarize the travel itinerary in a short, engaging overview paragraph.',
        },
        {
          role: 'user',
          content: markdown,
        },
      ],
    });

    const overview_md = aiResponse.choices?.[0]?.message?.content?.trim() || '';

    const slug = generateSlug(country, title);
    const image = $('meta[property="og:image"]').attr('content') || `https://source.unsplash.com/featured/?${country},travel`;

    await supabase.from('travel_itineraries').upsert([{
      slug,
      title,
      region,
      country,
      theme: 'Classic',
      days,
      places: [],
      markdown,
      source: 'elsewhere',
      image,
      overview_md,
      ai_markdown: markdown,
    }]);

    console.log(`✅ Inserted ${title}`);
  } catch (err) {
    console.error(`❌ Failed ${url}:`, err.message);
  }
}

async function runElsewhereScraper() {
  for (const country of countryList) {
    await scrapeItinerary(country);
  }

  console.log('🎉 Elsewhere scraping done');
}

module.exports = { runElsewhereScraper };
