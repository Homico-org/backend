/**
 * Aggregator for all category seed files.
 * Order here defines insertion order; the seeder writes `sortOrder` from the array index.
 */

import { cleaningCategory } from './cleaning';
import { handymanCategory } from './handyman';
import { landscapingCategory } from './landscaping';
import { moversCategory } from './movers';
import { plumbingCategory } from './plumbing';
import { electricalCategory } from './electrical';
import { paintersCategory } from './painters';
import { hvacCategory } from './hvac';
import { contractorsCategory } from './contractors';
import { architectsCategory } from './architects';
import { poolspaCategory } from './pool-spa';
import { roofingCategory } from './roofing';
import { windowsdoorsCategory } from './windows-doors';
import { concretemasonryCategory } from './concrete-masonry';

export const allCategories = [
  cleaningCategory,
  handymanCategory,
  landscapingCategory,
  moversCategory,
  plumbingCategory,
  electricalCategory,
  paintersCategory,
  hvacCategory,
  contractorsCategory,
  architectsCategory,
  poolspaCategory,
  roofingCategory,
  windowsdoorsCategory,
  concretemasonryCategory,
];
