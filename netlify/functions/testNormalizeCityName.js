/**
 * Netlify Function: testNormalizeCityName
 * -----------------------------------------------
 * Cleans city names by removing duplicated IATA codes
 * e.g. "Cairo (CAI - Cairo Intl.) (CAI)" → "Cairo (CAI - Cairo Intl.)"
 */

exports.handler = async () => {
  // --- Normalization helper ---
  function normalizeCityName(city) {
    if (!city) return "";

    let cleaned = city.trim();

    // remove duplicated IATA code at end, e.g. "Rome (FCO - Leonardo da Vinci Intl.) (FCO)"
    cleaned = cleaned.replace(/\s+\(([A-Z]{3})\)\s*$/, "");

    // remove inner duplicates like "(CAI - Cairo Intl.) (CAI)"
    cleaned = cleaned.replace(/\(([A-Z]{3})\s*-\s*([^)]*)\)\s*\(\1\)/, (_m, code, name) => {
      return `(${code} - ${name.trim()})`;
    });

    return cleaned;
  }

  // --- Sample test data ---
  const samples = [
    "Cairo (CAI - Cairo Intl.) (CAI)",
    "Paris (CDG - Charles De Gaulle) (CDG)",
    "New York (JFK) (JFK)",
    "London (LHR - Heathrow) (LHR)",
    "Tokyo (HND)",
    "Dubai (DXB - Dubai Intl.) (DXB)",
    "Los Angeles (LAX)",
    "Rome (FCO - Leonardo da Vinci Intl.) (FCO)",
  ];

  // --- Run normalization ---
  const results = samples.map((s) => ({
    before: s,
    after: normalizeCityName(s),
  }));

  // --- Return JSON for browser or Postman view ---
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Normalization test results", results }, null, 2),
  };
};
