// Writes the synthetic test town as an Overpass-like JSON fixture (used by E2E tests offline).
import { writeFileSync } from 'node:fs';
import { syntheticOverpass } from '../tests/helpers/synthetic';
writeFileSync('fixtures/synthetic.overpass.json', JSON.stringify(syntheticOverpass()));
console.log('fixtures/synthetic.overpass.json written');
