import type { Menu, MenuItem } from './types';

/**
 * Descriptions, labels, and photos that Clover doesn't store. Rules match on the item name, so
 * they apply to the live Clover menu and the built-in copy alike. The descriptions are
 * placeholders written from the dish names; replace them with the restaurant's own wording.
 */
interface ExtraRule {
  match: RegExp;
  description?: string;
  tags?: string[];
  image?: string;
}

const rules: ExtraRule[] = [
  { match: /customi[sz]ed combo/i, description: 'Pick any two of our meats or falafel.' },
  { match: /chapli.*combo|combo.*chapli/i, description: 'Beef and chicken chapli kebab together.' },
  { match: /shawarma.*doner.*combo/i, description: 'Chicken shawarma and beef doner together.' },
  { match: /chapli/i, description: 'Peshawari-style spiced kebab, cooked fresh.', tags: ['Popular'] },
  { match: /chicken shawarma/i, description: 'Marinated chicken shawarma.', tags: ['Popular'] },
  { match: /doner/i, description: 'Seasoned beef doner, thinly sliced.' },
  { match: /gyro/i, description: 'Your choice of chicken or beef.' },
  { match: /masala fish|fish over fries/i, description: 'Fish seasoned with masala spices.' },
  { match: /falafel/i, description: 'Crispy chickpea falafel.' },
  { match: /hummus/i, description: 'Served with warm pita.' },
  { match: /shirazi/i, description: 'Cucumber, tomato, and onion salad.' },
  { match: /dubai chocolate/i, description: 'Crispy kataifi with pistachio and chocolate.', tags: ['New'] },
];

/** Tidies Clover-style names such as "Beef Doner ( Platter )". */
export function cleanItemName(name: string): string {
  return name
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

function decorate(item: MenuItem): MenuItem {
  const rule = rules.find((r) => r.match.test(item.name));
  return {
    ...item,
    name: cleanItemName(item.name),
    description: item.description ?? rule?.description,
    tags: item.tags ?? rule?.tags,
    image: item.image ?? rule?.image,
  };
}

export function decorateMenu(menu: Menu): Menu {
  const items: Record<string, MenuItem> = {};
  for (const [id, item] of Object.entries(menu.items)) items[id] = decorate(item);
  return { ...menu, items };
}
