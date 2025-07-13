const axios = require('axios');
const cheerio = require('cheerio');
const slugify = require('slugify');
const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 🌍 Destinations
const destinationList = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

// 🔗 Affiliate Link Builder
function generateLink(country, city) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  return `https://www.lonelyplanet.com/destinations/${slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program`;
}

// 🧠 AI Summary Generator
async function generateOverview(city, country, intro, attractions) {
  const prompt = `You are a travel writer. Write a vivid and informative 3-5 paragraph summary about visiting ${city}, ${country}. Include cultural insights, travel tips, and mention key attractions.`;

  const userInput = `${intro}\n\nKey attractions: ${attractions.join(', ')}`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: userInput },
    ],
  });

  return res.choices?.[0]?.message?.content?.trim() || '';
}

// 🕵️ Scrape One Destination
async function scrapeDestination({ city, country, continent }) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  const url = `https://www.lonelyplanet.com/destinations/${slug}`;

  console.log(`🌍 Scraping: ${city}, ${country}`);
  console.log(`🔗 URL: ${url}`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    const introText = $('meta[name="description"]').attr('content') || '';

    // Attractions
    const attractions = [];
    $('h2:contains("Must-see attractions")')
      .next()
      .find('a')
      .each((_, el) => {
        const text = $(el).text().trim();
        if (text && !attractions.includes(text)) attractions.push(text);
      });

    // Planning tools
    let planning_md = '';
    $('h2:contains("Planning Tools")').nextUntil('h2').each((_, el) => {
      const tag = el.tagName;
      const text = $(el).text().trim();
      if (tag === 'h3') planning_md += `\n\n### ${text}\n`;
      else if (tag === 'p') planning_md += `${text}\n`;
    });

    // Things to do
    let things_md = '';
    $('h2:contains("Things to do")').nextUntil('h2').each((_, el) => {
      const tag = el.tagName;
      const text = $(el).text().trim();
      if (tag === 'h3') things_md += `\n\n### ${text}\n`;
      else if (tag === 'p') things_md += `${text}\n`;
    });

    // AI overview
    const overview_md = await generateOverview(city, country, introText, attractions);

    // Insert to Supabase
    const { error } = await supabase.from('destinations').upsert(
      [
        {
          slug,
          title: city,
          name: city,
          city,
          country,
          region: country,
          continent,
          image: `https://source.unsplash.com/featured/?${city},${country}`,
          link: generateLink(country, city),
          overview_md,
          itinerary_md: '',
          planning_tools_md: planning_md.trim(),
          things_to_do_md: things_md.trim(),
          popular_attractions: attractions.length ? attractions : null,
          interests: ['culture', 'exploration'],
          popularity: Math.floor(Math.random() * 100),
          source: 'lp',
          ai_markdown: `## Overview\n${overview_md}\n\n## Planning Tools\n${planning_md}\n\n## Things to Do\n${things_md}`,
        },
      ],
      { onConflict: 'slug' }
    );

    if (error) {
      console.error(`❌ Supabase insert failed for ${city}: ${error.message}`);
    } else {
      console.log(`✅ Saved: ${city}`);
    }
  } catch (err) {
    console.error(`❌ Failed to scrape ${city}: ${err.message}`);
  }
}

// 🚀 Runner
async function runLonelyPlanetScraper() {
  console.log('🚀 Starting Lonely Planet scraper...');
  for (const destination of destinationList) {
    await scrapeDestination(destination);
  }
  console.log('🎉 LP scraping completed');
}

module.exports = { runLonelyPlanetScraper };
