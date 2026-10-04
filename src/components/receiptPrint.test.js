/**
 * The printed chek.
 *
 * The receipt is the only artefact of a sale that leaves the building, and the customer keeps it.
 * So the properties worth pinning are the ones that would be discovered weeks later, by someone
 * standing at the counter with a piece of paper the software no longer agrees with:
 *
 *   * the barcode is on it, and it is the purchase's code — the Returns scanner has nothing else
 *     to go on;
 *   * a discount is shown as a reduction, with the three figures adding up, because a customer
 *     who cannot reconcile their own receipt will assume they were overcharged;
 *   * a debt and its due date survive onto the paper, since that is the whole record the customer
 *     has of what they promised;
 *   * the page is 80×300mm and the last sheet is not blank.
 */
import {
  buildReceiptHtml,
  formatReceiptDate,
  formatReceiptDay,
  formatReceiptMoney,
} from './receiptPrint';

const labels = {
  shopName: 'Immense Shop',
  subtotal: 'Jami',
  discount: 'Chegirma',
  total: "To'lov",
  creditTitle: 'Nasiya (qarz)',
  creditDue: "To'lash sanasi",
  giveaway: 'Bepul',
  thanks: 'Xaridingiz uchun rahmat!',
  returned: 'QAYTARILGAN',
  returnedPartial: 'QAYTARILGAN: {{n}} dona',
  refundPending: "to'lov kutilmoqda",
  refundedTotal: 'Qaytarildi',
  netTotal: 'Sof jami',
};

const receipt = (over = {}) => ({
  code: 'RC00000412',
  currency: 'USD',
  sale_date: '2026-09-05T15:58:00Z',
  customer_name: 'Sanjar aka',
  salesman_name: 'admin',
  items: [{
    sale_id: 412, brand: 'On', model: 'Cloudtilt', size: '41', color: 'White',
    quantity: 1, unit_price: '240.00', total: '240.00', is_giveaway: false,
  }],
  subtotal: '240.00',
  discount_total: '0.00',
  total: '240.00',
  credit_amount: null,
  credit_currency: null,
  credit_due_date: null,
  ...over,
});

describe('the paper is the right size', () => {
  it('is 80 by 300 with no margin', () => {
    // Without this Chrome treats the size as a hint and falls back to A4 with the chek in the
    // corner — the single commonest failure of browser label printing.
    const html = buildReceiptHtml(receipt(), labels);
    expect(html).toContain('size: 80mm 300mm');
    expect(html).toContain('margin: 0');
  });

  it('does not clip a long purchase', () => {
    // A label must never spill; a receipt for six pairs legitimately runs to a second sheet, the
    // way every till roll does. A fixed height here would silently cut items off the bottom.
    const many = Array.from({ length: 12 }, (_, i) => ({
      sale_id: i, brand: 'On', model: `Cloud ${i}`, size: '41', color: 'White',
      quantity: 1, unit_price: '100.00', total: '100.00', is_giveaway: false,
    }));
    const html = buildReceiptHtml(receipt({ items: many }), labels);
    expect(html).not.toMatch(/\.receipt\s*\{[^}]*overflow:\s*hidden/);
    expect(html.match(/class="receipt__item"/g)).toHaveLength(12);
  });
});

describe('the barcode', () => {
  it('is drawn, because Returns has nothing else to scan', () => {
    const html = buildReceiptHtml(receipt(), labels);
    expect(html).toContain('<svg');
    expect(html).toContain('receipt__code');
  });

  it('is printed underneath in readable characters too', () => {
    // A smudged thermal print still has to be typeable by hand.
    expect(buildReceiptHtml(receipt(), labels)).toContain('RC00000412');
  });

  it('leaves the block out rather than drawing a broken symbol', () => {
    const html = buildReceiptHtml(receipt({ code: null }), labels);
    expect(html).not.toContain('<svg');
    expect(html).toContain('Immense Shop');
  });
});

