// scrapers/lonelyPlanetScraper.js
import axios from 'axios';
import cheerio from 'cheerio';
import slugify from 'slugify';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Destinations
const destinationList = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

// Articles
const planningArticles = {
  London: [
    { title: 'Best Things to Do', url: 'https://www.lonelyplanet.com/articles/top-things-to-do-in-london' },
    { title: 'Things to Know', url: 'https://www.lonelyplanet.com/articles/things-to-know-before-traveling-to-london' },
    { title: 'Best Neighborhoods', url: 'https://www.lonelyplanet.com/articles/best-neighborhoods-in-london' },
    { title: 'London on a Budget', url: 'https://www.lonelyplanet.com/articles/london-on-a-budget' },
    { title: 'London with Kids', url: 'https://www.lonelyplanet.com/articles/london-with-kids' },
  ],
};

// Helpers
function generateSlug(country, city) {
  return `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
}

function generateLink(country, city) {
  const slug = generateSlug(country, city);
  return `https://www.lonelyplanet.com/destinations/${slug}?sca_ref=5103006.jxkDNNdC6D`;
}

async function extractArticleMarkdown({ title, url }) {
  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const content = $('article')
      .find('p, ul li, h2, h3')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join('\n\n');
    return `\n\n### ${title}\n\n${content}`;
  } catch {
    console.warn(`⚠️ Failed to load article: ${title} - ${url}`);
    return '';
  }
}

async function scrapeAttractions(country, city) {
  const url = `https://www.lonelyplanet.com/${generateSlug(country, city)}/attractions`;
  const attractions = [];

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    $('.Card h3, .css-1e8pxpv').each((_, el) => {
      const name = $(el).text().trim();
      if (
        name &&
        name.length > 3 &&
        !/Subscribe|Newsletter|Guide|Tips|Recommended|eSIM|Top/i.test(name)
      ) {
        attractions.push(name);
      }
    });

    console.log(`🗺️ Found ${attractions.length} attractions for ${city}`);
  } catch {
    console.warn(`⚠️ Failed to load attractions for ${city}`);
  }

  return attractions;
}

async function generateOverview(city, country, intro, attractions) {
  const prompt = `You are a travel writer. Write a vivid 3–5 paragraph summary about visiting ${city}, ${country}. Include tips, cultural notes, and mention these attractions: ${attractions.join(', ')}`;
  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: intro },
    ],
  });
  return res.choices?.[0]?.message?.content?.trim() || '';
}

async function generateItinerary(city) {
  const prompt = `Create a 3-day travel itinerary for ${city}. Use markdown headers: "Day 1", "Day 2", etc., with travel-style suggestions.`;
  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices?.[0]?.message?.content?.trim() || '';
}

// Main per destination
async function scrapeDestination({ city, country, continent }) {
  const slug = generateSlug(country, city);
  const url = `https://www.lonelyplanet.com/destinations/${slug}`;
  console.log(`🌍 Scraping ${city} (${url})`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const introText = $('meta[name="description"]').attr('content') || '';

    const attractions = await scrapeAttractions(country, city);

    let planning_tools_md = '';
    if (planningArticles[city]) {
      for (const article of planningArticles[city]) {
        const md = await extractArticleMarkdown(article);
        planning_tools_md += md;
      }
    }

    console.log(`📝 Planning Tools Length (${city}): ${planning_tools_md.length}`);

    const overview_md = await generateOverview(city, country, introText, attractions);
    const itinerary_md = await generateItinerary(city);

    const payload = {
      slug,
      title: city,
      name: city,
      city,
      country,
      region: country,
      continent,
      image: `https://source.unsplash.com/featured/?${city},${country}`,
      images: [`https://source.unsplash.com/featured/?${city},${country}`],
      link: generateLink(country, city),
      overview_md,
      itinerary_md,
      planning_tools_md: planning_tools_md.trim(),
      popular_attractions: attractions,
      interests: ['culture', 'exploration'],
      popularity: Math.floor(Math.random() * 100),
      source: 'lp',
      summary: introText,
      description: overview_md,
    };

    console.log('📦 Payload:', JSON.stringify(payload, null, 2));

    const { error } = await supabase.from('destinations').upsert([payload], {
      onConflict: 'slug',
    });

    if (error) {
      console.error(`❌ Supabase insert failed for ${city}: ${error.message}`);
    } else {
      console.log(`✅ Saved: ${city}`);
    }
  } catch (err) {
    console.error(`❌ Failed to scrape ${city}: ${err.message}`);
  }
}

// 🏁 Runner
export async function runLonelyPlanetScraper() {
  console.log('🚀 Starting Lonely Planet scraper...');
  for (const dest of destinationList) {
    await scrapeDestination(dest);
  }
  console.log('🎉 LP scraping completed');
}
