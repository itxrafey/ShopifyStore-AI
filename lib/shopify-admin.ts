import "server-only";

type ShopifyProductStatus = "ACTIVE" | "ARCHIVED" | "DRAFT";

type ProductVariant = {
  id: string;
  title: string;
  price: string;
  sku: string | null;
  inventoryQuantity: number;
  inventoryItem: {
    id: string;
  };
};

export type ShopifyProduct = {
  id: string;
  title: string;
  description: string;
  featuredImage: {
    url: string;
    altText: string | null;
  } | null;
  status: ShopifyProductStatus;
  vendor: string;
  productType: string;
  totalInventory: number;
  variants: {
    nodes: ProductVariant[];
  };
};

export type ShopifyOrder = {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  lineItems: {
    edges: Array<{
      node: {
        title: string;
        quantity: number;
      };
    }>;
  };
};

export type ShopifyLowStockVariant = {
  id: string;
  title: string;
  sku: string | null;
  inventoryQuantity: number;
  product: {
    id: string;
    title: string;
  };
};

export type ShopifyStoreOverview = {
  productCount: number;
  totalUnitsInStock: number;
  lowStockVariants: ShopifyLowStockVariant[];
  recentOrders: ShopifyOrder[];
};

type ShopifyGraphQLResponse<T> = {
  data?: T | null;
  errors?: unknown;
};

type ShopifyProductInput = {
  title?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  status?: ShopifyProductStatus;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

let cachedAccessToken: string | undefined;
let cachedAccessTokenExpiresAt = 0;
let accessTokenRequest: Promise<string> | null = null;

function getShopifyStoreHost(): string {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN?.trim();

  if (!storeDomain) {
    throw new Error("Missing required environment variable: SHOPIFY_STORE_DOMAIN");
  }

  let storeUrl: URL;
  try {
    storeUrl = new URL(
      /^https?:\/\//i.test(storeDomain)
        ? storeDomain
        : `https://${storeDomain}`,
    );
  } catch {
    throw new Error(
      "SHOPIFY_STORE_DOMAIN must be a valid Shopify hostname or URL.",
    );
  }

  if (
    !storeUrl.hostname ||
    (storeUrl.protocol !== "https:" && storeUrl.protocol !== "http:") ||
    storeUrl.username ||
    storeUrl.password ||
    storeUrl.port ||
    !storeUrl.hostname.toLowerCase().endsWith(".myshopify.com")
  ) {
    throw new Error(
      "SHOPIFY_STORE_DOMAIN must be the store's *.myshopify.com domain, not an admin.shopify.com dashboard URL.",
    );
  }

  return storeUrl.host;
}

function redactSecret(message: string, secret: string): string {
  return message.split(secret).join("[redacted]");
}

function formatErrors(errors: unknown, accessToken: string): string | undefined {
  const messages = Array.isArray(errors)
    ? errors.flatMap((error: unknown) =>
        isRecord(error) && typeof error.message === "string"
          ? [error.message]
          : [],
      )
    : typeof errors === "string"
      ? [errors]
      : [];
  const formatted = messages
      .map((message) => redactSecret(message, accessToken))
    .filter(Boolean)
    .join("; ");

  return formatted || undefined;
}

async function requestShopifyAccessToken(): Promise<string> {
  const storeHost = getShopifyStoreHost();
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!clientId) {
      throw new Error("Missing required environment variable: SHOPIFY_CLIENT_ID");
  }

  if (!clientSecret) {
      throw new Error(
        "Missing required environment variable: SHOPIFY_CLIENT_SECRET",
      );
  }

  const response = await fetch(
      `https://${storeHost}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
        }),
        cache: "no-store",
      },
  );

  let responseBody: unknown;
  try {
      responseBody = await response.json();
  } catch {
      throw new Error(
        `Shopify OAuth token endpoint returned invalid JSON (HTTP ${response.status}).`,
      );
  }

  if (!response.ok) {
      const errorDetail = isRecord(responseBody)
        ? [
            responseBody.error_description,
            responseBody.error,
            responseBody.errors,
          ].find((value): value is string => typeof value === "string")
        : undefined;
      const safeErrorDetail = errorDetail
        ? redactSecret(errorDetail, clientSecret)
        : undefined;

      throw new Error(
        `Shopify OAuth token request failed with HTTP ${response.status} ${response.statusText}${safeErrorDetail ? `: ${safeErrorDetail}` : "."}`,
      );
  }

  if (
      !isRecord(responseBody) ||
      typeof responseBody.access_token !== "string" ||
      !responseBody.access_token ||
      typeof responseBody.expires_in !== "number" ||
      !Number.isFinite(responseBody.expires_in) ||
      responseBody.expires_in <= 0
  ) {
      throw new Error(
        "Shopify OAuth token endpoint returned an invalid access token or expiration.",
      );
  }

  cachedAccessToken = responseBody.access_token;
  const lifetimeMs = responseBody.expires_in * 1000;
  const refreshBufferMs = Math.min(60_000, lifetimeMs * 0.1);
  cachedAccessTokenExpiresAt = Date.now() + lifetimeMs - refreshBufferMs;

  return cachedAccessToken;
}

export async function getShopifyAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt) {
      return cachedAccessToken;
  }

  if (!accessTokenRequest) {
      accessTokenRequest = requestShopifyAccessToken();
  }

  try {
      return await accessTokenRequest;
  } finally {
      accessTokenRequest = null;
  }
}

export async function shopifyAdminFetch<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const storeHost = getShopifyStoreHost();
  const accessToken = await getShopifyAccessToken();

  const response = await fetch(
      `https://${storeHost}/admin/api/2026-04/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    },
  );

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new Error(
      `Shopify Admin API returned an invalid JSON response (HTTP ${response.status}).`,
    );
  }

  if (!isRecord(responseBody)) {
    if (!response.ok) {
      throw new Error(
        `Shopify Admin API request failed with HTTP ${response.status} ${response.statusText}.`,
      );
    }

    throw new Error("Shopify Admin API returned an invalid GraphQL response.");
  }

  const result = responseBody as ShopifyGraphQLResponse<T>;

  const errorDetails = formatErrors(result.errors, accessToken);

  if (!response.ok) {
    throw new Error(
      `Shopify Admin API request failed with HTTP ${response.status} ${response.statusText}${errorDetails ? `: ${errorDetails}` : "."}`,
    );
  }

  if (errorDetails) {
    throw new Error(`Shopify GraphQL error: ${errorDetails}`);
  }

  if (isRecord(result.data)) {
    const userErrorMessages = Object.values(result.data).flatMap((payload) => {
      if (!isRecord(payload)) {
        return [];
      }

      return ["userErrors", "mediaUserErrors"].flatMap((key) =>
        Array.isArray(payload[key])
          ? payload[key].flatMap((userError: unknown) =>
              isRecord(userError) && typeof userError.message === "string"
                ? [userError.message]
                : [],
            )
          : [],
      );
    });

    if (userErrorMessages.length) {
      const safeMessages = userErrorMessages
        .map((message) => redactSecret(message, accessToken))
        .join("; ");
      throw new Error(`Shopify mutation error: ${safeMessages}`);
    }
  }

  if (result.data == null) {
    throw new Error("Shopify Admin API response did not contain data.");
  }

  return result.data;
}

