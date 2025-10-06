// --------------------------------------------
// 🌍 Unified Affiliate Templates & Config
// --------------------------------------------
export const affiliateTemplates = {
  config: {
    marker: "466615",
    trs: "252990",
  },

  partners: {
    // === Hotels ===
    booking: {
      name: "Booking.com",
      base_url: "https://tp.media/r",
      campaign_id: "84",
      partner_id: "2076",
      logo_url: "https://content.skyscnr.com/m/78f2269827c54383/original/bookingcom-logo.png",
      template: "https://www.booking.com/searchresults.html?ss={destination}&checkin={checkin}&checkout={checkout}&group_adults={adults}&group_children={children}",
    },
    expedia: {
      name: "Expedia",
      base_url: "https://tp.media/r",
      campaign_id: "594",
      partner_id: "8645",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/8/89/Expedia_Logo.svg",
      template: "https://www.expedia.com/Hotel-Search?destination={destination}&d1={checkin}&d2={checkout}&adults={adults}&rooms=1",
    },
    hostelworld: {
      name: "Hostelworld",
      base_url: "https://tp.media/r",
      campaign_id: "93",
      partner_id: "3518",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/7/70/Hostelworld_logo.svg",
      template: "https://www.hostelworld.com/pwa/s?city={destination}&from={checkin}&to={checkout}&guests={adults}",
    },

    // === Activities ===
    getyourguide: {
      name: "GetYourGuide",
      base_url: "https://tp.media/r",
      campaign_id: "108",
      partner_id: "3965",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/f/f2/GetYourGuide_logo.svg",
      template: "https://www.getyourguide.com/{slug}-l16/",
    },
    tripadvisor: {
      name: "Tripadvisor",
      base_url: "https://tp.media/r",
      campaign_id: "149",
      partner_id: "4456",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/6/6f/Tripadvisor_Logo.svg",
      template: "https://www.tripadvisor.com/Tourism-g187147-{slug}-Vacations.html",
    },
    tiqets: {
      name: "Tiqets",
      base_url: "https://tp.media/r",
      campaign_id: "89",
      partner_id: "2074",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/d/db/Tiqets_logo.svg",
      template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/",
    },
    klook: {
      name: "Klook",
      base_url: "https://tp.media/r",
      campaign_id: "137",
      partner_id: "4110",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/9/9c/Klook_logo.svg",
      template: "https://www.klook.com/search/result/?query={destination}&sort=most_relevant",
    },
    wegotrip: {
      name: "WeGoTrip",
      base_url: "https://tp.media/r",
      campaign_id: "150",
      partner_id: "4487",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/8/83/WeGoTrip_logo.svg",
      template: "https://wegotrip.com/{slug}-d3/",
    },
    gocity: {
      name: "GoCity",
      base_url: "https://tp.media/r",
      campaign_id: "62",
      partner_id: "1942",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/3/35/GoCity_logo.svg",
      template: "https://gocity.com/en/{slug}/passes",
    },
    bigbustours: {
      name: "BigBusTours",
      base_url: "https://tp.media/r",
      campaign_id: "133",
      partner_id: "4036",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Big_Bus_Tours_logo.svg",
      template: "https://www.bigbustours.com/en/{slug}/{slug}-bus-tours",
    },

    // === Transport & Flights ===
    cheapoair: {
      name: "CheapoAir",
      base_url: "https://tp.media/r",
      campaign_id: "146",
      partner_id: "4426",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/15/CheapOair_logo.svg",
      template: "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}",
    },
    raileurope: {
      name: "RailEurope",
      base_url: "https://tp.media/r",
      campaign_id: "69",
      partner_id: "1935",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/7/74/RailEurope_logo.svg",
      template: "https://www.raileurope.com/en/journey/{slug}-london-q91f6a",
    },

    // === Cars & Mobility ===
    rentalcars: {
      name: "Rentalcars",
      base_url: "https://tp.media/r",
      campaign_id: "130",
      partner_id: "3814",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/0/0e/Rentalcars.com_logo.svg",
      template: "https://www.rentalcars.com/search-results?locationName={destination}&driversAge=30&puDay=10&puMonth=10&puYear=2025",
    },
    getrentacar: {
      name: "GetRentacar",
      base_url: "https://tp.media/r",
      campaign_id: "222",
      partner_id: "5996",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/8/8f/GetRentacar_logo.svg",
      template: "https://getrentacar.com/en-US/car-rental/request?pickup[location]={destination}",
    },
    bikesbooking: {
      name: "BikesBooking",
      base_url: "https://tp.media/r",
      campaign_id: "57",
      partner_id: "1767",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/3/38/BikesBooking_logo.svg",
      template: "https://bikesbooking.com/en/search/?country={country}&pickUpCity={city}",
    },

    // === Tools / Others ===
    airalo: {
      name: "Airalo",
      base_url: "https://tp.media/r",
      campaign_id: "541",
      partner_id: "8310",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/1d/Airalo_logo.svg",
      template: "https://www.airalo.com/{slug}-esim",
    },
    eatwith: {
      name: "EatWith",
      base_url: "https://tp.media/r",
      campaign_id: "164",
      partner_id: "4696",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/5/55/Eatwith_logo.svg",
      template: "https://www.eatwith.com/search?q={destination}",
    },
    wayaway: {
      name: "WayAway",
      base_url: "https://tp.media/r",
      campaign_id: "200",
      partner_id: "5976",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/1a/WayAway_logo.svg",
    },

    // === Non-TP Partner ===
    lonelyplanet: {
      name: "Lonely Planet",
      base_url: "",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Lonely_Planet_Logo.svg",
      template: "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D",
    },
  },
};
