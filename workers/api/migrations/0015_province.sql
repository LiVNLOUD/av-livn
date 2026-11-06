-- I5: province of the spot (OSM admin_level=4: bursa / yalova / balikesir; NULL = not assigned). Spots outside
-- Bursa are kept, listed as "Bursa dışı" and left out of the home page plan.
ALTER TABLE spots ADD COLUMN province TEXT;
UPDATE meta SET value = 'v3.0' WHERE key = 'schema';