function getImageMedia(imageUrl?: string) {
  if (imageUrl === undefined) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new Error("imageUrl must be a valid HTTP or HTTPS URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("imageUrl must be a valid HTTP or HTTPS URL.");
  }

  return [{ originalSource: imageUrl, mediaContentType: "IMAGE" }];
}

async function publishProductToOnlineStore(productId: string): Promise<void> {
  const publicationData = await shopifyAdminFetch<{
    publications: { nodes: Array<{ id: string; name: string }> };
  }>(
    `query FindOnlineStorePublication {
      publications(first: 5) {
        nodes {
          id
          name
        }
      }
    }`,
  );

  const onlineStore = publicationData.publications.nodes.find(
    (publication) => publication.name === "Online Store",
  );

  if (!onlineStore) {
    throw new Error(
      'Could not publish product: the "Online Store" publication was not found.',
    );
  }

  await shopifyAdminFetch<{
    publishablePublish: { userErrors: Array<{ message: string }> };
  }>(
    `mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors {
          field
          message
        }
      }
    }`,
    {
      id: productId,
      input: [{ publicationId: onlineStore.id }],
    },
  );
}

const PRODUCT_CORE_FIELDS = `
  id
  title
  description
  featuredImage {
    url
    altText
  }
  status
  vendor
  productType
  totalInventory
`;

const PRODUCT_VARIANT_FIELDS = `
  id
  title
  price
  sku
  inventoryQuantity
  inventoryItem {
    id
  }
`;

