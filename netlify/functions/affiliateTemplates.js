// --------------------------------------------
// 🌍 Travel Affiliate Deep-Link Templates
// Built from verified Paris examples
// --------------------------------------------

export const affiliateTemplates = {
  booking: {
    name: "Booking.com",
    category: "hotel",
    base_url: "https://tp.media/r",
    campaign_id: "84",
    partner_id: "2076",
    logo_url: "https://content.skyscnr.com/m/78f2269827c54383/original/bookingcom-logo.png",
    template:
      "https://www.booking.com/searchresults.html?checkin={checkin}&checkout={checkout}&ss={destination}&group_adults={adults}&group_children={children}",
    params: ["destination", "checkin", "checkout", "adults", "children"],
  },

  expedia: {
    name: "Expedia",
    category: "hotel",
    base_url: "https://tp.media/r",
    campaign_id: "594",
    partner_id: "8645",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/8/89/Expedia_Logo.svg",
    template:
      "https://www.expedia.com/Hotel-Search?destination={destination}&d1={checkin}&d2={checkout}&adults={adults}&rooms=1",
    params: ["destination", "checkin", "checkout", "adults"],
  },

  expedia_activities: {
    name: "Expedia - Things to Do",
    category: "activities",
    base_url: "https://tp.media/r",
    campaign_id: "594",
    partner_id: "8645",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/8/89/Expedia_Logo.svg",
    template:
      "https://www.expedia.com/things-to-do/search?location={destination}&startDate={checkin}&endDate={checkout}&sort=RECOMMENDED",
    params: ["destination", "checkin", "checkout"],
  },

  getyourguide: {
    name: "GetYourGuide",
    category: "activities",
    base_url: "https://tp.media/r",
    campaign_id: "108",
    partner_id: "3965",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/f/f2/GetYourGuide_logo.svg",
    template: "https://www.getyourguide.com/{slug}-l16/",
    params: ["slug"],
  },

  tripadvisor: {
    name: "Tripadvisor",
    category: "activities",
    base_url: "https://tp.media/r",
    campaign_id: "149",
    partner_id: "4456",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/6/6f/Tripadvisor_Logo.svg",
    template: "https://www.tripadvisor.com/Tourism-g187147-{slug}-Vacations.html",
    params: ["slug"],
  },

  tiqets: {
    name: "Tiqets",
    category: "activities",
    base_url: "https://tp.media/r",
    campaign_id: "89",
    partner_id: "2074",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/2/29/Tiqets_logo.svg",
    template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/",
    params: ["slug"],
  },

  klook: {
    name: "Klook",
    category: "activities",
    base_url: "https://tp.media/r",
    campaign_id: "137",
    partner_id: "4110",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/9/9c/Klook_logo.svg",
    template:
      "https://www.klook.com/search/result/?query={destination}&sort=most_relevant",
    params: ["destination"],
  },

  rentalcars: {
    name: "Rentalcars",
    category: "car_rental",
    base_url: "https://tp.media/r",
    campaign_id: "130",
    partner_id: "3814",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/4/46/Rentalcars.com_logo.svg",
    template:
      "https://www.rentalcars.com/search-results?locationName={destination}&driversAge={age}&puDay={pickup_day}&puMonth={pickup_month}&puYear={pickup_year}&doDay={drop_day}&doMonth={drop_month}&doYear={drop_year}",
    params: ["destination", "age", "pickup_day", "pickup_month", "pickup_year", "drop_day", "drop_month", "drop_year"],
  },

  cheapoair: {
    name: "CheapoAir",
    category: "flights",
    base_url: "https://tp.media/r",
    campaign_id: "146",
    partner_id: "4426",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/15/CheapOair_logo.svg",
    template:
      "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}",
    params: ["origin", "destination", "depart", "return", "tripType"],
  },

  hostelworld: {
    name: "Hostelworld",
    category: "hotel",
    base_url: "https://tp.media/r",
    campaign_id: "93",
    partner_id: "3518",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/1c/Hostelworld_logo.svg",
    template:
      "https://www.hostelworld.com/pwa/s?city={destination}&from={checkin}&to={checkout}&guests={adults}",
    params: ["destination", "checkin", "checkout", "adults"],
  },

  wegotrip: {
    name: "WeGoTrip",
    category: "activities",
    base_url: "https://tp.media/r",
    campaign_id: "150",
    partner_id: "4487",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/b/b5/WeGoTrip_logo.svg",
    template: "https://wegotrip.com/{slug}-d3/",
    params: ["slug"],
  },

  gocity: {
    name: "GoCity",
    category: "activities",
    base_url: "https://tp.media/r",
    campaign_id: "62",
    partner_id: "1942",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/3/3b/GoCity_logo.svg",
    template: "https://gocity.com/en/{slug}/passes",
    params: ["slug"],
  },

  airalo: {
    name: "Airalo",
    category: "tools",
    base_url: "https://tp.media/r",
    campaign_id: "541",
    partner_id: "8310",
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/1d/Airalo_logo.svg",
    template: "https://www.airalo.com/{slug}-esim",
    params: ["slug"],
  },

  lonelyplanet: {
    name: "Lonely Planet",
    category: "guides",
    base_url: "",
    campaign_id: null,
    partner_id: null,
    logo_url: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Lonely_Planet_Logo.svg",
    template:
      "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program",
    params: ["slug"],
  },
};