describe('what the customer can check', () => {
  it('names the shop', () => {
    expect(buildReceiptHtml(receipt(), labels)).toContain('Immense Shop');
  });

  it('names the item, its size and its colour', () => {
    const html = buildReceiptHtml(receipt(), labels);
    expect(html).toContain('On | Cloudtilt');
    expect(html).toContain('41 · White');
  });

  it('shows quantity times price', () => {
    const html = buildReceiptHtml(receipt({
      items: [{ ...receipt().items[0], quantity: 3, unit_price: '40.00', total: '120.00' }],
      subtotal: '120.00', total: '120.00',
    }), labels);
    expect(html).toContain('3 × 40.00 y.e');
  });

  it('carries the purchase date', () => {
    expect(buildReceiptHtml(receipt(), labels)).toContain('05.09.2026');
  });

  it('does not print the customer name', () => {
    // Left off deliberately. The person holding the paper knows who they are, and a receipt gets
    // dropped, left in a bag, or handed to whoever brings the item back.
    expect(buildReceiptHtml(receipt(), labels)).not.toContain('Sanjar aka');
  });

  it('lists every item of a multi-item purchase', () => {
    const html = buildReceiptHtml(receipt({
      items: [
        receipt().items[0],
        { sale_id: 413, brand: 'Nike', model: 'Pegasus', size: '42', color: 'Black',
          quantity: 2, unit_price: '90.00', total: '180.00', is_giveaway: false },
      ],
      subtotal: '420.00', total: '420.00',
    }), labels);
    expect(html).toContain('On | Cloudtilt');
    expect(html).toContain('Nike | Pegasus');
    expect(html).toContain('420.00 y.e');
  });
});

describe('a discount', () => {
  const discounted = receipt({ subtotal: '240.00', discount_total: '20.00', total: '220.00' });

  it('shows the three figures so they can be added up', () => {
    // A customer who cannot reconcile their own receipt assumes they were overcharged.
    const html = buildReceiptHtml(discounted, labels);
    expect(html).toContain('240.00 y.e');
    expect(html).toContain('-20.00 y.e');
    expect(html).toContain('220.00 y.e');
  });

  it('is not mentioned at all when there was none', () => {
    // The subtotal would otherwise repeat the total on the line above it.
    const html = buildReceiptHtml(receipt(), labels);
    expect(html).not.toContain('Chegirma');
    expect(html).not.toContain('Jami');
  });
});

describe('nasiya', () => {
  const owed = receipt({
    credit_amount: '150.00', credit_currency: 'USD', credit_due_date: '2026-12-01',
  });

  it('prints what is owed and when it is due', () => {
    const html = buildReceiptHtml(owed, labels);
    expect(html).toContain('Nasiya (qarz)');
    expect(html).toContain('150.00 y.e');
    expect(html).toContain('01.12.2026');
  });

  it('still prints the amount when no date was recorded', () => {
    const html = buildReceiptHtml(receipt({ credit_amount: '150.00' }), labels);
    expect(html).toContain('150.00 y.e');
    expect(html).not.toContain("To'lash sanasi");
  });

  it('is absent on a sale that was paid', () => {
    expect(buildReceiptHtml(receipt(), labels)).not.toContain('Nasiya');
  });
});

describe('money is written the way the shop writes it', () => {
  it('gives dollars two decimals, written y.e as the labels write it', () => {
    expect(formatReceiptMoney('240.5', 'USD')).toBe('240.50 y.e');
  });

  it('groups som and drops the decimals nobody can hand over', () => {
    expect(formatReceiptMoney('1356425', 'UZS')).toBe('1 356 425 uzs');
  });

  it.each([[null], [undefined], ['abc']])('survives %j', (v) => {
    expect(formatReceiptMoney(v, 'USD')).toBe('');
  });
});

describe('dates', () => {
  it('prints a purchase moment to the minute', () => {
    expect(formatReceiptDate('2026-09-05T15:58:00')).toBe('05.09.2026 15:58');
  });

  it('prints a due date without an hour, which would be noise', () => {
    expect(formatReceiptDay('2026-12-01')).toBe('01.12.2026');
  });

  it.each([[null], [''], ['not a date']])('survives %j', (v) => {
    expect(formatReceiptDate(v)).toBe('');
    expect(formatReceiptDay(v)).toBe('');
  });
});