const PRODUCT_FIELDS = `
  ${PRODUCT_CORE_FIELDS}
  variants(first: 10) {
    nodes {
      ${PRODUCT_VARIANT_FIELDS}
    }
  }
`;

const ORDER_FIELDS = `
  id
  name
  createdAt
  displayFinancialStatus
  displayFulfillmentStatus
  totalPriceSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  lineItems(first: 5) {
    edges {
      node {
        title
        quantity
      }
    }
  }
`;

export async function listProducts(query?: string): Promise<ShopifyProduct[]> {
  const data = await shopifyAdminFetch<{
    products: { nodes: ShopifyProduct[] };
  }>(
    `query ListProducts($query: String) {
      products(first: 25, query: $query) {
        nodes {
          ${PRODUCT_FIELDS}
        }
      }
    }`,
    { query: query ?? null },
  );

  return data.products.nodes;
}

export async function listAllProducts(query?: string): Promise<ShopifyProduct[]> {
  type ProductPage = {
    products: {
      nodes: Array<
        Omit<ShopifyProduct, "variants"> & {
          variants: {
            nodes: ProductVariant[];
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        }
      >;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };

  const allProducts: ShopifyProduct[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data: ProductPage = await shopifyAdminFetch<ProductPage>(
      `query ListAllProducts($query: String, $after: String) {
        products(first: 25, query: $query, after: $after) {
          nodes {
            ${PRODUCT_CORE_FIELDS}
            variants(first: 10) {
              nodes {
                ${PRODUCT_VARIANT_FIELDS}
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      { query: query ?? null, after },
    );

    for (const product of data.products.nodes) {
      const variants = [...product.variants.nodes];
      let variantPageInfo = product.variants.pageInfo;

      while (variantPageInfo.hasNextPage) {
        if (!variantPageInfo.endCursor) {
          throw new Error(
            `Shopify returned another variant page without a cursor for product ${product.id}.`,
          );
        }

        const nextVariantPage = await shopifyAdminFetch<{
          product: {
            variants: {
              nodes: ProductVariant[];
              pageInfo: { hasNextPage: boolean; endCursor: string | null };
            };
          } | null;
        }>(
          `query ListMoreProductVariants($id: ID!, $after: String!) {
            product(id: $id) {
              variants(first: 250, after: $after) {
                nodes {
                  ${PRODUCT_VARIANT_FIELDS}
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }`,
          { id: product.id, after: variantPageInfo.endCursor },
        );

        if (!nextVariantPage.product) {
          throw new Error(
            `Shopify product ${product.id} disappeared while fetching its variants.`,
          );
        }

        variants.push(...nextVariantPage.product.variants.nodes);
        variantPageInfo = nextVariantPage.product.variants.pageInfo;
      }

      allProducts.push({
        ...product,
        variants: { nodes: variants },
      });
    }

    hasNextPage = data.products.pageInfo.hasNextPage;
    after = data.products.pageInfo.endCursor;
    if (hasNextPage && !after) {
      throw new Error("Shopify returned another product page without a cursor.");
    }
  }

  return allProducts;
}

export async function listOrders(limit = 15): Promise<ShopifyOrder[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 250) {
    throw new Error("Order limit must be an integer between 1 and 250.");
  }

  const data = await shopifyAdminFetch<{
    orders: { nodes: ShopifyOrder[] };
  }>(
    `query ListOrders($limit: Int!) {
      orders(first: $limit, sortKey: CREATED_AT, reverse: true) {
        nodes {
          ${ORDER_FIELDS}
        }
      }
    }`,
    { limit },
  );

  return data.orders.nodes;
}

export async function getStoreOverview(): Promise<ShopifyStoreOverview> {
  const lowStockQuery = "inventory_quantity:<=10";
  const data = await shopifyAdminFetch<{
    productsCount: { count: number };
    products: {
      nodes: Array<{ totalInventory: number }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
    productVariants: {
      nodes: ShopifyLowStockVariant[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
    orders: { nodes: ShopifyOrder[] };
  }>(
    `query GetStoreOverview($lowStockQuery: String!) {
      productsCount(limit: null) {
        count
      }
      products(first: 250) {
        nodes {
          totalInventory
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      productVariants(first: 250, query: $lowStockQuery) {
        nodes {
          id
          title
          sku
          inventoryQuantity
          product {
            id
            title
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      orders(first: 5, sortKey: CREATED_AT, reverse: true) {
        nodes {
          ${ORDER_FIELDS}
        }
      }
    }`,
    { lowStockQuery },
  );

  const lowStockVariants = [...data.productVariants.nodes];
  let pageInfo = data.productVariants.pageInfo;
  let totalUnitsInStock = data.products.nodes.reduce(
    (total, product) => total + product.totalInventory,
    0,
  );
  let productsPageInfo = data.products.pageInfo;

  while (pageInfo.hasNextPage) {
    if (!pageInfo.endCursor) {
      throw new Error(
        "Shopify returned another low-stock page without a cursor.",
      );
    }

    const nextPage = await shopifyAdminFetch<{
      productVariants: {
        nodes: ShopifyLowStockVariant[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(
      `query GetNextLowStockVariants(
        $lowStockQuery: String!
        $after: String!
      ) {
        productVariants(
          first: 250
          after: $after
          query: $lowStockQuery
        ) {
          nodes {
            id
            title
            sku
            inventoryQuantity
            product {
              id
              title
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      { lowStockQuery, after: pageInfo.endCursor },
    );

    lowStockVariants.push(...nextPage.productVariants.nodes);
    pageInfo = nextPage.productVariants.pageInfo;
  }

  while (productsPageInfo.hasNextPage) {
    if (!productsPageInfo.endCursor) {
      throw new Error(
        "Shopify returned another product page without a cursor.",
      );
    }

    const nextPage = await shopifyAdminFetch<{
      products: {
        nodes: Array<{ totalInventory: number }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(
      `query GetNextProductInventory($after: String!) {
        products(first: 250, after: $after) {
          nodes {
            totalInventory
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      { after: productsPageInfo.endCursor },
    );

    totalUnitsInStock += nextPage.products.nodes.reduce(
      (total, product) => total + product.totalInventory,
      0,
    );
    productsPageInfo = nextPage.products.pageInfo;
  }

  return {
    productCount: data.productsCount.count,
    totalUnitsInStock,
    lowStockVariants,
    recentOrders: data.orders.nodes,
  };
}

export async function createProduct({
  title,
  descriptionHtml,
  vendor,
  productType,
  price,
  imageUrl,
  publishToOnlineStore,
  status,
}: {
  title: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  price: string | number;
  imageUrl?: string;
  publishToOnlineStore?: boolean;
  status?: ShopifyProductStatus;
}): Promise<ShopifyProduct> {
  if (publishToOnlineStore && status !== undefined && status !== "ACTIVE") {
    throw new Error(
      "A product must have ACTIVE status to be published to the Online Store.",
    );
  }

  const media = getImageMedia(imageUrl);
  const data = await shopifyAdminFetch<{
    productCreate: { product: ShopifyProduct | null };
  }>(
    `mutation CreateProduct(
      $product: ProductCreateInput!
      $media: [CreateMediaInput!]
    ) {
      productCreate(product: $product, media: $media) {
        product {
          ${PRODUCT_FIELDS}
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      product: {
        title,
        descriptionHtml,
        vendor,
        productType,
        status: status ?? (publishToOnlineStore ? "ACTIVE" : "DRAFT"),
      },
      media,
    },
  );

  const product = data.productCreate.product;
  if (!product) {
    throw new Error("Shopify productCreate did not return the created product.");
  }

  const defaultVariant = product.variants.nodes[0];
  if (!defaultVariant) {
    throw new Error("Shopify productCreate did not return a default variant.");
  }

  const priceData = await shopifyAdminFetch<{
    productVariantsBulkUpdate: { product: ShopifyProduct | null };
  }>(
    `mutation SetProductPrice(
      $productId: ID!
      $variants: [ProductVariantsBulkInput!]!
    ) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        product {
          ${PRODUCT_FIELDS}
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      productId: product.id,
      variants: [{ id: defaultVariant.id, price: String(price) }],
    },
  );

  const pricedProduct = priceData.productVariantsBulkUpdate.product;
  if (!pricedProduct) {
    throw new Error(
      "Shopify productVariantsBulkUpdate did not return the created product.",
    );
  }

  if (publishToOnlineStore) {
    await publishProductToOnlineStore(pricedProduct.id);
  }

  return pricedProduct;
}

export async function updateProduct({
  id,
  title,
  descriptionHtml,
  vendor,
  productType,
  status,
  price,
  variantId,
  imageUrl,
  publishToOnlineStore,
}: {
  id: string;
  title?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  status?: ShopifyProductStatus;
  price?: string | number;
  variantId?: string;
  imageUrl?: string;
  publishToOnlineStore?: boolean;
}): Promise<ShopifyProduct> {
  if ((price === undefined) !== (variantId === undefined)) {
    throw new Error("Provide both price and variantId to update a variant price.");
  }

  if (publishToOnlineStore && status !== undefined && status !== "ACTIVE") {
    throw new Error(
      "A product must have ACTIVE status to be published to the Online Store.",
    );
  }

  const media = getImageMedia(imageUrl);
  const productInput: ShopifyProductInput & { id: string } = { id };
  if (title !== undefined) productInput.title = title;
  if (descriptionHtml !== undefined) {
    productInput.descriptionHtml = descriptionHtml;
  }
  if (vendor !== undefined) productInput.vendor = vendor;
  if (productType !== undefined) productInput.productType = productType;
  if (status !== undefined) productInput.status = status;
  if (publishToOnlineStore) productInput.status = "ACTIVE";

  const hasProductFields = Object.keys(productInput).length > 1;
  if (
    !hasProductFields &&
    price === undefined &&
    imageUrl === undefined &&
    !publishToOnlineStore
  ) {
    throw new Error(
      "Provide at least one product field, a variant price, an image, or publication.",
    );
  }

  let product: ShopifyProduct | null = null;

  if (hasProductFields) {
    const data = await shopifyAdminFetch<{
      productUpdate: { product: ShopifyProduct | null };
    }>(
      `mutation UpdateProduct($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            ${PRODUCT_FIELDS}
          }
          userErrors {
            field
            message
          }
        }
      }`,
      { product: productInput },
    );

    product = data.productUpdate.product;
    if (!product) {
      throw new Error("Shopify productUpdate did not return the updated product.");
    }
  }

  if (price !== undefined && variantId !== undefined) {
    const data = await shopifyAdminFetch<{
      productVariantsBulkUpdate: { product: ShopifyProduct | null };
    }>(
      `mutation UpdateProductPrice(
        $productId: ID!
        $variants: [ProductVariantsBulkInput!]!
      ) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product {
            ${PRODUCT_FIELDS}
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        productId: id,
        variants: [{ id: variantId, price: String(price) }],
      },
    );

    product = data.productVariantsBulkUpdate.product ?? product;
  }

  if (imageUrl !== undefined && media) {
    const data = await shopifyAdminFetch<{
      productCreateMedia: { product: ShopifyProduct | null };
    }>(
      `mutation AddProductImage(
        $productId: ID!
        $media: [CreateMediaInput!]!
      ) {
        productCreateMedia(productId: $productId, media: $media) {
          product {
            ${PRODUCT_FIELDS}
          }
          mediaUserErrors {
            field
            message
          }
          userErrors {
            field
            message
          }
        }
      }`,
      { productId: id, media },
    );

    product = data.productCreateMedia.product ?? product;
  }

  if (publishToOnlineStore) {
    await publishProductToOnlineStore(id);
  }

  if (!product) {
    throw new Error("Shopify Admin API did not return the updated product.");
  }

  return product;
}

export async function updateInventory({
  inventoryItemId,
  quantity,
}: {
  inventoryItemId: string;
  quantity: number;
}): Promise<{
  inventoryAdjustmentGroup: {
    createdAt: string;
    reason: string;
  } | null;
}> {
  const locationData = await shopifyAdminFetch<{
    locations: { nodes: Array<{ id: string }> };
  }>(
    `query GetPrimaryLocation {
      locations(first: 1) {
        nodes {
          id
        }
      }
    }`,
  );

  const location = locationData.locations.nodes[0];
  if (!location) {
    throw new Error("Shopify store has no location for inventory updates.");
  }

  const data = await shopifyAdminFetch<{
    inventorySetQuantities: {
      inventoryAdjustmentGroup: {
        createdAt: string;
        reason: string;
      } | null;
    };
  }>(
    `mutation SetInventoryQuantity($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup {
          createdAt
          reason
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities: [{ inventoryItemId, locationId: location.id, quantity }],
      },
    },
  );

  return data.inventorySetQuantities;
}

export async function deleteProduct(id: string): Promise<string> {
  const data = await shopifyAdminFetch<{
    productDelete: { deletedProductId: string | null };
  }>(
    `mutation DeleteProduct($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors {
          field
          message
        }
      }
    }`,
    { input: { id } },
  );

  const deletedProductId = data.productDelete.deletedProductId;
  if (!deletedProductId) {
    throw new Error("Shopify productDelete did not return a deleted product ID.");
  }

  return deletedProductId;
}
