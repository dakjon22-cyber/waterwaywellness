import { logger } from './logger';

const PRINTIFY_API_BASE = 'https://api.printify.com/v1';

function getCredentials() {
  const token = process.env.PRINTIFY_API_TOKEN;
  const shopId = '26420569';

  if (!token) {
    throw new Error(
      'Printify credentials not configured. ' +
      'Set PRINTIFY_API_TOKEN environment secret.'
    );
  }
  return { token, shopId };
}

async function printifyFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { token } = getCredentials();
  const url = `${PRINTIFY_API_BASE}${path}`;

  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    logger.error({ status: resp.status, url, body }, 'Printify API error');
    throw new Error(`Printify API error ${resp.status}: ${body}`);
  }

  return resp.json() as Promise<T>;
}

export interface PrintifyImage {
  src: string;
  variant_ids: number[];
  position: string;
  is_default: boolean;
}

export interface PrintifyVariant {
  id: number;
  sku: string;
  cost: number;
  price: number;
  title: string;
  grams: number;
  is_enabled: boolean;
  is_default: boolean;
  is_available: boolean;
  options: number[];
}

export interface PrintifyOption {
  name: string;
  type: string;
  values: { id: number; title: string }[];
}

export interface PrintifyProduct {
  id: string;
  title: string;
  description: string;
  tags: string[];
  options: PrintifyOption[];
  variants: PrintifyVariant[];
  images: PrintifyImage[];
  is_locked: boolean;
  visible: boolean;
  external?: { id: string; handle: string };
}

export interface PrintifyProductsResponse {
  current_page: number;
  data: PrintifyProduct[];
  last_page: number;
  per_page: number;
  total: number;
}

export interface PrintifyOrderAddress {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  country: string;
  region: string;
  address1: string;
  address2?: string;
  city: string;
  zip: string;
}

export interface PrintifyOrderLineItem {
  product_id: string;
  variant_id: number;
  quantity: number;
}

export interface PrintifyOrderPayload {
  external_id: string;
  label?: string;
  line_items: PrintifyOrderLineItem[];
  shipping_method: number;
  send_shipping_notification: boolean;
  address_to: PrintifyOrderAddress;
}

export const printify = {
  async listProducts(): Promise<PrintifyProduct[]> {
    const { shopId } = getCredentials();
    const resp = await printifyFetch<PrintifyProductsResponse>(
      `/shops/${shopId}/products.json?limit=50`
    );
    const featured = [
      "698fa025bca977ae630b527b", // Throw Up The Dub Hoodie
      "6989163283b74d3ce6019200", // Throw Up The Dub T-Shirt
      "698f9d638406554f63047ba0", // WW Emblem Hoodie
      "69891f2649f8687bb30f6535", // WW Emblem T-Shirt
    ];
    return resp.data
      .filter(p => featured.includes(p.id))
      .sort((a, b) => featured.indexOf(a.id) - featured.indexOf(b.id));
  },

  async getProduct(productId: string): Promise<PrintifyProduct> {
    const { shopId } = getCredentials();
    return printifyFetch<PrintifyProduct>(
      `/shops/${shopId}/products/${productId}.json`
    );
  },

  async getOrder(orderId: string): Promise<any> {
    const { shopId } = getCredentials();
    return printifyFetch<any>(`/shops/${shopId}/orders/${orderId}.json`);
  },

  async createOrder(order: PrintifyOrderPayload): Promise<{ id: string }> {
    const { shopId } = getCredentials();
    return printifyFetch<{ id: string }>(
      `/shops/${shopId}/orders.json`,
      { method: 'POST', body: JSON.stringify(order) }
    );
  },
};
