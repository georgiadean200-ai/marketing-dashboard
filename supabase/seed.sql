-- Brands and their approved guidelines (from the studio's Brand guidelines page).
insert into public.brands (id, name, short_name, guidelines) values
('ttc', 'The Tile Collective', 'TTC', jsonb_build_object(
  'tag', 'Curated to Elevate',
  'voice', 'Elevated, refined, polished and aspirational. Design-led and confident. Lets the tile be the hero; describes texture, light and finish rather than hype.',
  'audience', 'Homeowners renovating, interior designers, architects and builders in South East Queensland who care about finish.',
  'avoid', 'cheap, bargain, budget, deal, discount',
  'palette', E'Black #000000\nCharcoal #333333\nGraphite #666666\nSilver #CCCCCC\nPale lime #F7FAE0\nSoft lime #F0FF94\nLime #D2DE26\nWhite #FFFFFF',
  'type', 'Glancyr for headings, Gotham for body copy.',
  'notes', 'Showroom in Herston. Australian English. Never alter the colour, texture, shape or proportions of real tiles in creative.',
  'cadence', jsonb_build_object('1', 'Inspiration', '3', 'Tile of the Week', '5', 'Product Feature'))),
('cto', 'Cheap Tiles Online', 'CTO', jsonb_build_object(
  'tag', '',
  'voice', 'Value-focused, straightforward, accessible and conversion-oriented. Clear benefits and a clear call to action. Friendly and practical.',
  'audience', 'DIY renovators and budget-conscious homeowners shopping online.',
  'avoid', 'luxury, exclusive, bespoke',
  'palette', '', 'type', 'Glancyr for headings, Gotham for body copy.',
  'notes', 'Online-only. Three Instagram posts per week. Australian English.',
  'cadence', jsonb_build_object('1', 'Inspiration', '3', 'Tile of the Week', '5', 'Product Feature')))
on conflict (id) do nothing;
