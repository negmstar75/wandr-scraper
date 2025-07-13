const axios = require('axios');
const cheerio = require('cheerio');
const slugify = require('slugify');
const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// 🔑 ENV
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 🌍 Test destinations
const destinationList = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

// 🔗 Affiliate URL builder
function generateLink(country, city) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  return `https://www.lonelyplanet.com/destinations/${slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program`;
}

// 🧠 AI Summary Generator
async function generateOverview(city, country, rawText, highlights) {
  const prompt = `You are a travel editor. Create a rich 2–3 paragraph destination summary with an inspiring tone. Summarize the experience of visiting ${city}, ${country} based on this content, and end with a list of 3–5 must-see attractions: ${highlights.join(', ')}`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'Format output in markdown. Use headers, paragraphs, and bullet points where suitable.' },
      { role: 'user', content: prompt + '\n\n' + rawText },
    ],
  });

  return res.choices?.[0]?.message?.content?.trim() || '';
}

// 🔧 Scraper per destination
async function scrapeDestination({ city, country, continent }) {
  const citySlug = slugify(city, { lower: true });
  const countrySlug = slugify(country, { lower: true });
  const slug = `${countrySlug}/${citySlug}`;
  const url = `https://www.lonelyplanet.com/destinations/${countrySlug}/${citySlug}`;

  console.log(`🌍 Scraping: ${city}, ${country}`);
  console.log(`🔗 URL: ${url}`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    const introText = $('meta[name="description"]').attr('content') || '';

    // Extract attractions
    const attractions = [];
    $('h2:contains("Must-see attractions")')
      .next()
      .find('a')
      .each((_, el) => {
        const name = $(el).text().trim();
        if (name && !attractions.includes(name)) attractions.push(name);
      });

    // Planning tools
    let planning_md = '';
    $('h2:contains("Planning Tools")')
      .nextUntil('h2')
      .each((_, el) => {
        const tag = $(el).get(0).tagName;
        const text = $(el).text().trim();
        if (tag === 'h3') planning_md += `\n\n### ${text}\n`;
        else if (tag === 'p') planning_md += `${text}\n`;
      });

    // Things to do
    let things_md = '';
    $('h2:contains("Things to do")')
      .nextUntil('h2')
      .each((_, el) => {
        const tag = $(el).get(0).tagName;
        const text = $(el).text().trim();
        if (tag === 'h3') things_md += `\n\n### ${text}\n`;
        else if (tag === 'p') things_md += `${text}\n`;
      });

    // AI-generated overview
    const overview_md = await generateOverview(city, country, introText, attractions);

    // AI summary of all
    const ai_markdown = `# ${city}, ${country}\n\n${overview_md}\n\n## Planning Tools\n${planning_md}\n\n## Things to Do\n${things_md}`;

    // ✅ Array fallback values
    const popular_attractions = attractions.length > 0 ? attractions : [];
    const interests = ['culture', 'exploration'];

    // ✅ Insert to Supabase
    const { error } = await supabase.from('destinations').upsert([
      {
        slug,
        title: city,
        name: city,
        country,
        city,
        region: country,
        continent,
        link: generateLink(country, city),
        image: `https://source.unsplash.com/featured/?${city},${country}`,
        overview_md: overview_md || '',
        itinerary_md: '',
        planning_tools_md: planning_md || '',
        things_to_do_md: things_md || '',
        popular_attractions,
        interests,
        source: 'lp',
        popularity: Math.floor(Math.random() * 100),
        ai_markdown,
      },
    ]);

    if (error) {
      console.error(`❌ Supabase insert failed for ${city}:`, error.message);
    } else {
      console.log(`✅ Inserted: ${city}`);
    }
  } catch (err) {
    console.error(`❌ Failed to scrape ${city}: ${err.message}`);
  }
}

// 🏁 Runner
async function runLonelyPlanetScraper() {
  console.log('🚀 Starting Lonely Planet scraper...');
  for (const dest of destinationList) {
    await scrapeDestination(dest);
  }
  console.log('🎉 LP scraping completed');
}

module.exports = { runLonelyPlanetScraper };
