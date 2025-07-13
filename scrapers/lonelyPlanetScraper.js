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

// 🧠 AI Overview Generator
async function generateOverview(city, country, text, attractionsList) {
  const systemPrompt = `You are a travel expert. Write a short but vivid and engaging summary for a travel destination, and end with a list of must-see attractions.`;

  const message = `${city}, ${country}\n\n${text}\n\nMust-see: ${attractionsList.join(', ')}`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
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

  console.log(`🌍 Scraping: ${url}`);
  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    // ✅ Overview text
    const introText = $('meta[name="description"]').attr('content') || '';

    // ✅ Must-see attractions
    const attractions = [];
    $('h2:contains("Must-see attractions")').next().find('a').each((_, el) => {
      const name = $(el).text().trim();
      if (name && !attractions.includes(name)) attractions.push(name);
    });

    // ✅ Planning tools (Best time, How to get around, etc.)
    let planning_md = '';
    $('h2:contains("Planning Tools")').nextUntil('h2').each((_, el) => {
      const tag = $(el).get(0).tagName;
      const text = $(el).text().trim();
      if (tag === 'h3') planning_md += `\n\n### ${text}\n`;
      else if (tag === 'p') planning_md += `${text}\n`;
    });

    // ✅ Things to do (optional section)
    let things_md = '';
    $('h2:contains("Things to do")').nextUntil('h2').each((_, el) => {
      const tag = $(el).get(0).tagName;
      const text = $(el).text().trim();
      if (tag === 'h3') things_md += `\n\n### ${text}\n`;
      else if (tag === 'p') things_md += `${text}\n`;
    });

    // ✅ AI overview
    const overview_md = await generateOverview(city, country, introText, attractions);

    // ✅ Insert into Supabase
    const { error } = await supabase.from('destinations').upsert([
      {
        slug,
        title: city,
        country,
        city,
        region: country,
        continent,
        link: generateLink(country, city),
        image: `https://source.unsplash.com/featured/?${city},${country}`,
        overview_md,
        itinerary_md: '', // Left for itinerary scraper
        planning_tools_md: planning_md.trim(),
        things_to_do_md: things_md.trim(),
        popular_attractions: attractions,
        interests: ['culture', 'exploration'],
        source: 'lp',
        popularity: Math.floor(Math.random() * 100),
        ai_markdown: `# ${city}, ${country}\n\n${overview_md}\n\n## Planning Tools\n${planning_md}`,
      },
    ]);

    if (error) {
      console.error(`❌ Supabase error:`, error.message);
    } else {
      console.log(`✅ Saved: ${city}`);
    }
  } catch (err) {
    console.error(`❌ Failed to scrape ${city}: ${err.message}`);
  }
}

// 🏁 Runner
async function runLonelyPlanetScraper() {
  for (const destination of destinationList) {
    await scrapeDestination(destination);
  }
  console.log('🎉 LP scraping completed');
}

module.exports = { runLonelyPlanetScraper };
