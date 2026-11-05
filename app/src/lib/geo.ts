// US states and Canadian provinces. Two letters each, so one field fits both countries.
export const COUNTRIES = [["US", "United States"], ["CA", "Canada"]] as const;
export const COUNTRY_NAME: Record<string, string> = Object.fromEntries(COUNTRIES);
export const US_STATES: Record<string, string> = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
export const CA_PROVINCES: Record<string, string> = { AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon" };
export const regionsOf = (country: string) => (country === "CA" ? CA_PROVINCES : US_STATES);
export const regionLabel = (country: string) => (country === "CA" ? "Province" : "State");
export const validRegion = (country: string, code: string) => !!regionsOf(country)[code];

// Best guess at the country without asking: the phone's language and time zone. The server's guess (from the connection) wins when it has one.
export function guessCountry(): "US" | "CA" {
  try {
    const lang = navigator.language || "";
    if (/-CA$/i.test(lang)) return "CA";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal|Moncton|Whitehorse|Yellowknife|Iqaluit|Thunder_Bay|Dawson|Glace_Bay|Goose_Bay|Inuvik|Rankin_Inlet|Resolute|Cambridge_Bay|Swift_Current|Creston|Fort_Nelson|Atikokan|Blanc-Sablon)$/.test(tz)) return "CA";
  } catch { /* server or odd browser */ }
  return "US";
}
