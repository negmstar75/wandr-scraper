const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const slugify = require('slugify');
const { OpenAI } = require('openai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    if (days === 0 || days > 10) {
      console.warn(`⏭️ Skipping ${country} – Invalid itinerary`);
      return;
    }

    const image = $('meta[property="og:image"]').attr('content') || `https://source.unsplash.com/featured/?${country},travel`;
    const slug = generateSlug(country, title);

    // 🌟 Use OpenAI to create overview summary
    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'Summarize this travel itinerary in 2-3 engaging sentences for a travel app.' },
        { role: 'user', content: markdown },
      ],
    });

    const overview_md = aiResponse.choices?.[0]?.message?.content?.trim() || '';

    // 🧠 Optionally: generate placeholder tags
    const interests = ['culture', 'food', 'history']; // could also use AI or user-defined
    const popularity = Math.floor(Math.random() * 100); // dummy score
    const attractions = []; // for now, empty — later we can extract

    await supabase.from('travel_itineraries').upsert([
      {
        slug,
        title,
        region,
        country,
        continent,
        theme: 'Classic',
        days,
        places: [],
        markdown,                // raw itinerary content
        itinerary_md: markdown, // explicitly saving
        overview_md,
        ai_markdown: markdown,
        source: 'elsewhere',
        link: url,
        image,
        interests,
        popularity,
        attractions,
      },
    ]);

    console.log(`✅ Inserted: ${title}`);
  } catch (err) {
    console.error(`❌ Failed to scrape ${url}: ${err.message}`);
  }
}

async function runElsewhereScraper() {
  for (const country of countryList) {
    await scrapeItinerary(country);
  }

  console.log('🎉 Done scraping Elsewhere itineraries');
}

module.exports = { runElsewhereScraper };
