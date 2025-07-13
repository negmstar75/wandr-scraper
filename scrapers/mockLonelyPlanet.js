const slugify = require('slugify');
const { OpenAI } = require('openai');
require('dotenv').config();

// 🧠 Init OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 📦 Base mock data
function getMockDestinationsBase() {
  return [
    {
      title: 'Best of Jordan',
      city: 'Amman',
      country: 'Jordan',
      image: 'https://source.unsplash.com/featured/?Jordan',
      description: 'Explore Petra, the Dead Sea, and desert landscapes with rich culture in a 7-day trip.',
    },
    {
      title: 'Explore Japan',
      city: 'Tokyo',
      country: 'Japan',
      image: 'https://source.unsplash.com/featured/?Japan',
      description: 'From futuristic Tokyo to the serene temples of Kyoto, experience Japan’s contrasts in one journey.',
    },
  ];
}

// 🧭 Slug generator
function generateSlug({ city, country, name }) {
  return `${slugify(country, { lower: true })}/${slugify(name, { lower: true })}`;
}

// ✨ Enrich each destination with AI-generated summaries & fields
async function enrichMockDestinations() {
  const base = getMockDestinationsBase();
  const enriched = [];

  for (const dest of base) {
    const prompt = `${dest.title}\n${dest.description}\nLocated in ${dest.city}, ${dest.country}.`;

    try {
      const summaryRes = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a travel expert. Generate a rich, engaging 3–5 sentence overview for a travel destination.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const overview_md = summaryRes.choices?.[0]?.message?.content?.trim() || '';

      enriched.push({
        ...dest,
        slug: generateSlug(dest),
        name: dest.title,
        overview_md,
        ai_markdown: `${prompt}\n\n${overview_md}`,
        itinerary_md: '',
        popularity: Math.floor(Math.random() * 100),
        interests: ['culture', 'nature'],
        continent: dest.country === 'Japan' ? 'Asia' : 'Middle East',
        link: '',
        attractions: [],
      });
    } catch (err) {
      console.error(`❌ OpenAI enrichment failed for "${dest.title}": ${err.message}`);
    }
  }

  return enriched;
}

module.exports = {
  getMockDestinations: enrichMockDestinations,
  generateSlug,
};
