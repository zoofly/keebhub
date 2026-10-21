-- Starter switch catalog: well-known switches by name, type and
-- manufacturer only (no images, no spec numbers). The original catalog data
-- was never committed; extend or correct this list in a later migration.
INSERT INTO switches (name, manufacturer, switch_type) VALUES
  ('Cherry MX Red', 'Cherry', 'linear'),
  ('Cherry MX Black', 'Cherry', 'linear'),
  ('Cherry MX Silent Red', 'Cherry', 'linear'),
  ('Cherry MX Speed Silver', 'Cherry', 'linear'),
  ('Cherry MX Brown', 'Cherry', 'tactile'),
  ('Cherry MX Blue', 'Cherry', 'clicky'),
  ('Gateron Red', 'Gateron', 'linear'),
  ('Gateron Yellow', 'Gateron', 'linear'),
  ('Gateron Oil King', 'Gateron', 'linear'),
  ('Gateron Brown', 'Gateron', 'tactile'),
  ('Gateron Blue', 'Gateron', 'clicky'),
  ('Kailh Box White', 'Kailh', 'clicky'),
  ('Kailh Box Jade', 'Kailh', 'clicky'),
  ('Kailh Box Brown', 'Kailh', 'tactile'),
  ('NovelKeys Cream', 'NovelKeys', 'linear'),
  ('Akko CS Jelly Pink', 'Akko', 'linear'),
  ('Durock T1', 'Durock', 'tactile'),
  ('Boba U4T', 'Gazzew', 'tactile'),
  ('Zealios V2', 'ZealPC', 'tactile'),
  ('Holy Panda', 'Drop', 'tactile');
