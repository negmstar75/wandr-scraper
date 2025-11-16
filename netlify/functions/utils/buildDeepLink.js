// utils/buildDeepLink.js

const { resolveIsoFromSlug, resolveIataFromSlug, resolveCountrySlugFromCity } = require("./enrichMapping");

// ----------------------------------------------------------
// Template substitution helper
// ----------------------------------------------------------
function applyTemplate(template = "", mapping = {}, extras = {}, context = {}) {
  const vars = {
    city_slug: mapping.city_slug || "",
    country_slug: mapping.country_slug || "",
    country_code: mapping.country_code || "",
    geo_id: mapping.geo_id || "",
    prefixed_geo_id: mapping.prefixed_geo_id || "",
    origin: context.origin || mapping.origin || mapping.origin_city || "",
    origin_code: context.origin_code || mapping.origin_code || "",
    origin_city: context.origin_city || mapping.origin_city || "",
    destination: mapping.destination || mapping.city_slug || "",
    destination_code: mapping.destination_code || "",
    destination_city: context.destination_city || mapping.destination_city || mapping.city_slug || "",
    depart: extras.depart_iso || "",
    return: extras.return_iso || "",
    depart_mm_dd_yyyy: extras.depart_mm_dd_yyyy || "",
    return_mm_dd_yyyy: extras.return_mm_dd_yyyy || "",
    depart_ddmm: extras.depart_ddmm || "",
    return_ddmm: extras.return_ddmm || "",
    depart_yyyy_mm_dd: extras.depart_yyyy_mm_dd || "",
    return_yyyy_mm_dd: extras.return_yyyy_mm_dd || "",
    adults: extras.adults || 2,
    slug: mapping.override_slug || mapping.city_slug || mapping.country_slug || "",
  };

  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

function wrapTpLink(baseUrl, targetUrl) {
  if (!baseUrl) return targetUrl;
  const encodedTarget = encodeURIComponent(targetUrl);
  if (/[?&]u=/.test(baseUrl)) {
    return baseUrl.replace(/([?&]u=)([^&]*)/, `$1${encodedTarget}`);
  }
  return baseUrl.includes("?")
    ? `${baseUrl}&u=${encodedTarget}`
    : `${baseUrl}?u=${encodedTarget}`;
}

function wrapOut(base, target) {
  const encoded = encodeURIComponent(target);
  const deep_link = wrapTpLink(base, target);
  return { deep_link, rawTarget: target, encodedTarget: encoded };
}

// ----------------------------------------------------------
// Deep link builder (used in generateAffiliateLinks_v3)
// ----------------------------------------------------------
function buildDeepLink(partner, mapping, extras, context = {}) {
  const base = partner.base_url || "";
  const template = partner.template_url || "";

  const partnerNeedsOrigin = [
    "aviasales",
    "expedia_flights",
    "booking_kayak",
    "cheapoair",
  ].includes(partner.partner_code);

  mapping.city_slug = mapping.city_slug || mapping.country_slug || "none";
  mapping.country_slug = mapping.country_slug || "";
  mapping.country_code =
    mapping.country_code ||
    resolveIsoFromSlug(mapping.city_slug) ||
    "XX";

  const resolved = {
    origin_code:
      context.origin_code ||
      mapping.origin_code ||
      process.env.DEFAULT_ORIGIN_CODE ||
      "CAI",
    origin_city:
      context.origin_city ||
      mapping.origin_city ||
      context.origin ||
      mapping.origin ||
      "Cairo",
    destination_code:
      mapping.destination_code ||
      mapping.geo_id ||
      mapping.iata_code ||
      mapping.city_slug?.slice(0, 3).toUpperCase() ||
      "XXX",
    destination_city:
      mapping.destination_city || mapping.city_slug || mapping.override_slug,
  };

  if (partnerNeedsOrigin && !resolved.origin_code && !resolved.origin_city) {
    resolved.origin_code = "CAI";
    resolved.origin_city = "Cairo";
  }

  const rawTarget = mapping.override_url
    ? applyTemplate(mapping.override_url, mapping, extras, resolved)
    : applyTemplate(template, mapping, extras, resolved);

  switch (partner.partner_code) {
    case "booking_stays": {
      const slug = mapping.city_slug || mapping.destination_city || "";
      const countryPart = mapping.country_slug ? `,+${mapping.country_slug}` : "";
      const baseTarget = `https://www.booking.com/searchresults.html?ss=${slug}${countryPart}`;
      const url = rawTarget || baseTarget;
      return wrapOut(base, url);
    }

    case "booking_cars":
      return wrapOut(base, rawTarget || `https://www.booking.com/cars/index.html`);

    case "booking_attractions": {
      let code = mapping.country_code;
      if (!code && mapping.city_slug) {
        code = resolveIsoFromSlug(mapping.city_slug) || null;
      }
      if (!code && mapping.country_slug) {
        code = mapping.country_slug.slice(0, 2).toUpperCase();
      }
      const codeLower = (code || "xx").toLowerCase();
      const url = `https://www.booking.com/attractions/searchresults/${codeLower}/${mapping.city_slug}.html`;
      return wrapOut(base, url);
    }

    case "gocity": {
      if (!mapping.id) return { deep_link: null, rawTarget: null, encodedTarget: null };
      const url = `https://gocity.com/en/${mapping.city_slug}`;
      return wrapOut(base, url);
    }

    case "elsewhere": {
      if (!mapping.id) return { deep_link: null, rawTarget: null, encodedTarget: null };
      const url = `https://www.elsewhere.io/${mapping.country_slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate`;
      return wrapOut(base, url);
    }

    case "lonelyplanet": {
      const alias = { baku: "baku-baki" };
      const citySlug = alias[mapping.city_slug] || mapping.city_slug;
      let countrySlug = mapping.country_slug;

      if (!countrySlug && mapping.city_slug) {
        countrySlug = resolveCountrySlugFromCity(mapping.city_slug) || "";
      }

      if (!citySlug || !countrySlug) {
        return wrapOut(base, "https://www.lonelyplanet.com/");
      }

      const url = `https://www.lonelyplanet.com/destinations/${countrySlug}/${citySlug}`;
      return wrapOut(base, url);
    }

    case "aviasales": {
      const iataMap = {
        "cape-town": "CPT",
        reykjavik: "REK",
        berlin: "BER",
        madrid: "MAD",
        amsterdam: "AMS",
        baku: "GYD",
      };

      let destIata =
        iataMap[mapping.city_slug?.toLowerCase()] ||
        mapping.iata_code ||
        resolveIataFromSlug(mapping.city_slug) ||
        (mapping.city_slug ? mapping.city_slug.slice(0, 3).toUpperCase() : "XXX");

      destIata = destIata.toUpperCase().substring(0, 3);

      const originFinal =
        context.origin_code?.toUpperCase() ||
        mapping.origin_code?.toUpperCase() ||
        process.env.DEFAULT_ORIGIN_CODE ||
        "LON";

      const flightPath = `${originFinal}${extras.depart_ddmm}${destIata}${extras.return_ddmm}1`;
      const aviasalesUrl = `https://www.aviasales.com/search/${flightPath}`;
      return wrapOut(base, aviasalesUrl);
    }


    case "cheapoair": {
      const originIata = (mapping.origin_code || context.origin_code || "LON")
        .slice(0, 3)
        .toUpperCase();

      const iataMap = {
        "cape-town": "CPT",
        reykjavik: "REK",
        berlin: "BER",
        madrid: "MAD",
        amsterdam: "AMS",
        baku: "GYD",
      };

      let destIata =
        iataMap[mapping.city_slug?.toLowerCase()] ||
        mapping.iata_code ||
        resolveIataFromSlug(mapping.city_slug) ||
        (mapping.city_slug ? mapping.city_slug.slice(0, 3).toUpperCase() : "XXX");

      const url = `https://www.cheapoair.com/air/listing?&d1=${originIata}&r1=${destIata}&dt1=${extras.depart_mm_dd_yyyy}&dtype1=A&rtype1=A&d2=${destIata}&r2=${originIata}&dt2=${extras.return_mm_dd_yyyy}&dtype2=A&rtype2=A&tripType=ROUNDTRIP`;

      return wrapOut(base, url);
    }

    case "booking_kayak": {
      const originIata = (mapping.origin_code || context.origin_code || "LON")
        .slice(0, 3)
        .toUpperCase();

      const iataMap = {
        "cape-town": "CPT",
        reykjavik: "REK",
        berlin: "BER",
        madrid: "MAD",
        amsterdam: "AMS",
        baku: "GYD",
      };

      const destIata =
        iataMap[mapping.city_slug?.toLowerCase()] ||
        mapping.iata_code ||
        resolveIataFromSlug(mapping.city_slug) ||
        mapping.city_slug?.slice(0, 3).toUpperCase() ||
        "XXX";

      const url = `https://booking.kayak.com/flights/${originIata}-${destIata}/${extras.depart_yyyy_mm_dd}/${extras.return_yyyy_mm_dd}`;

      return {
        deep_link: url,
        rawTarget: url,
        encodedTarget: encodeURIComponent(url),
      };
    }

    case "tripadvisor_attractions":
    case "tripadvisor_hotels":
    case "tripadvisor_restaurants": {
      const type = partner.partner_code.replace("tripadvisor_", "");
      const slug = mapping.city_slug;

      let url;

      if (!mapping.prefixed_geo_id) {
        switch (type) {
          case "attractions":
            url = `https://www.tripadvisor.com/Attractions--Activities-${slug}.html`;
            break;
          case "hotels":
            url = `https://www.tripadvisor.com/Hotels--${slug}-Hotels.html`;
            break;
          case "restaurants":
            url = `https://www.tripadvisor.com/Restaurants--${slug}.html`;
            break;
          default:
            url = `https://www.tripadvisor.com/Search?q=${slug}`;
        }
      } else {
        switch (type) {
          case "attractions":
            url = `https://www.tripadvisor.com/Attractions-${mapping.prefixed_geo_id}-Activities-${slug}.html`;
            break;
          case "hotels":
            url = `https://www.tripadvisor.com/Hotels-${mapping.prefixed_geo_id}-Hotels-${slug}.html`;
            break;
          case "restaurants":
            url = `https://www.tripadvisor.com/Restaurants-${mapping.prefixed_geo_id}-${slug}.html`;
            break;
          default:
            url = `https://www.tripadvisor.com/Search?q=${slug}`;
        }
      }

      return wrapOut(base, url);
    }

    case "getyourguide": {
      const slug = mapping.city_slug;
      if (!slug) {
        return wrapOut(base, base || "https://www.getyourguide.com/");
      }
      const url = `https://www.getyourguide.com/s/?q=${slug}`;
      return wrapOut(base, url);
    }

    default:
      return wrapOut(base, rawTarget || template || base);
  }
}

module.exports = { buildDeepLink };
