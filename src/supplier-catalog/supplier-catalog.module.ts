import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SupplierCatalogController } from './supplier-catalog.controller';
import { SupplierCatalogService } from './supplier-catalog.service';
import { SupplierSyncService } from './supplier-sync.service';
import { SupplierCatalogCronService } from './supplier-catalog-cron.service';
import { LegoroomScraperAdapter } from './adapters/legoroom-scraper.adapter';
import {
  CsCartScraperAdapter,
  CsCartAdapterConfig,
} from './adapters/cs-cart-scraper.adapter';
import {
  WooCommerceStoreAdapter,
  WooCommerceAdapterConfig,
} from './adapters/woocommerce-store.adapter';
import {
  GenericFeedAdapter,
  GenericFeedAdapterConfig,
} from './adapters/generic-feed.adapter';
import { DominoScraperAdapter } from './adapters/domino-scraper.adapter';
import {
  StoreraScraperAdapter,
  StoreraAdapterConfig,
} from './adapters/storera-scraper.adapter';
import { HeadlessBrowserService } from './adapters/headless-browser.service';
import {
  HeadlessHeuristicAdapter,
  HeadlessAdapterConfig,
} from './adapters/headless-heuristic.adapter';
import { SUPPLIER_ADAPTERS } from './adapters/supplier-adapter.interface';
import { Supplier, SupplierSchema } from './schemas/supplier.schema';
import {
  SupplierProduct,
  SupplierProductSchema,
} from './schemas/supplier-product.schema';

// === CS-Cart shops (Unitheme2). One adapter, per-shop config. ===
// iMart: top categories are subcategory landings -> BFS. RENOVATION ONLY.
// Gorgia: categories aggregate + paginate. RENOVATION ONLY.
// goodbuild: construction/tools/plumbing/electrical (landings -> BFS).
// thermocenter: heating & climate (boilers, radiators, AC) - whole shop.
const CSCART_CONFIGS: CsCartAdapterConfig[] = [
  {
    supplierKey: 'imart',
    baseUrl: 'https://imart.ge',
    followSubcategories: true,
    categorySeeds: ['https://imart.ge/მშენებლობა-და-რემონტი/'],
  },
  {
    supplierKey: 'gorgia',
    baseUrl: 'https://gorgia.ge',
    followSubcategories: false,
    categorySeeds: [
      'https://gorgia.ge/ka/mshenebloba/',
      'https://gorgia.ge/ka/remonti/',
      'https://gorgia.ge/ka/santeqnika/',
    ],
  },
  {
    // Stock CS-Cart theme; parent categories aggregate + paginate like Gorgia.
    supplierKey: 'goodbuild',
    baseUrl: 'https://goodbuild.ge',
    followSubcategories: false,
    categorySeeds: [
      'https://goodbuild.ge/eleqtro-instrumentebi/',
      'https://goodbuild.ge/meqanikuri-instrumentebi/',
      'https://goodbuild.ge/building-equipment/',
      'https://goodbuild.ge/gatboba-kondicireba/',
      'https://goodbuild.ge/samsheneblo-masala/',
      'https://goodbuild.ge/samsheneblo-qimia/',
      'https://goodbuild.ge/saxarji-masalebi/',
      'https://goodbuild.ge/wyalmomarageba/',
      'https://goodbuild.ge/usaprtxoeba/',
      'https://goodbuild.ge/eleqtrooba/',
    ],
  },
  {
    supplierKey: 'thermocenter',
    baseUrl: 'https://thermocenter.ge',
    followSubcategories: true,
    categorySeeds: [
      'https://thermocenter.ge/ცენტრალური-გათბობის-ქვაბები/',
      'https://thermocenter.ge/გაზის-ქვაბები/',
      'https://thermocenter.ge/ელექტრო-ქვაბები/',
      'https://thermocenter.ge/ქვაბები-მყარ-საწვავზე/',
      'https://thermocenter.ge/გათბობის-რადიატორები/',
      'https://thermocenter.ge/სექციური-რადიატორები/',
      'https://thermocenter.ge/პანელური-რადიატორები/',
      'https://thermocenter.ge/დეკორატიული-რადიატორები/',
      'https://thermocenter.ge/საშრობები/',
      'https://thermocenter.ge/კონდიციონერი/',
      'https://thermocenter.ge/იატაკის-გათბობის-აქსესუარი/',
    ],
  },
  {
    // CS-Cart (vanilla theme). Tiles + sanitary shop; categories aggregate +
    // paginate. Renovation-core: floors/tiles, bathroom furniture, sanitary.
    supplierKey: 'cavoli',
    baseUrl: 'https://cavoligeorgia.ge',
    followSubcategories: false,
    categorySeeds: [
      'https://cavoligeorgia.ge/ka/იატაკი-და-ფილები-ka/',
      'https://cavoligeorgia.ge/ka/სააბაზანო-ავეჯი/',
      'https://cavoligeorgia.ge/ka/უნიტაზები/',
      'https://cavoligeorgia.ge/ka/კერამიკული-ხელსაბანები/',
      'https://cavoligeorgia.ge/ka/აბაზანები/',
      'https://cavoligeorgia.ge/ka/ონკანები/',
      'https://cavoligeorgia.ge/ka/ჭურჭელი/',
    ],
  },
];

