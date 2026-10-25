export type CategoryId = 'electronics' | 'furniture' | 'beauty' | 'books' | 'fashion';

export interface Category {
  id: CategoryId;
  label: string;
  blurb: string;
  emoji: string;
  hue: number;
}

/** Keep in sync with CATEGORIES in catalog-service (product.model.ts). */
export const categories: Category[] = [
  { id: 'electronics', label: 'Electronics', blurb: 'Audio, wearables, power', emoji: '🎧', hue: 220 },
  { id: 'furniture', label: 'Furniture', blurb: 'Desks, sofas, storage', emoji: '🛋️', hue: 30 },
  { id: 'beauty', label: 'Beauty', blurb: 'Skin, hair, grooming', emoji: '💄', hue: 330 },
  { id: 'books', label: 'Books', blurb: 'Fiction, tech, exams', emoji: '📚', hue: 160 },
  { id: 'fashion', label: 'Fashion', blurb: 'Clothes, shoes, bags', emoji: '👗', hue: 285 },
];

export const isCategoryId = (value: string | null): value is CategoryId => categories.some((c) => c.id === value);
