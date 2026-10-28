import type { Category, Menu, MenuItem, ModifierGroup } from './types';

/**
 * Built-in copy of the menu, taken from the restaurant's Clover Online page on 2026-10-28.
 * The website uses it in demo mode and as a fallback if Clover can't be reached. Once Clover
 * credentials are configured, the live Clover inventory replaces it.
 */

const COMBO_CHOICES = 'grp-combo-choice';

const modifierGroups: Record<string, ModifierGroup> = {
  // The Clover page only says "Choice of Two"; these options are a guess from the rest of the
  // menu and should be checked with the restaurant.
  [COMBO_CHOICES]: {
    id: COMBO_CHOICES,
    name: 'Choose two',
    min: 2,
    max: 2,
    modifiers: [
      { id: 'mod-combo-chicken-shawarma', name: 'Chicken Shawarma', price: 0, available: true },
      { id: 'mod-combo-beef-doner', name: 'Beef Doner', price: 0, available: true },
      { id: 'mod-combo-chicken-chapli', name: 'Chicken Chapli Kebab', price: 0, available: true },
      { id: 'mod-combo-beef-chapli', name: 'Beef Chapli Kebab', price: 0, available: true },
      { id: 'mod-combo-masala-fish', name: 'Masala Fish', price: 0, available: true },
      { id: 'mod-combo-falafel', name: 'Falafel', price: 0, available: true },
    ],
  },
};

type SeedItem = [id: string, name: string, price: number, extra?: Partial<MenuItem>];

const sections: [Category['id'], Category['name'], SeedItem[]][] = [
  [
    'cat-platters',
    'Platters & Salad Bowls',
    [
      ['platter-beef-doner', 'Beef Doner Platter', 1199],
      ['platter-shawarma-doner-combo', 'Shawarma & Beef Doner Combo Platter', 1299],
      ['platter-chicken-chapli', 'Chicken Chapli Kebab Platter', 1299],
      ['platter-beef-chapli', 'Beef Chapli Kebab Platter', 1299],
      ['platter-chapli-combo', 'Beef & Chicken Chapli Combo Platter', 1299],
      ['platter-masala-fish', 'Masala Fish Platter', 1199],
      ['platter-falafel', 'Falafel Platter', 1099],
      ['platter-custom-combo', 'Customized Combo Platter', 1299, { modifierGroupIds: [COMBO_CHOICES] }],
      ['platter-chicken-shawarma-fries', 'Chicken Shawarma Over Fries', 1199],
      ['platter-beef-doner-fries', 'Beef Doner Over Fries', 1199],
      ['platter-fish-fries', 'Fish Over Fries', 1199],
      ['platter-chapli-fries', 'Chapli Kebab Over Fries', 1199],
    ],
  ],
  [
    'cat-wraps',
    'Wraps & Gyros',
    [
      ['wrap-chicken-shawarma', 'Chicken Shawarma Wrap', 1100],
      ['wrap-beef-doner', 'Beef Doner Wrap', 1100],
      ['wrap-shawarma-doner-combo', 'Shawarma & Beef Doner Combo Wrap', 1100],
      ['wrap-chicken-chapli', 'Chicken Chapli Kebab Wrap', 1100],
      ['wrap-beef-chapli', 'Beef Chapli Kebab Wrap', 1100],
      ['wrap-chapli-combo', 'Beef & Chicken Chapli Combo Wrap', 1199],
      ['wrap-gyro', 'Chicken or Beef Gyro', 900],
      ['wrap-masala-fish', 'Masala Fish Wrap', 1100],
      ['wrap-falafel', 'Falafel Wrap', 1000],
    ],
  ],
  [
    'cat-sides',
    'Sides',
    [
      ['side-fries', 'French Fries', 500],
      ['side-fries-small', 'French Fries (Small)', 300],
      ['side-shirazi-salad', 'Shirazi Salad', 400],
      ['side-falafel', 'Falafel (7 pieces)', 500],
      ['side-hummus', 'Hummus with Pita', 600],
      ['side-chapli-only', 'Chapli Kebab Only', 400],
      ['side-shawarma-only', 'Shawarma or Doner Only', 500],
    ],
  ],
  [
    'cat-desserts',
    'Desserts',
    [
      ['dessert-milk-pudding', 'Milk Pudding', 600],
      ['dessert-caramel-pudding', 'Caramel Pudding', 600],
      ['dessert-baklava', 'Baklava', 500],
      ['dessert-kataifi', 'Kataifi Bites', 650],
      ['dessert-dubai-kataifi', 'Dubai Chocolate Kataifi Bites', 650],
    ],
  ],
  [
    'cat-drinks',
    'Drinks',
    [
      ['drink-water', 'Water', 159],
      ['drink-soda', 'Can Soda (12 oz)', 199],
      ['drink-monster', 'Monster Energy', 319],
      ['drink-juice', 'Juices & Lemonade', 289],
      ['drink-jarritos', 'Jarritos', 300],
      ['drink-snapple', 'Snapple', 300],
    ],
  ],
];

function build(): Menu {
  const items: Record<string, MenuItem> = {};
  const categories: Category[] = sections.map(([id, name, rows]) => {
    for (const [itemId, itemName, price, extra] of rows) {
      items[itemId] = {
        id: itemId,
        name: itemName,
        price,
        available: true,
        modifierGroupIds: [],
        ...extra,
      };
    }
    return { id, name, itemIds: rows.map(([itemId]) => itemId) };
  });
  return { source: 'seed', categories, items, modifierGroups };
}

export const seedMenu: Menu = build();
