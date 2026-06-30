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
    // S002 — გენერალური დალაგება (Deep / general cleaning). Per-room; veranda per m².
    sub("S002", "general_clean", "SprayCan", [
      svc("V257", "general_kitchen", [U.job(15)], { label: { en: "Kitchen", ka: "სამზარეულო", ru: "Кухня" } }),
      svc("V258", "general_living", [U.job(15)], { label: { en: "Living room", ka: "მისაღები", ru: "Гостиная" } }),
      svc("V259", "general_bathroom", [U.job(22)], { label: { en: "Bathroom", ka: "აბაზანა", ru: "Ванная" } }),
      svc("V260", "general_bedroom", [U.job(17)], { label: { en: "Bedroom", ka: "საძინებელი", ru: "Спальня" } }),
      svc("V261", "general_office", [U.job(15)], { label: { en: "Office", ka: "კაბინეტი", ru: "Кабинет" } }),
      svc("V262", "general_studio", [U.job(30)], { label: { en: "Studio", ka: "სტუდიო", ru: "Студия" } }),
      svc("V263", "general_veranda", [U.sqm(1)], { label: { en: "Veranda", ka: "ვერანდა", ru: "Веранда" } }),
    ], 1, {
      label: { en: "Deep cleaning", ka: "გენერალური დალაგება", ru: "Генеральная уборка" },
      description: {
        en: "The service includes:\n\nCleaning household appliances and kitchen cabinets inside and out\nCleaning floors, doors and handles\nRemoving marks and stains from mirrors\nCleaning windows and sills inside and out in reachable areas (max. 20 m²)\nVacuuming upholstered furniture\nWashing, hanging and ironing up to 5 kg of laundry\nCleaning chandeliers\nWashing dishes in the sink\n\nNote: the cleaner will not bring a broom, dustpan or vacuum cleaner.",
        ka: "მომსახურება მოიცავს:\n\nსაყოფაცხოვრებო ტექნიკისა და სამზარეულოს კარადების დასუფთავებას შიგნიდან და გარედან\nიატაკის, კარებისა და სახელურების გაწმენდას\nსარკიდან ანაბეჭდებისა და ლაქების მოცილებას\nფანჯრებისა და რაფების გაწმენდას შიგნიდან და გარედან ხელმისაწვდომ ადგილებში (მაქს. 20 მ²)\nრბილი ავეჯის მტვერსასრუტით გასუფთავებას\n5 კგ-მდე სარეცხის გარეცხვას, გაფენასა და დაუთავებას\nჭაღების გაწმენდას\nნიჟარაში ჭურჭლის გარეცხვას\n\nგაითვალისწინეთ: დამლაგებელს თან არ ექნება ცოცხი, აქანდაზი და მტვერსასრუტი.",
        ru: "В услугу входит:\n\nЧистка бытовой техники и кухонных шкафов внутри и снаружи\nЧистка полов, дверей и ручек\nУдаление следов и пятен с зеркал\nМытьё окон и подоконников внутри и снаружи в доступных местах (макс. 20 м²)\nЧистка мягкой мебели пылесосом\nСтирка, сушка и глажка до 5 кг белья\nЧистка люстр\nМытьё посуды в раковине\n\nОбратите внимание: у уборщика не будет веника, совка и пылесоса.",
      },
      addons: [
        addon("general_curtains", { en: "Curtain washing & ironing", ka: "ფარდების გარეცხვა და დაუთავება", ru: "Стирка и глажка штор" }, { en: "Add curtain washing & ironing?", ka: "დაამატოთ ფარდების გარეცხვა და დაუთავება?", ru: "Добавить стирку и глажку штор?" }, 20, U.job(20)),
        addon("general_supplies", { en: "Cleaning supplies", ka: "საწმენდი ხსნარები", ru: "Чистящие средства" }, { en: "Should the professional bring the needed cleaning supplies?", ka: "გსურთ, რომ პროფესიონალმა მოიტანოს საჭირო საწმენდი საშუალებები?", ru: "Чтобы профессионал принёс необходимые чистящие средства?" }, 18, U.job(18)),
      ],
      keywords: [
        { en: "deep clean thorough scrub general", ka: "გენერალური ღრმა დასუფთავება", ru: "генеральная уборка" },
      ],
    }),
    // S003 — რემონტის შემდგომი (Post-renovation). Per-room / per-element.
    sub("S003", "post_renovation_clean", "Construction", [
      svc("V264", "reno_kitchen", [U.job(65)], { label: { en: "Kitchen", ka: "სამზარეულო", ru: "Кухня" } }),
      svc("V265", "reno_living", [U.job(50)], { label: { en: "Living room", ka: "მისაღები", ru: "Гостиная" } }),
      svc("V266", "reno_studio", [U.job(60)], { label: { en: "Studio", ka: "სტუდიო", ru: "Студия" } }),
      svc("V267", "reno_bedroom", [U.job(40)], { label: { en: "Bedroom", ka: "საძინებელი", ru: "Спальня" } }),
      svc("V268", "reno_bathroom", [U.job(50)], { label: { en: "Bathroom", ka: "აბაზანა", ru: "Ванная" } }),
      svc("V269", "reno_office", [U.job(20)], { label: { en: "Office", ka: "კაბინეტი", ru: "Кабинет" } }),
      svc("V270", "reno_window", [U.job(25)], { label: { en: "Window", ka: "ფანჯარა", ru: "Окно" } }),
      svc("V271", "reno_double_window", [U.job(35)], { label: { en: "Double window", ka: "ორფრთიანი ფანჯარა", ru: "Двустворчатое окно" } }),
      svc("V272", "reno_door_set", [U.job(35)], { label: { en: "Door set", ka: "კარის კომპლექტი", ru: "Дверной комплект" } }),
      svc("V273", "reno_vitrage", [U.job(45)], { label: { en: "Stained glass", ka: "ვიტრაჟი", ru: "Витраж" } }),
      svc("V274", "reno_veranda", [U.sqm(3)], { label: { en: "Veranda", ka: "ვერანდა", ru: "Веранда" } }),
    ], 2, {
      label: { en: "Post-renovation cleaning", ka: "რემონტის შემდგომი დალაგება", ru: "Уборка после ремонта" },
      description: {
        en: "Mark the spaces that need cleaning after renovation.",
        ka: "მონიშნეთ სივრცე, რომელიც რემონტის შემდეგ დასუფთავებას საჭიროებს.",
        ru: "Отметьте помещения, которые нужно убрать после ремонта.",
      },
      addons: [
        addon("reno_supplies", { en: "Cleaning supplies", ka: "საწმენდი ხსნარები", ru: "Чистящие средства" }, { en: "Should the professional bring the needed cleaning supplies?", ka: "გსურთ, რომ პროფესიონალმა მოიტანოს საჭირო საწმენდი საშუალებები?", ru: "Чтобы профессионал принёс необходимые чистящие средства?" }, 18, U.job(18)),
      ],
      keywords: [
        { en: "post construction post renovation dust", ka: "რემონტის შემდგომი დასუფთავება", ru: "после ремонта строительная" },
      ],
    }),
    // S004 — საათობრივი დალაგება (Hourly). Fixed 2-hour package.
    sub("S004", "hourly_clean", "Clock", [
      svc("V275", "hourly_2h", [U.job(45)], { label: { en: "Two-hour cleaning", ka: "ორსაათიანი დალაგება", ru: "Двухчасовая уборка" } }),
    ], 3, {
      label: { en: "Hourly cleaning", ka: "საათობრივი დალაგება", ru: "Почасовая уборка" },
      description: {
        en: "This category is for those who need help with everyday home care and cleaning.\nNote: post-renovation cleaning is not included, and the cleaner does not bring the needed equipment.",
        ka: "ეს კატეგორია მათთვისაა, ვისაც სახლის ყოველდღიურ მოვლასა და დალაგებაში დახმარება სჭირდება.\nგაითვალისწინეთ: რემონტის შემდგომი დასუფთავება მომსახურებაში არ შედის და საჭირო ინვენტარი დამლაგებელს თან არ მოაქვს.",
        ru: "Эта категория для тех, кому нужна помощь в повседневном уходе за домом и уборке.\nОбратите внимание: уборка после ремонта не входит, и уборщик не приносит необходимый инвентарь.",
      },
      addons: [
        addon("hourly_supplies", { en: "Cleaning supplies", ka: "საწმენდი ხსნარები", ru: "Чистящие средства" }, { en: "Should the professional bring the needed cleaning supplies?", ka: "გსურთ, რომ პროფესიონალმა მოიტანოს საჭირო საწმენდი საშუალებები?", ru: "Чтобы профессионал принёс необходимые чистящие средства?" }, 12, U.job(12)),
      ],
      keywords: [
        { en: "hourly cleaning by the hour help", ka: "საათობრივი დალაგება", ru: "почасовая уборка" },
      ],
    }),
    // S005 — სადარბაზოს დალაგება (Stairwell). Tiered: 1st floor + extra floors.
    sub("S005", "stairwell_clean", "Building", [
      svc("V276", "stair_first", [U.job(75)], { label: { en: "First floor", ka: "პირველი სართული", ru: "Первый этаж" } }),
      svc("V277", "stair_extra", [U.job(40)], { label: { en: "Additional floor", ka: "დამატებითი სართული", ru: "Дополнительный этаж" } }),
    ], 4, {
      label: { en: "Stairwell cleaning", ka: "სადარბაზოს დალაგება", ru: "Уборка подъезда" },
      description: {
        en: "Cleaning the stairwell floor / stairs / handrail, both dry and wet.\nRemoving cobwebs.\nPlease note: the cleaner will not bring a broom or dustpan.",
        ka: "სადარბაზოს იატაკის/კიბეების/მოაჯირის, როგორც მშრალ ასევე სველი წესით დალაგება.\nაბლაბუდების ჩამოწმენდა.\nგასათვალისწინებელი ინფორმაცია:\nდამლაგებელს თან არ ექნება ცოცხი და აქანდაზი.",
        ru: "Уборка пола / лестниц / перил подъезда, как сухая, так и влажная.\nУдаление паутины.\nОбратите внимание: у уборщика не будет веника и совка.",
      },
      addons: [
        addon("stair_supplies", { en: "Cleaning supplies", ka: "საწმენდი ხსნარები", ru: "Чистящие средства" }, { en: "Should the professional bring the needed cleaning supplies?", ka: "გსურთ, რომ პროფესიონალმა მოიტანოს საჭირო საწმენდი საშუალებები?", ru: "Чтобы профессионал принёс необходимые чистящие средства?" }, 12, U.job(12)),
      ],
      keywords: [
        { en: "stairwell entrance staircase common area", ka: "სადარბაზო კიბე", ru: "подъезд лестница" },
      ],
    }),
    // S006 — გასაქირავებელი ბინების დალაგება (Rental apartments). Per m².
    sub("S006", "rental_clean", "KeyRound", [
      svc("V278", "rental_area", [U.sqm(1.2)], { label: { en: "Area", ka: "ფართობი", ru: "Площадь" } }),
    ], 5, {
      label: { en: "Rental apartment cleaning", ka: "გასაქირავებელი ბინების დალაგება", ru: "Уборка съёмных квартир" },
      description: {
        en: "The service includes cleaning the following rooms:\nbedroom, kitchen, living room, studio, balcony\n\nUsing the service includes:\n\nIroning clothes and washing laundry\nCleaning the fridge and kitchen cabinets\nTaking out the trash\nRestocking hygiene supplies",
        ka: "მომსახურებაში შედის შემდეგი ოთახების დალაგება:\nსაძინებელი, სამზარეულო, მისაღები, სტუდიო, აივანი\n\nსერვისით სარგებლობა მოიცავს:\n\nტანსაცმლის დაუთოებასა და სარეცხის რეცხვას\nმაცივრისა და სამზარეულოს კარადების გაწმენდას\nნარჩენების გატანას\nჰიგიენური საშუალებების მარაგის შევსებას",
        ru: "В услугу входит уборка следующих комнат:\nспальня, кухня, гостиная, студия, балкон\n\nПользование услугой включает:\n\nГлажку одежды и стирку белья\nЧистку холодильника и кухонных шкафов\nВынос мусора\nПополнение запаса гигиенических средств",
      },
      addons: [
        addon("rental_curtains", { en: "Curtain washing & ironing", ka: "ფარდების გარეცხვა და დაუთავება", ru: "Стирка и глажка штор" }, { en: "Add curtain washing & ironing?", ka: "დაამატოთ ფარდების გარეცხვა და დაუთავება?", ru: "Добавить стирку и глажку штор?" }, 20, U.job(20)),
        addon("rental_supplies", { en: "Cleaning supplies", ka: "საწმენდი ხსნარები", ru: "Чистящие средства" }, { en: "Should the professional bring the needed cleaning supplies?", ka: "გსურთ, რომ პროფესიონალმა მოიტანოს საჭირო საწმენდი საშუალებები?", ru: "Чтобы профессионал принёს необходимые чистящие средства?" }, 18, U.job(18)),
      ],
      keywords: [
        { en: "rental apartment turnover airbnb", ka: "გასაქირავებელი ბინა", ru: "съёмная квартира аренда" },
      ],
    }),
  ],
);
