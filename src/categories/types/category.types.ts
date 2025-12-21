// Types for lean documents (exported for use in controllers)
export interface SubSubcategoryDoc {
  key: string;
  name: string;
  nameKa: string;
  icon?: string;
  keywords: string[];
  sortOrder: number;
  isActive: boolean;
}

export interface SubcategoryDoc {
  key: string;
  name: string;
  nameKa: string;
  icon?: string;
  keywords: string[];
  sortOrder: number;
  isActive: boolean;
  children: SubSubcategoryDoc[];
}

export interface CategoryDoc {
  _id: any;
  key: string;
  name: string;
  nameKa: string;
  description?: string;
  descriptionKa?: string;
  icon?: string;
  keywords: string[];
  isActive: boolean;
  sortOrder: number;
  subcategories: SubcategoryDoc[];
}

export interface FlatCategoryItem {
  key: string;
  name: string;
  nameKa: string;
  type: 'category' | 'subcategory' | 'subsubcategory';
  parentKey?: string;
  parentSubKey?: string;
  icon?: string;
}

export interface SearchResult {
  categories: CategoryDoc[];
  subcategories: { category: string; subcategory: SubcategoryDoc }[];
  subSubcategories: { category: string; subcategory: string; subSubcategory: SubSubcategoryDoc }[];
}
