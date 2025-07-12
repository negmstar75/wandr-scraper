import { createClient } from '@supabase/supabase-js';
import { getMockDestinations, generateSlug } from '../scrapers/mockLonelyPlanet.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const verifyRequest = (req) => {
  const incomingSecret = req.headers.authorization?.replace('Bearer ', '');
  return incomingSecret === process.env.CRON_SECRET;
};

export async function handler(req) {
  if (req.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!verifyRequest(req)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const slugParam = req.queryStringParameters?.slug || '';
  const mockData = getMockDestinations();
  let inserted = 0;

  for (const dest of mockData) {
    const slug = generateSlug({ city: dest.city, country: dest.country, name: dest.title });

    if (!slug.includes(slugParam)) continue;

    const { data: existing } = await supabase
      .from('destinations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('destinations').insert([
        { ...dest, slug, name: dest.title, images: [dest.image] },
      ]);
      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      inserted++;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'ok', inserted }),
  };
}
