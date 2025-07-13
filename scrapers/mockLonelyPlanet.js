function getMockDestinations() {
  return [
    {
      title: 'Best of Jordan',
      city: 'Amman',
      country: 'Jordan',
      image: 'https://source.unsplash.com/featured/?Jordan',
      description: '7-day highlights of Jordan including Petra and Wadi Rum',
    },
    {
      title: 'Explore Japan',
      city: 'Tokyo',
      country: 'Japan',
      image: 'https://source.unsplash.com/featured/?Japan',
      description: 'Modern cities to ancient temples',
    },
  ];
}

function generateSlug({ city, country, name }) {
  const slugify = require('slugify');
  return `${slugify(country, { lower: true })}/${slugify(name, { lower: true })}`;
}

module.exports = {
  getMockDestinations,
  generateSlug,
};
