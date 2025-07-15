// scrapers/lonelyPlanetScraper.js
import axios from 'axios';
import cheerio from 'cheerio';
import slugify from 'slugify';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// 🔑 Clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 🌍 Destinations
const destinationList = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

// 📰 Planning articles
const planningArticles = {
  London: [
    {
      title: 'Best Things to Do',
      url: 'https://www.lonelyplanet.com/articles/top-things-to-do-in-london',
    },
    {
      title: 'Things to Know',
      url: 'https://www.lonelyplanet.com/articles/things-to-know-before-traveling-to-london',
    },
    {
      title: 'Best Neighborhoods',
      url: 'https://www.lonelyplanet.com/articles/best-neighborhoods-in-london',
    },
    {
      title: 'London on a Budget',
      url: 'https://www.lonelyplanet.com/articles/london-on-a-budget',
    },
    {
      title: 'London with Kids',
      url: 'https://www.lonelyplanet.com/articles/london-with-kids',
    },
  ],
};

// 🔗 LP Affiliate Link
function generateLink(country, city) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  return `https://www.lonelyplanet.com/destinations/${slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program`;
}

// 📘 Extract full markdown content from article page
async function extractArticleMarkdown({ title, url }) {
  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    const paragraphs = $('.Article__Content p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join('\n\n');

    return `\n\n### ${title}\n\n${paragraphs}`;
  } catch (err) {
    console.warn(`⚠️ Could not extract article "${title}": ${url}`);
    return '';
  }
}

// 🤖 Generate overview markdown
async function generateOverview(city, country, intro, attractions) {
  const prompt = `You are a travel writer. Write a vivid and informative 3–5 paragraph summary about visiting ${city}, ${country}. Include cultural insights, travel tips, and highlight these key attractions: ${attractions.join(', ')}`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: intro },
    ],
  });

  return res.choices?.[0]?.message?.content?.trim() || '';
}

// 📅 Sample 3-Day itinerary
async function generateItinerary(city) {
  const prompt = `Create a sample 3-day itinerary for a trip to ${city}, using markdown with "Day 1", "Day 2", etc. Focus on travel guide style.`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'system', content: prompt }],
  });

  return res.choices?.[0]?.message?.content?.trim() || '';
}

// 🔍 Scrape 1 destination
async function scrapeDestination({ city, country, continent }) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  const url = `https://www.lonelyplanet.com/destinations/${slug}`;

  console.log(`🌍 Scraping: ${city}, ${country}`);
  console.log(`🔗 URL: ${url}`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    const introText = $('meta[name="description"]').attr('content') || '';

    // 🏛️ Attractions
    const attractions = [];
    $('a[href*="/attractions/"] h3').each((_, el) => {
      const name = $(el).text().trim();
      if (name && !attractions.includes(name)) attractions.push(name);
    });

    // 🧰 Planning tools (from article pages)
    let planning_tools_md = '';
    if (planningArticles[city]) {
      for (const article of planningArticles[city]) {
        planning_tools_md += await extractArticleMarkdown(article);
      }
    }

    // ✨ AI-generated fields
    const overview_md = await generateOverview(city, country, introText, attractions);
    const itinerary_md = await generateItinerary(city);

    const destinationPayload = {
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

    console.log('📦 Insert object:\n', JSON.stringify(destinationPayload, null, 2));

    const { error } = await supabase
      .from('destinations')
      .upsert([destinationPayload], { onConflict: 'slug' });

    if (error) {
      console.error(`❌ Supabase insert failed:`, error.message);
    } else {
      console.log(`✅ Saved to Supabase: ${city}`);
    }
  } catch (err) {
    console.error(`❌ Failed to scrape ${city}: ${err.message}`);
  }
}

// 🏁 Main runner
export async function runLonelyPlanetScraper() {
  console.log('🚀 Starting Lonely Planet scraper...');
  for (const destination of destinationList) {
    await scrapeDestination(destination);
  }
  console.log('🎉 Scraping complete!');
}
