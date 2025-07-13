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
  apiKey: process.env.OPENAI_API_KEY
});

// 🌍 Countries to scrape
const countryList = [
  { slug: 'jordan', country: 'Jordan', region: 'Middle East', continent: 'Asia' },
  { slug: 'japan', country: 'Japan', region: 'Asia', continent: 'Asia' },
  { slug: 'italy', country: 'Italy', region: 'Europe', continent: 'Europe' },
  { slug: 'morocco', country: 'Morocco', region: 'Africa', continent: 'Africa' },
  { slug: 'peru', country: 'Peru', region: 'South America', continent: 'South America' }
];

// 🧠 Generate additional fields using OpenAI
async function enrichWithAI(title, markdown, country) {
  const prompt = `
You are a professional travel writer. Given this 7-day itinerary in markdown format, generate:
1. A short overview (markdown format, ~3 lines)
2. A cleaned up version of the full itinerary in improved markdown
3. A list of interests (like "culture", "food", "nature")

Respond in JSON format with the keys:
- overview_md
- ai_markdown
- interests

Country: ${country}
Title: ${title}

Itinerary:
${markdown}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You write clean JSON and understand travel.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(raw);
    return {
      overview_md: parsed.overview_md || null,
      ai_markdown: parsed.ai_markdown || null,
      interests: parsed.interests || []
    };
  } catch (e) {
    console.warn('⚠️ OpenAI enrichment failed:', e.message);
    return { overview_md: null, ai_markdown: null, interests: [] };
  }
}

// 🧹 Slug generator
function generateSlug(country, title) {
  return `${slugify(country, { lower: true })}/${slugify(title, { lower: true })}`;
}

// 🚀 Scrape one country
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
      } else if ($(el).is('p') && text.length > 30) {
        markdown += `${text}\n`;
      }
    });

    if (days === 0 || days > 7) {
      console.warn(`⏭️ Skipping ${country} (invalid itinerary length)`);
      return;
    }

    const slug = generateSlug(country, title);
    const image =
      $('meta[property="og:image"]').attr('content') ||
      `https://source.unsplash.com/featured/?${encodeURIComponent(country)},travel`;

    // 🌟 Enrich with OpenAI
    const enrichment = await enrichWithAI(title, markdown, country);

    const data = {
      slug,
      title,
      region,
      country,
      continent,
      theme: 'Classic',
      days,
      places: [],
      markdown,
      itinerary_md: markdown,
      overview_md: enrichment.overview_md,
      ai_markdown: enrichment.ai_markdown,
      interests: enrichment.interests,
      source: 'elsewhere',
      image,
      link: url,
      popularity: 6
    };

    const { error } = await supabase.from('travel_itineraries').upsert([data]);

    if (error) {
      console.error(`❌ Insert failed for ${country}:`, error.message);
    } else {
      console.log(`✅ Saved itinerary: ${title}`);
    }
  } catch (err) {
    console.error(`❌ Error scraping ${url}:`, err.message);
  }
}

// 🔁 Main scraper entry point
async function runElsewhereScraper() {
  for (const country of countryList) {
    await scrapeItinerary(country);
  }

  console.log('🎉 Finished Elsewhere scraping');
}

module.exports = {
  runElsewhereScraper
};
