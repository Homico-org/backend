/**
 * Cleaners — category C01 (cleaning).
 * Translations live in seed/translations.ts keyed by id.
 */

import { addon, cat, sub, svc } from '../helpers';
import { U } from '../units';

export const cleaningCategory = cat(
  "C01",
  "cleaning",
  "Sparkles",
  "#10B981",
  3,
  0,
  [
    // S001 — რეგულარული დალაგება (Regular cleaning). Per-room pricing: the
    // client picks the rooms they want (each a flat price), veranda is per m².
    sub("S001", "regular_clean", "Sparkles", [
      svc("V251", "regular_kitchen", [U.job(20)], { label: { en: "Kitchen", ka: "სამზარეულო", ru: "Кухня" } }),
      svc("V252", "regular_bathroom", [U.job(22)], { label: { en: "Bathroom", ka: "აბაზანა", ru: "Ванная" } }),
      svc("V253", "regular_living", [U.job(10)], { label: { en: "Living room", ka: "მისაღები", ru: "Гостиная" } }),
      svc("V254", "regular_bedroom", [U.job(13)], { label: { en: "Bedroom", ka: "საძინებელი", ru: "Спальня" } }),
      svc("V255", "regular_office", [U.job(7)], { label: { en: "Office", ka: "კაბინეტი", ru: "Кабинет" } }),
      svc("V256", "regular_veranda", [U.sqm(1)], { label: { en: "Veranda", ka: "ვერანდა", ru: "Веранда" } }),
    ], 0, {
      description: {
        en: "The service includes:\n\nSurface dust removal\nCleaning floors, doors and handles\nRemoving marks and stains from mirrors\nSurface cleaning of bathroom tiles\nInside and outside cleaning of windows and sills in reachable areas (max. 20 m²)\nWashing dishes in the sink\nWashing up to 5 kg of laundry (as an add-on)\nIroning up to 5 kg of laundry (as an add-on)\n\nNote: the cleaner will not bring a broom, dustpan or vacuum cleaner.",
        ka: "მომსახურება მოიცავს:\n\nმტვრის ზედაპირულ მოცილებას\nიატაკის, კარებისა და სახელურების გაწმენდას\nსარკიდან ანაბეჭდებისა და ლაქების მოშორებას\nსააბაზანოს კაფელის ზედაპირული ნადების გაწმენდას\nფანჯრებისა და რაფების შიდა და გარე დასუფთავებას ხელმისაწვდომ ადგილებში (მაქს. 20 მ²)\nნიჟარაში ჭურჭლის გარეცხვას\n5 კგ-მდე სარეცხის გარეცხვას (დამატებითი სერვისით)\n5 კგ-მდე სარეცხის დაუთავებას (დამატებითი სერვისით)\n\nგაითვალისწინეთ: დამლაგებელს თან არ ექნება ცოცხი, აქანდაზი და მტვერსასრუტი.",
        ru: "В услугу входит:\n\nПоверхностное удаление пыли\nЧистка полов, дверей и ручек\nУдаление следов и пятен с зеркал\nПоверхностная чистка плитки в ванной\nМытьё окон и подоконников внутри и снаружи в доступных местах (макс. 20 м²)\nМытьё посуды в раковине\nСтирка до 5 кг белья (доп. услуга)\nГлажка до 5 кг белья (доп. услуга)\n\nОбратите внимание: у уборщика не будет веника, совка и пылесоса.",
      },
      addons: [
        addon("regular_ironing", { en: "Ironing", ka: "გაუთოება", ru: "Глажка" }, { en: "Add ironing?", ka: "დაამატოთ გაუთოება?", ru: "Добавить глажку?" }, 5, U.job(5)),
        addon("regular_fridge", { en: "Fridge", ka: "მაცივარი", ru: "Холодильник" }, { en: "Add fridge cleaning?", ka: "დაამატოთ მაცივრის წმენდა?", ru: "Добавить чистку холодильника?" }, 5, U.job(5)),
        addon("regular_cabinet", { en: "Kitchen cabinet", ka: "სამზარეულოს კარადა", ru: "Кухонный шкаф" }, { en: "Add kitchen cabinet cleaning?", ka: "დაამატოთ სამზარეულოს კარადის წმენდა?", ru: "Добавить чистку кухонного шкафа?" }, 10, U.job(10)),
        addon("regular_laundry", { en: "Laundry wash", ka: "სარეცხის გარეცხვა", ru: "Стирка" }, { en: "Add laundry wash?", ka: "დაამატოთ სარეცხის გარეცხვა?", ru: "Добавить стирку?" }, 5, U.job(5)),
        addon("regular_supplies", { en: "Cleaning supplies", ka: "საწმენდი ხსნარები", ru: "Чистящие средства" }, { en: "Should the professional bring the needed cleaning supplies?", ka: "გსურთ, რომ პროფესიონალმა მოიტანოს საჭირო საწმენდი საშუალებები?", ru: "Чтобы профессионал принёс необходимые чистящие средства?" }, 12, U.job(12)),
      ],
      keywords: [
        { en: "cleaning clean housekeeping maid", ka: "დასუფთავება დალაგება დამლაგებელი", ru: "уборка клининг" },
        { en: "daltageba", ka: "დასუფ დალაგ", ru: "" },
      ],
    }),
    sub("S002", "deep_clean", "SprayCan", [
      svc("V003", "deep_full_svc", [U.sqm(6, 18), U.hour(25, 60), U.studio(80, 250), U.oneBr(120, 350), U.twoBr(180, 500), U.threeBr(250, 700)]),
      svc("V004", "deep_kitchen_svc", [U.job(50, 200)]),
      svc("V005", "deep_bathroom_svc", [U.job(40, 150)]),
    ], 1, {
      keywords: [
        { en: "deep clean thorough scrub", ka: "ღრმა დასუფთავება", ru: "генеральная уборка" },
      ],
    }),
    sub("S003", "post_renovation_clean", "Construction", [
      svc("V006", "post_reno_full_svc", [U.sqm(5, 15), U.room(60, 200), U.studio(100, 300), U.oneBr(150, 450), U.twoBr(220, 650), U.threeBr(300, 900)]),
      svc("V007", "post_reno_dust_svc", [U.sqm(3, 10)]),
      svc("V008", "post_reno_floor_svc", [U.sqm(4, 12)]),
    ], 2, {
      keywords: [
        { en: "post construction post renovation dust", ka: "სარემონტო შემდგომი დასუფთავება", ru: "после ремонта строительная" },
      ],
    }),
    sub("S004", "move_clean", "Truck", [
      svc("V009", "move_full_svc", [U.sqm(4, 12), U.room(50, 150), U.studio(70, 200), U.oneBr(100, 280), U.twoBr(150, 400), U.threeBr(200, 550)]),
      svc("V010", "move_empty_svc", [U.sqm(3, 10), U.studio(50, 150), U.oneBr(70, 200), U.twoBr(110, 300)]),
      svc("V011", "move_cabinet_svc", [U.job(40, 150)]),
    ], 3, {
      keywords: [
        { en: "move in move out moving cleanup", ka: "გადასვლა გადმოსვლა", ru: "переезд после переезда" },
      ],
    }),
    sub("S005", "window_clean", "PanelTop", [
      svc("V012", "window_interior_svc", [U.window(8, 20)]),
      svc("V013", "window_exterior_svc", [U.window(12, 30)]),
      svc("V014", "window_facade_svc", [U.sqm(5, 15)]),
    ], 4),
    sub("S006", "carpet_clean", "Sofa", [
      svc("V015", "carpet_rug_svc", [U.sqm(5, 20)]),
      svc("V016", "carpet_sofa_svc", [U.unit(40, 150)]),
      svc("V017", "carpet_mattress_svc", [U.unit(30, 120)]),
    ], 5),
  ],
);
