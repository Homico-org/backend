/**
 * Painters — category C07 (painters).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const paintersCategory = cat(
  "C07",
  "painters",
  "Paintbrush",
  "#EC4899",
  5,
  6,
  [
    sub("S031", "painter", "Paintbrush", [
      svc("V107", "paint_interior_svc", [U.sqm(5, 15), U.room(60, 250)]),
      svc("V108", "paint_ceiling_svc", [U.sqm(6, 18), U.room(50, 200)]),
      svc("V109", "paint_wallpaper_svc", [U.sqm(5, 20), U.room(70, 300)]),
      svc("V110", "paint_trim_svc", [U.meter(4, 12), U.unit(30, 120)]),
      // Limewash (ლაიმვოში) - premium painting method that appears across both
      // Tbilisi estimates (PDF sections 15.2, 17.2, 19.3, 21.2). Different
      // technique from standard interior paint - pros bill it separately.
      svc("V215", "paint_limewash_svc", [U.sqm(16, 30)]),
    ], 0, {
      keywords: [
        // Colloquial / transliterated forms users actually type when
        // searching for painters - covers all three locales plus
        // Latin transliteration of Georgian and Russian.
        { en: "paint painter painting", ka: "მღებავი შეღებვა საღებავი", ru: "покраска маляр" },
        { en: "shebva ghebva", ka: "შეღებვა ღებავა", ru: "" },
      ],
    }),
    sub("S032", "exterior_paint", "PaintRoller", [
      svc("V111", "paint_exterior_svc", [U.sqm(8, 25)]),
      svc("V112", "paint_fence_svc", [U.meter(8, 25), U.sqm(6, 18)]),
      svc("V113", "paint_metal_svc", [U.sqm(10, 30)]),
    ], 1, {
      keywords: [
        { en: "exterior facade paint outdoor", ka: "ფასადის შეღებვა გარე", ru: "фасад покраска снаружи" },
      ],
    }),
    sub("S033", "plasterer", "Layers", [
      svc("V114", "plaster_walls_svc", [U.sqm(8, 25)]),
      svc("V115", "plaster_drywall_svc", [U.sqm(12, 35)]),
      svc("V116", "plaster_ceiling_svc", [U.sqm(10, 30)]),
      svc("V117", "plaster_decorative_svc", [U.sqm(20, 60)]),
      // Q3 prep — sanding → priming → 2x base putty → fiberglass mesh →
      // 2x final putty → final sanding. Industry-standard premium prep in
      // Georgia (Q1/Q2/Q3 grading from German DIN spec). Real estimates bill
      // this as ~50-85 ₾/sqm bundled (PDF sec 14 sums to ~68 ₾/sqm).
      svc("V216", "paint_q3_prep_svc", [U.sqm(50, 85)]),
    ], 2, {
      // The "gipso wall maker" case the user reported. Catalog stores
      // the canonical names ("Plasterer & drywaller" / "შელესვა და
      // გიფსოკარტონი" / "Штукатурка и гипсокартон") but real users
      // type "gipso" or "плита" on Tbilisi construction sites. These
      // keywords make the local search hit even without the frontend
      // synonym map (which can be retired once every relevant
      // subcategory has its keywords filled in).
      keywords: [
        { en: "drywall gypsum plasterboard gipso", ka: "გიფსოკარტონი გიფსო", ru: "гипсокартон гипс плита" },
        { en: "plaster wall ceiling smoothing", ka: "შელესვა გასწორება", ru: "штукатурка выравнивание" },
        { en: "putty primer mesh prep", ka: "შპაკლი გრუნტი დიაგონალი", ru: "шпаклёвка грунт сетка подготовка" },
      ],
    }),
  ],
);
