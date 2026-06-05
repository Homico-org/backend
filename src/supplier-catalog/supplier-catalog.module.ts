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
import { DominoScraperAdapter } from './adapters/domino-scraper.adapter';
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

// === WooCommerce shops (Store API JSON). One adapter, per-shop config. ===
const WOO_CONFIGS: WooCommerceAdapterConfig[] = [
  { supplierKey: 'mosaics', baseUrl: 'https://mosaics.ge' },
  { supplierKey: 'vitra', baseUrl: 'https://vitra.com.ge' },
  { supplierKey: 'homevision', baseUrl: 'https://homevision.ge' },
  { supplierKey: 'qebuli', baseUrl: 'https://qebuli-climate.ge' },
  { supplierKey: 'maxtherm', baseUrl: 'https://maxtherm.ge' },
];

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
        ...WOO_CONFIGS.map((c) => new WooCommerceStoreAdapter(c)),
        ...HEADLESS_CONFIGS.map((c) => new HeadlessHeuristicAdapter(c, headless)),
        domino,
      ],
      inject: [LegoroomScraperAdapter, DominoScraperAdapter, HeadlessBrowserService],
    },
  ],
  exports: [SupplierCatalogService],
})
export class SupplierCatalogModule {}
