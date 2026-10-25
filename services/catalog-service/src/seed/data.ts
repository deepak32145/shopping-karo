import { CATEGORIES, MOMENTS, type Category } from '../product.model';

type Moment = (typeof MOMENTS)[number];

/** Moment codes used in the tables below: g gifting, w wfh, h hostel, f festive, k kitchen, m monsoon. */
const MOMENT_CODES: Record<string, Moment> = { g: 'gifting', w: 'wfh', h: 'hostel', f: 'festive', k: 'kitchen', m: 'monsoon' };

/** [title, seller, price ₹, MRP ₹, emoji, search keywords, moment codes] */
type Row = [title: string, seller: string, price: number, mrp: number, emoji: string, keywords: string, moments: string];

const CATALOGUE: Record<Category, Row[]> = {
  electronics: [
    ['Wireless Over-Ear Headphones, 40 h battery', 'Soundwave', 2499, 4999, '🎧', 'headphones music bluetooth wireless', 'gw'],
    ['True Wireless Earbuds with Charging Case', 'Soundwave', 1799, 3999, '🎵', 'earbuds tws music bluetooth', 'g'],
    ['Noise-Cancelling Wireless Headphones', 'Soundwave', 7999, 14999, '🎧', 'headphones anc music dad brother', 'gw'],
    ['Smartwatch with Heart-Rate & SpO2', 'PixelPro', 2999, 6999, '⌚', 'smartwatch fitness health watch', 'g'],
    ['Fitness Band, 14-day battery', 'PixelPro', 1499, 2999, '⏱️', 'band fitness steps tracker', 'g'],
    ['20000 mAh Fast-Charge Power Bank', 'ChargeCo', 1999, 2999, '🔋', 'powerbank battery charger travel', 'h'],
    ['65 W GaN Wall Charger, 3 ports', 'ChargeCo', 1599, 2499, '🔌', 'charger usb-c laptop fast', 'w'],
    ['Braided USB-C Cable, 2 m (pack of 3)', 'ChargeCo', 499, 999, '🔌', 'cable usb-c charging', 'h'],
    ['Mechanical Keyboard, hot-swappable, 75%', 'Keyhaus', 3499, 5999, '⌨️', 'keyboard typing office gamer brother', 'gw'],
    ['Silent Wireless Mouse, 2.4 GHz', 'Keyhaus', 699, 1299, '🖱️', 'mouse wireless office', 'w'],
    ['Laptop Cooling Pad with 5 Fans', 'VoltEdge', 1299, 2499, '💻', 'laptop cooling gaming desk', 'w'],
    ['Portable Bluetooth Speaker, waterproof', 'Soundwave', 1999, 3999, '🔊', 'speaker bluetooth party rain', 'gm'],
    ['Soundbar 2.1, 120 W with subwoofer', 'Soundwave', 6999, 12999, '📻', 'soundbar tv speaker home theatre', 'f'],
    ['1080p Webcam with Privacy Shutter', 'PixelPro', 1799, 3499, '📷', 'webcam video meeting work from home', 'w'],
    ['Ring Light 10-inch with Tripod', 'PixelPro', 899, 1999, '💡', 'ring light selfie video creator', 'w'],
    ['Smart LED Bulb, Wi-Fi, 9 W (pack of 2)', 'Lumo', 799, 1598, '💡', 'bulb smart wifi alexa lighting', 'f'],
    ['Monitor Light Bar with auto-dimming', 'Lumo', 1899, 2999, '💡', 'lamp desk monitor eyes light', 'w'],
    ['4K Action Camera, waterproof', 'PixelPro', 4999, 9999, '🎥', 'camera action travel vlog gopro', 'gm'],
    ['Wi-Fi 6 Router, dual-band AX1800', 'GadgetNest', 2799, 4999, '📡', 'router wifi internet home', 'w'],
    ['Portable SSD 1 TB, USB-C', 'GadgetNest', 6499, 10999, '💾', 'ssd storage drive backup laptop', 'w'],
  ],
  furniture: [
    ['Engineered-Wood Study Desk, 120 cm', 'DeskCraft', 5999, 9999, '🗄️', 'desk study table office', 'wh'],
    ['Ergonomic Mesh Office Chair, lumbar support', 'DeskCraft', 8999, 15999, '🪑', 'chair office ergonomic back', 'w'],
    ['Adjustable Laptop Table for Bed', 'DeskCraft', 1299, 2499, '🛏️', 'laptop table bed foldable', 'wh'],
    ['3-Seater Fabric Sofa, charcoal', 'Homeloom', 24999, 39999, '🛋️', 'sofa couch living room', 'f'],
    ['Recliner Armchair, velvet', 'Homeloom', 14999, 24999, '🛋️', 'recliner armchair relax', 'g'],
    ['Queen Size Bed Frame with Storage', 'SleepWell', 18999, 32999, '🛏️', 'bed queen storage bedroom', ''],
    ['Orthopaedic Memory Foam Mattress, queen', 'SleepWell', 11999, 21999, '🛏️', 'mattress memory foam sleep back', ''],
    ['Bedside Table with 2 Drawers', 'Woodcraft', 2499, 4499, '🗄️', 'bedside table drawer night', 'h'],
    ['Wardrobe, 3-door with mirror', 'Woodcraft', 16999, 27999, '🚪', 'wardrobe almirah clothes storage', ''],
    ['6-Tier Bookshelf, walnut finish', 'Woodcraft', 3499, 5999, '🗄️', 'bookshelf books rack storage', 'h'],
    ['TV Unit with Cabinet, up to 55 inch', 'Woodcraft', 5499, 8999, '📺', 'tv unit cabinet living room', 'f'],
    ['Coffee Table, solid sheesham', 'Woodcraft', 4299, 6999, '☕', 'coffee table sheesham wood living', 'fg'],
    ['4-Seater Dining Set with Bench', 'Homeloom', 12999, 21999, '🍽️', 'dining table set kitchen family', 'kf'],
    ['Shoe Rack, 4 shelves (bamboo)', 'TidyNest', 1499, 2499, '👟', 'shoe rack bamboo storage entrance', 'm'],
    ['Foldable Storage Cubes, set of 6', 'TidyNest', 599, 1299, '📦', 'storage organiser cube room pg', 'h'],
    ['Floating Wall Shelves, set of 3', 'TidyNest', 799, 1599, '🧱', 'shelf wall decor display', 'h'],
    ['Bean Bag XXL with Beans', 'Homeloom', 1999, 3499, '🛋️', 'bean bag lounge hostel', 'h'],
    ['Folding Study Chair', 'DeskCraft', 1799, 2999, '🪑', 'chair study folding portable', 'h'],
    ['Standing Desk Converter, height adjustable', 'DeskCraft', 6999, 11999, '🖥️', 'standing desk converter posture', 'w'],
    ['Hanging Cane Swing Chair with Stand', 'Homeloom', 9999, 16999, '🪑', 'swing chair balcony cane', 'gm'],
  ],
  beauty: [
    ['Vitamin C Face Serum, 30 ml', 'Glowhaus', 499, 999, '🧴', 'serum vitamin c glow skin', 'g'],
    ['Hyaluronic Acid Moisturiser, 50 g', 'Glowhaus', 449, 899, '🧴', 'moisturiser hydrating skin', ''],
    ['SPF 50 Sunscreen Gel, no white cast', 'PureLeaf', 349, 699, '☀️', 'sunscreen spf sun protection', 'm'],
    ['Gentle Foaming Face Wash, 150 ml', 'PureLeaf', 249, 449, '🫧', 'face wash cleanser daily', ''],
    ['Argan Hair Oil, 200 ml', 'Kesar & Co.', 399, 799, '💧', 'hair oil argan frizz', 'g'],
    ['Anti-Dandruff Shampoo, 340 ml', 'PureLeaf', 299, 549, '🧴', 'shampoo dandruff hair', 'm'],
    ['Matte Liquid Lipstick, set of 4', 'Aura', 599, 1199, '💄', 'lipstick matte makeup sister', 'gf'],
    ['Kajal, smudge-proof 24 h (pack of 2)', 'Aura', 249, 499, '👁️', 'kajal eyes makeup', 'm'],
    ['Compact Powder, SPF 15', 'Aura', 349, 699, '🪞', 'compact powder makeup oil control', ''],
    ['Beard Grooming Kit with Oil & Balm', 'Barber & Co.', 799, 1599, '🧔', 'beard kit grooming dad brother', 'g'],
    ['Cordless Trimmer, 90-minute runtime', 'Barber & Co.', 1199, 2299, '✂️', 'trimmer shaver beard grooming', 'g'],
    ['Electric Hair Dryer, 1800 W', 'Glowhaus', 999, 1999, '💨', 'hair dryer styling', 'm'],
    ['Perfume Gift Set, 4 x 20 ml', 'Kesar & Co.', 899, 1799, '🌸', 'perfume gift set fragrance mom sister', 'gf'],
    ['Sandalwood Body Lotion, 400 ml', 'Kesar & Co.', 349, 699, '🪷', 'lotion body sandalwood winter', 'f'],
    ['Charcoal Face Mask, 100 g', 'PureLeaf', 299, 599, '🖤', 'face mask charcoal pores', ''],
    ['Nail Polish Set, 12 shades', 'Aura', 499, 999, '💅', 'nail polish colours gift', 'gf'],
    ['Makeup Brush Set, 12 pieces with pouch', 'Aura', 649, 1299, '🖌️', 'makeup brush set beginner', 'g'],
    ['Under-Eye Roller with Caffeine', 'Glowhaus', 399, 799, '👀', 'eye roller dark circles caffeine', ''],
    ['Rose Water Toner, 200 ml', 'Kesar & Co.', 199, 399, '🌹', 'rose water toner skin', 'f'],
    ['Hair Straightener, ceramic plates', 'Glowhaus', 1299, 2499, '💇', 'hair straightener styling', 'g'],
  ],
  books: [
    ['The Last Train to Jaipur (novel)', 'PageTurner', 249, 399, '📖', 'novel fiction story travel', 'g'],
    ['Monsoon Letters (novel)', 'PageTurner', 299, 450, '📖', 'novel romance rain fiction', 'mg'],
    ['The Focused Mind: Habits for Deep Work', 'Inkwell', 349, 599, '🧠', 'habits focus productivity self help', 'wg'],
    ['Rich on a Salary: A Practical Money Guide', 'Inkwell', 299, 499, '💰', 'money finance savings investing', 'g'],
    ['Python from Zero to Projects', 'Kitab Ghar', 599, 999, '🐍', 'python programming coding beginner', 'w'],
    ['System Design, Step by Step', 'Kitab Ghar', 799, 1299, '🧩', 'system design interview software engineer', 'w'],
    ['Data Structures the Easy Way', 'Kitab Ghar', 449, 799, '🌳', 'data structures algorithms coding', 'wh'],
    ['The Spice Route Cookbook', 'PageTurner', 699, 1199, '🍛', 'cookbook recipes indian food', 'kg'],
    ['Ghost Stories of Old Delhi', 'PageTurner', 199, 349, '👻', 'ghost stories horror delhi', 'mh'],
    ['A Brief History of Indian Cinema', 'Inkwell', 499, 799, '🎬', 'cinema bollywood history film', 'g'],
    ["Kids' Encyclopaedia of Space", 'Little Readers', 399, 699, '🚀', 'kids space science children', 'g'],
    ['The Tiger Who Lost His Stripes (picture book)', 'Little Readers', 199, 299, '🐯', 'kids picture book bedtime story', 'g'],
    ['Mindful Mornings Journal, 90 days', 'Inkwell', 349, 599, '📓', 'journal diary mindfulness planner', 'g'],
    ['Startup Playbook: Zero to First Customer', 'Inkwell', 399, 699, '🚀', 'startup business entrepreneur', 'w'],
    ['Yoga for Busy People', 'Inkwell', 299, 499, '🧘', 'yoga fitness health wellness', 'h'],
    ['UPSC Polity Notes, Complete Guide', 'Kitab Ghar', 549, 899, '🏛️', 'upsc civil services exam polity', 'h'],
    ["The Art of Sketching: Beginner's Workbook", 'Inkwell', 449, 749, '✏️', 'sketching drawing art workbook', 'g'],
    ['Poems from the Himalayas', 'PageTurner', 179, 299, '🏔️', 'poetry poems mountains', 'g'],
    ['Crime Scene: Mumbai (thriller)', 'PageTurner', 229, 399, '🔎', 'thriller crime mystery mumbai', 'm'],
    ['JEE Physics Problem Bank', 'Kitab Ghar', 649, 1099, '⚛️', 'jee physics iit exam preparation', 'h'],
  ],
  fashion: [
    ["Men's Cotton Crew-Neck T-Shirt, pack of 3", 'UrbanLoom', 699, 1799, '👕', 'tshirt men cotton basics', 'h'],
    ["Men's Slim-Fit Chinos", 'UrbanLoom', 999, 2199, '👖', 'chinos trousers men office', 'w'],
    ["Men's Casual Oxford Shirt", 'Threadline', 799, 1799, '👔', 'shirt men casual oxford', 'g'],
    ["Women's Floral Kurta with Palazzo", 'Zari House', 1199, 2499, '👗', 'kurta palazzo ethnic women', 'fg'],
    ["Women's Cotton Saree with Blouse Piece", 'Zari House', 1499, 2999, '🥻', 'saree cotton ethnic festive', 'fg'],
    ["Women's High-Rise Skinny Jeans", 'UrbanLoom', 1199, 2499, '👖', 'jeans women denim', ''],
    ["Women's Printed Maxi Dress", 'Threadline', 999, 2199, '👗', 'dress maxi women summer', 'g'],
    ['Unisex Hooded Sweatshirt', 'Threadline', 1099, 2299, '🧥', 'hoodie sweatshirt winter unisex', 'h'],
    ["Men's Running Shoes, breathable mesh", 'SoleMate', 1999, 3999, '👟', 'shoes running sports men', 'g'],
    ["Women's Block-Heel Sandals", 'SoleMate', 899, 1799, '👡', 'sandals heels women footwear', 'f'],
    ['Unisex Canvas Sneakers', 'SoleMate', 1199, 2299, '👟', 'sneakers canvas casual unisex', 'h'],
    ['Leather Wallet with RFID Protection', 'Wanderer', 599, 1299, '👛', 'wallet leather men gift', 'g'],
    ['Laptop Backpack, 30 L, water-resistant', 'Wanderer', 1099, 2299, '🎒', 'backpack laptop bag college travel', 'wmh'],
    ['Polarised Aviator Sunglasses', 'Wanderer', 799, 1999, '🕶️', 'sunglasses aviator polarised', 'g'],
    ['Analog Watch, stainless steel strap', 'Wanderer', 1799, 3999, '⌚', 'watch analog men women gift', 'g'],
    ['Silk-Blend Dupatta', 'Zari House', 599, 1199, '🧣', 'dupatta silk ethnic women', 'f'],
    ['Winter Wool Muffler', 'Threadline', 399, 899, '🧣', 'muffler scarf wool winter', 'g'],
    ["Men's Formal Leather Belt", 'Wanderer', 499, 999, '🥋', 'belt leather formal men', 'g'],
    ["Women's Tote Bag, vegan leather", 'Wanderer', 999, 1999, '👜', 'tote bag handbag women work', 'wg'],
    ['Cotton Ankle Socks, pack of 6', 'UrbanLoom', 299, 599, '🧦', 'socks cotton ankle pack', 'h'],
  ],
};

