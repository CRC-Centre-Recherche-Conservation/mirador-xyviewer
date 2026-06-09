/**
 * Ambient shims for untyped external modules — TEST SCOPE ONLY.
 *
 * `src/test/**` is excluded from `tsconfig.build.json`, so nothing here is emitted
 * to `dist/` or shipped to consumers. This exists solely so the plugin-wiring
 * integration test can `import('../../demo/main')`, which pulls in the demo's
 * untyped `mirador-image-tools` dependency into the type-check graph.
 */
declare module 'mirador-image-tools';