// === Headless shops (custom/JS-rendered, no API). Rendered via Playwright,
// extracted heuristically. Each needs per-shop listing seeds; activate a shop
// only once its extraction is verified clean (some shops expose installment
// prices / need bespoke price handling). nova = INGCO construction tools. ===
const HEADLESS_CONFIGS: HeadlessAdapterConfig[] = [
  {
    supplierKey: 'nova',
    baseUrl: 'https://nova.ge',
    pagination: 'scroll',
    listingSeeds: [
      'https://nova.ge/ka/eleqtrokhelsatsyoebi',
      'https://nova.ge/ka/perforatorebi',
      'https://nova.ge/ka/eleqtro-burghi-dreli',
      'https://nova.ge/ka/diskuri-kherkhebi',
      'https://nova.ge/ka/kutkhis-sakhekhi-manqanebi',
      'https://nova.ge/ka/tsebos-tofebi',
    ],
  },
  {
    // SPA furniture shop. Category listing = /ka/products/<category>; product
    // URLs are /ka/product/...; shows sale price + crossed-out old (sale wins).
    supplierKey: 'comforter',
    baseUrl: 'https://comforter.ge',
    pagination: 'scroll',
    productUrlMustInclude: ['/product/'],
    listingSeeds: [
      'https://comforter.ge/ka/products/sadzinebeli',
      'https://comforter.ge/ka/products/misagebi-aveji',
      'https://comforter.ge/ka/products/magida-skami',
      'https://comforter.ge/ka/products/ofisi',
      'https://comforter.ge/ka/products/matrasi',
      'https://comforter.ge/ka/products/divani',
    ],
  },
  {
    // Furniture. All-products listing at /ka/products; product URLs
    // /ka/products/view/<id>/<id>. Uses comma-thousands prices (1,200 ₾).
    supplierKey: 'classica',
    baseUrl: 'https://classica.com.ge',
    pagination: 'scroll',
    productUrlMustInclude: ['/products/view/'],
    listingSeeds: ['https://classica.com.ge/ka/products'],
  },
  {
    // Ashley furniture. Categories at /ka/category/<slug>; products /ka/product/.
    supplierKey: 'ashleyhome',
    baseUrl: 'https://ashleyhome.ge',
    pagination: 'scroll',
    productUrlMustInclude: ['/product/'],
    listingSeeds: [
      'https://ashleyhome.ge/ka/category/furniture',
      'https://ashleyhome.ge/ka/category/divani',
    ],
  },
];