export interface SeedProduct {
  id: string;
  title: string;
  seller: string;
  category: Category;
  price: number; // paise
  mrp: number; // paise
  stock: number;
  rating: number;
  reviews: number;
  emoji: string;
  hue: number;
  moments: Moment[];
  keywords: string;
  /** Oldest first; last entry is the current price. Demo history, generated deterministically. */
  priceHistory: number[];
  deal?: { days: number; claimedPct: number };
}

const CATEGORY_HUE: Record<Category, number> = { electronics: 220, furniture: 30, beauty: 330, books: 160, fashion: 285 };
/** Positions (0-99) that run as limited-time deals, so the Deal radar has content. */
const DEAL_POSITIONS = new Set([2, 9, 15, 24, 33, 46, 58, 71, 88, 95]);

function demoHistory(current: number, seed: number): number[] {
  const wobble = Math.max(100, Math.round(current * 0.08));
  const points: number[] = [];
  for (let i = 0; i < 11; i++) {
    const swing = Math.sin(seed + i * 1.7) * wobble + Math.cos(seed * 2 + i) * wobble * 0.5;
    points.push(Math.max(100, Math.round((current + wobble * 0.6 + swing) / 100) * 100));
  }
  return [...points, current];
}

function build(): SeedProduct[] {
  const out: SeedProduct[] = [];
  let position = 0;
  for (const category of CATEGORIES) {
    CATALOGUE[category].forEach(([title, seller, price, mrp, emoji, keywords, codes], index) => {
      const i = position++;
      const pricePaise = price * 100;
      out.push({
        id: `${category}-${String(index + 1).padStart(2, '0')}`,
        title,
        seller,
        category,
        price: pricePaise,
        mrp: mrp * 100,
        // Mostly well stocked, a few nearly gone and one sold out, so every card state shows up in the UI.
        stock: i === 57 ? 0 : i % 17 === 5 ? 3 + (i % 3) : 20 + ((i * 37) % 380),
        rating: Math.round((3.8 + ((i * 7) % 11) / 10) * 10) / 10,
        reviews: 60 + ((i * 977) % 19000),
        emoji,
        hue: (CATEGORY_HUE[category] + ((i * 13) % 41) - 20 + 360) % 360,
        moments: [...codes].map((c) => MOMENT_CODES[c]),
        keywords,
        priceHistory: demoHistory(pricePaise, i + 1),
        deal: DEAL_POSITIONS.has(i) ? { days: 1 + (i % 6), claimedPct: 25 + ((i * 11) % 66) } : undefined,
      });
    });
  }
  return out;
}

export const SEED_PRODUCTS: SeedProduct[] = build();