describe('hostile content', () => {
  it('escapes a model name containing markup', () => {
    const html = buildReceiptHtml(receipt({
      items: [{ ...receipt().items[0], model: 'A & B <x>' }],
    }), labels);
    expect(html).not.toContain('<x>');
    expect(html).toContain('&amp;');
  });

  it('survives a receipt with no items', () => {
    expect(() => buildReceiptHtml(receipt({ items: [] }), labels)).not.toThrow();
  });

  it.each([[null], [undefined]])('returns nothing for %j', (v) => {
    expect(buildReceiptHtml(v, labels)).toBe('');
  });
});


describe('an item that came back', () => {
  /**
   * The returned line stays on the paper, because the customer did take it home and the chek in
   * their pocket lists it. What changes is that it says so, and that the summary stops claiming
   * they paid for it.
   */
  const twoItems = (overFirst = {}, overSecond = {}) => receipt({
    items: [
      {
        sale_id: 1, brand: 'On', model: 'Cloudtilt', size: '41', color: 'White',
        quantity: 1, unit_price: '100.00', total: '100.00', is_giveaway: false,
        returned_quantity: 0, refund_pending_quantity: 0, ...overFirst,
      },
      {
        sale_id: 2, brand: 'On', model: 'Cloudrunner', size: '42', color: 'Black',
        quantity: 1, unit_price: '60.00', total: '60.00', is_giveaway: false,
        returned_quantity: 1, refund_pending_quantity: 0, ...overSecond,
      },
    ],
    subtotal: '160.00', total: '160.00',
    refunded_total: '60.00', net_total: '100.00',
  });

  it('marks the line it came back on, and only that one', () => {
    const html = buildReceiptHtml(twoItems(), labels);
    expect(html).toContain('QAYTARILGAN');
    // Matched as an element: the class name also appears in the embedded stylesheet, so searching
    // for the bare string is true of every receipt ever printed.
    expect(html.match(/<div class="receipt__returned">/g)).toHaveLength(1);
  });

  it('keeps the returned item on the paper', () => {
    // A reprint that dropped it would not match the chek the customer is holding, and the Returns
    // page scans that code expecting to find the line.
    const html = buildReceiptHtml(twoItems(), labels);
    expect(html).toContain('Cloudrunner');
  });

  it('shows what was paid back and what the purchase came to', () => {
    const html = buildReceiptHtml(twoItems(), labels);
    expect(html).toContain('Qaytarildi');
    expect(html).toContain('-60.00 y.e');
    expect(html).toContain('Sof jami');
    expect(html).toContain('100.00 y.e');
  });

  it('says how many came back when only part of a line did', () => {
    // The line above still reads "2 ×", so a bare "returned" would contradict it.
    const html = buildReceiptHtml(twoItems({}, {
      quantity: 2, unit_price: '30.00', total: '60.00', returned_quantity: 1,
    }), labels);
    expect(html).toContain('QAYTARILGAN: 1 dona');
  });

  it('says the refund is still owed when it has not been paid', () => {
    // The goods are back but the money is not, and the customer must not be handed paper implying
    // the matter is closed.
    const html = buildReceiptHtml(twoItems({}, {
      returned_quantity: 1, refund_pending_quantity: 1,
    }), labels);
    expect(html).toContain("to'lov kutilmoqda");
  });

  it('adds nothing to an ordinary sale', () => {
    // The great majority of cheks. Both figures absent means the paper is byte-for-byte what it was.
    const html = buildReceiptHtml(receipt(), labels);
    expect(html).not.toContain('<div class="receipt__returned">');
    expect(html).not.toContain('Qaytarildi');
    expect(html).not.toContain('Sof jami');
  });

  it('survives an older payload that carries no return fields', () => {
    // A receipt fetched before this shipped, or a cached response, has neither key.
    const html = buildReceiptHtml(twoItems({}, { returned_quantity: undefined }), labels);
    expect(html).toBeTruthy();
    expect(html).not.toContain('<div class="receipt__returned">');
  });
});