// === Storera shops (server-rendered Bootstrap grid). One adapter, per-shop
// config. kasco: whole shop for now (appliances + kitchenware); narrow the
// seeds to renovation-only categories later if desired. ===
const STORERA_CONFIGS: StoreraAdapterConfig[] = [
  {
    supplierKey: 'kasco',
    baseUrl: 'https://kasco.storera.ge',
    categorySeeds: [
      'https://kasco.storera.ge/categories/Everything-for-the-kitchen',
      'https://kasco.storera.ge/categories/ტაფა_ქვაბი_pan_pot',
      'https://kasco.storera.ge/categories/baking-form_საცხობი-ფორმა',
      'https://kasco.storera.ge/categories/Kitchen-trifle_სამზარეულოს-წვრილმანი',
      'https://kasco.storera.ge/categories/ყავის-მოსამზადებელი_Coffee-maker',
      'https://kasco.storera.ge/categories/დანა-ჩანგალი_cutlery',
      'https://kasco.storera.ge/categories/ხელის-საშრობი_Hand-dryer',
      'https://kasco.storera.ge/categories/დანა_knife',
      'https://kasco.storera.ge/categories/ჭურჭელი_dishes',
      'https://kasco.storera.ge/categories/Hob',
      'https://kasco.storera.ge/categories/Air-humidifier',
      'https://kasco.storera.ge/categories/Heater',
      'https://kasco.storera.ge/categories/Hood',
      'https://kasco.storera.ge/categories/electric-heater',
      'https://kasco.storera.ge/categories/induction-cooker',
      'https://kasco.storera.ge/categories/electric-oven',
      'https://kasco.storera.ge/categories/Bathroom-fan',
      'https://kasco.storera.ge/categories/Air-conditioner',
      'https://kasco.storera.ge/categories/Refrigerator',
      'https://kasco.storera.ge/categories/microwave-oven',
      'https://kasco.storera.ge/categories/Insect-killer',
      'https://kasco.storera.ge/categories/Ice-cream-machine',
      'https://kasco.storera.ge/categories/Moisture-trap',
      'https://kasco.storera.ge/categories/sink',
      'https://kasco.storera.ge/categories/washing-machine',
      'https://kasco.storera.ge/categories/Water-mixer',
      'https://kasco.storera.ge/categories/Gate-motor',
      'https://kasco.storera.ge/categories/Infrared-heater',
      'https://kasco.storera.ge/categories/Household-appliances',
      'https://kasco.storera.ge/categories/წყლის-სასმელი-შადრევნები',
      'https://kasco.storera.ge/categories/Olives-from-Greece',
    ],
  },
];

// === WooCommerce shops (Store API JSON). One adapter, per-shop config. ===
const WOO_CONFIGS: WooCommerceAdapterConfig[] = [
  { supplierKey: 'mosaics', baseUrl: 'https://mosaics.ge' },
  { supplierKey: 'vitra', baseUrl: 'https://vitra.com.ge' },
  { supplierKey: 'homevision', baseUrl: 'https://homevision.ge' },
  { supplierKey: 'qebuli', baseUrl: 'https://qebuli-climate.ge' },
  { supplierKey: 'maxtherm', baseUrl: 'https://maxtherm.ge' },
  { supplierKey: 'contempo', baseUrl: 'https://contempo.ge' },
];

// === Partner JSON feeds/APIs (cooperating shops that give us an endpoint). ===
// One GenericFeedAdapter, per-shop config with a field map. Add a shop here the
// moment they send a sample of their product feed - no new adapter class.
//   TODO(kasco): activate once the owner sends the endpoint + field names.
//   Example shape (fill from his real sample):
//   {
//     supplierKey: 'kasco',
//     baseUrl: 'https://kasco.ge',
//     endpoint: '/api/products?page={page}',
//     itemsPath: 'data',            // '' if the response is a bare array
//     fieldMap: {
//       externalId: 'id', name: 'title', price: 'price',
//       stock: 'quantity', images: 'images', category: 'category',
//       url: 'url',
//     },
//   },
const FEED_CONFIGS: GenericFeedAdapterConfig[] = [];

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Supplier.name, schema: SupplierSchema },
      { name: SupplierProduct.name, schema: SupplierProductSchema },
    ]),
  ],
  controllers: [SupplierCatalogController],
  providers: [
    SupplierCatalogService,
    SupplierSyncService,
    SupplierCatalogCronService,
    LegoroomScraperAdapter,
    DominoScraperAdapter,
    HeadlessBrowserService,
    {
      provide: SUPPLIER_ADAPTERS,
      useFactory: (
        legoroom: LegoroomScraperAdapter,
        domino: DominoScraperAdapter,
        headless: HeadlessBrowserService,
      ) => [
        legoroom,
        ...CSCART_CONFIGS.map((c) => new CsCartScraperAdapter(c)),
        ...STORERA_CONFIGS.map((c) => new StoreraScraperAdapter(c)),
        ...WOO_CONFIGS.map((c) => new WooCommerceStoreAdapter(c)),
        ...FEED_CONFIGS.map((c) => new GenericFeedAdapter(c)),
        ...HEADLESS_CONFIGS.map((c) => new HeadlessHeuristicAdapter(c, headless)),
        domino,
      ],
      inject: [LegoroomScraperAdapter, DominoScraperAdapter, HeadlessBrowserService],
    },
  ],
  exports: [SupplierCatalogService],
})
export class SupplierCatalogModule {}
