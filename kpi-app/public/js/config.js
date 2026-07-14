// Fallback file used for local development / before Netlify has run the
// build step. In production this file is REPLACED automatically by
// scripts/generate-config.js using the SUPABASE_URL and SUPABASE_ANON_KEY
// environment variables set in Netlify (Site settings > Environment variables).
//
// For local testing you can also just fill in the values below directly -
// just don't commit real keys to a public repository.
window.__SUPABASE_CONFIG__ = {
  url: "",
  anonKey: ""
};
