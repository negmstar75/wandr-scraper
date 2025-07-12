// scrapers/mockLonelyPlanet.js

export function getMockDestinations() {
  return [
    {
      city: 'Tokyo',
      country: 'Japan',
      title: 'Tokyo Highlights',
      description: 'Explore Japan’s capital city from shrines to sushi.',
      image: 'https://source.unsplash.com/featured/?tokyo',
    },
    {
      city: 'Amman',
      country: 'Jordan',
      title: 'Historic Jordan',
      description: 'Experience Petra, Wadi Rum, and the Dead Sea.',
      image: 'https://source.unsplash.com/featured/?jordan',
    },
    {
      city: 'Rome',
      country: 'Italy',
      title: 'Rome Essentials',
      description: 'Colosseum, Vatican, and ancient streets.',
      image: 'https://source.unsplash.com/featured/?rome',
    }
  ];
}

export function generateSlug({ city, country, name }) {
  const slugify = (str) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

  return `${slugify(country)}/${slugify(city)}-${slugify(name)}`;
}
