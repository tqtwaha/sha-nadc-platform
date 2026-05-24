// @sha-nadc/types — single source of truth for the domain.
// Every other package (UI, API, mobile, sim engine) imports from here.
//
// Zod schemas are defined once; TS types are derived. When the schema
// changes, every consumer gets a type error at build time — the entire
// reason we're rebuilding in TypeScript.

export * from './priority';
export * from './incident';
export * from './unit';
export * from './hospital';
export * from './agent';
export * from './call';
export * from './triage';
export * from './claim';
export * from './provider';
