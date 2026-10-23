// Loaded by index.html as a classic script, so it runs before any module.
// zod 4 compiles object validators with `new Function` after probing whether
// eval is allowed; under the CSP (no 'unsafe-eval') both the probe and the
// compile attempts are reported as violations. jitless makes zod use its
// interpreter instead. It must be set before zod evaluates, which a module
// import can't guarantee because the bundler hoists shared chunks.
globalThis.__zod_globalConfig = Object.assign(globalThis.__zod_globalConfig || {}, {
  jitless: true,
});
