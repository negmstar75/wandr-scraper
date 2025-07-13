// scrapers/elsewhereItineraries.js
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const slugify = require('slugify');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const countryList = [
  { slug: 'jordan', country: 'Jordan', region: 'Middle East' },
  { slug: 'japan', country: 'Japan', region: 'Asia' },
  { slug: 'italy', country: 'Italy', region: 'Europe' },
  { slug: 'morocco', country: 'Morocco', region: 'Africa' },
  { slug: 'peru', country: 'Peru', region: 'South America' },
];

function generateSlug(country, title) {
  return `${slugify(country, { lower: true })}/${slugify(title, { lower: true })}`;
}

function mapRegionToContinent(region) {
  const mapping = {
    'Middle East': 'Africa & Middle East',
    'Africa': 'Africa & Middle East',
    'Asia': 'Asia',
    'Europe': 'Europe',
    'South America': 'South America',
  };
  return mapping[region] || region;
}

async function scrapeItinerary({ slug: countrySlug, country, region }) {
  const url = `https://www.elsewhere.io/${countrySlug}`;
  console.log(`🌍 Scraping: ${url}`);

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
      console.warn(`⏭️ Skipping ${country} - No valid 7-day itinerary`);
      return;
    }

    const image =
      $('meta[property="og:image"]').attr('content') ||
      `https://source.unsplash.com/featured/?${encodeURIComponent(country)},travel`;

    const slug = generateSlug(country, title);
    const continent = mapRegionToContinent(region);

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
      source: 'elsewhere',
      image,
      link: url,
      popularity: 7,
      interests: [],
      ai_markdown: null,
      overview_md: null,
    };

    const { error } = await supabase.from('travel_itineraries').upsert([data]);

    if (error) {
      console.error(`❌ Failed to insert ${title}:`, error.message);
    } else {
      console.log(`✅ Inserted itinerary for ${country}`);
    }
  } catch (err) {
    console.error(`❌ Error scraping ${url}:`, err.message);
  }
}

async function runElsewhereScraper() {
  for (const country of countryList) {
    await scrapeItinerary(country);
  }
  console.log('🎉 Finished scraping Elsewhere itineraries');
}

module.exports = { runElsewhereScraper };
