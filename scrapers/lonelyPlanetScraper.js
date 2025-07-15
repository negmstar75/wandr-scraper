// scrapers/lonelyPlanetScraper.js
import axios from 'axios';
import cheerio from 'cheerio';
import slugify from 'slugify';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 🌍 Test cities
const destinationList = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

const planningArticles = {
  London: [
    { title: 'Best Things to Do', url: 'https://www.lonelyplanet.com/articles/top-things-to-do-in-london' },
    { title: 'Things to Know', url: 'https://www.lonelyplanet.com/articles/things-to-know-before-traveling-to-london' },
    { title: 'Best Neighborhoods', url: 'https://www.lonelyplanet.com/articles/best-neighborhoods-in-london' },
    { title: 'London on a Budget', url: 'https://www.lonelyplanet.com/articles/london-on-a-budget' },
    { title: 'London with Kids', url: 'https://www.lonelyplanet.com/articles/london-with-kids' },
  ],
};

function generateLink(country, city) {
  const slug = `${slugify(country)}/${slugify(city)}`;
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
  } catch (err) {
    console.warn(`⚠️ Failed to load article: ${title}`);
    return '';
  }
}

async function scrapeAttractions(country, city) {
  const url = `https://www.lonelyplanet.com/${slugify(country)}/${slugify(city)}/attractions`;
  const attractions = [];

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    $('.Card h3, .css-1e8pxpv').each((_, el) => {
      const name = $(el).text().trim();
      if (name && name.length > 3 && !/Subscribe|Newsletter|Guide|Tips|Recommended|eSIM|Top/i.test(name)) {
        attractions.push(name);
      }
    });
  } catch (err) {
    console.warn(`⚠️ Could not scrape attractions for ${city}`);
  }

  return attractions;
}

async function generateOverview(city, country, intro, attractions) {
  const prompt = `You are a travel writer. Write a rich, informative, and friendly travel summary about visiting ${city}, ${country}. Include key attractions: ${attractions.join(', ')}`;
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
  const prompt = `Write a 3-day travel itinerary for ${city}, including activities for morning, afternoon, and evening in markdown format.`;
  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices?.[0]?.message?.content?.trim() || '';
}

async function scrapeDestination({ city, country, continent }) {
  const slug = `${slugify(country)}/${slugify(city)}`;
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
        planning_tools_md += await extractArticleMarkdown(article);
      }
    }

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

    console.log('📦 Final Payload:', JSON.stringify(payload, null, 2));

    const { error } = await supabase
      .from('destinations')
      .upsert([payload], { onConflict: 'slug' });

    if (error) {
      console.error(`❌ Supabase insert failed for ${city}: ${error.message}`);
    } else {
      console.log(`✅ Inserted/Updated ${city}`);
    }
  } catch (err) {
    console.error(`❌ Failed to scrape ${city}: ${err.message}`);
  }
}

export async function runLonelyPlanetScraper() {
  console.log('🚀 Starting Lonely Planet scraper...');
  for (const dest of destinationList) {
    await scrapeDestination(dest);
  }
  console.log('🎉 Done!');
}
