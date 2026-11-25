import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  generateImage as generateImageWithAI,
  isStepCount,
  streamText,
  tool,
  validateUIMessages,
} from "ai";
import { z } from "zod";
import {
  addProductImage,
  createProduct,
  deleteProduct,
  getProductImageContext,
  getStoreOverview,
  listAllProducts,
  listOrders,
  listProducts,
  updateInventory,
  updateProduct,
  uploadGeneratedProductImage,
} from "@/lib/shopify-admin";

const requestSchema = z.object({
  messages: z.array(z.unknown()),
});

function getGeneratedImagePrompt({
  title,
  description,
  vendor,
  productType,
  price,
}: {
  title: string;
  description?: string;
  vendor?: string;
  productType?: string;
  price?: string | number;
}) {
  const cleanDescription = description
    ?.replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
  const details = [
    `Product title: ${title}`,
    cleanDescription ? `Description: ${cleanDescription}` : undefined,
    vendor ? `Vendor: ${vendor}` : undefined,
    productType ? `Product type: ${productType}` : undefined,
    price !== undefined ? `Price context: ${price} (do not show text or price)` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  return `Create a square, photorealistic studio e-commerce product image using these product details:\n${details}\n\nShow one clear product on a clean, neutral background with professional lighting. Do not include text, logos, branding, watermarks, packaging copy, or price labels. Make an illustrative product image based on the provided details; do not imply it is a verified photograph of a specific real-world item.`;
}

async function generateAndStageProductImage({
  title,
  description,
  vendor,
  productType,
  price,
}: {
  title: string;
  description?: string;
  vendor?: string;
  productType?: string;
  price?: string | number;
}) {
  const result = await generateImageWithAI({
    model: google.image("gemini-nano-banana-2.1"),
    prompt: getGeneratedImagePrompt({
      title,
      description,
      vendor,
      productType,
      price,
    }),
    aspectRatio: "1:1",
    maxRetries: 1,
  });
  const image = result.image;

  return uploadGeneratedProductImage({
    bytes: image.uint8Array,
    mimeType: image.mediaType,
  });
}

const shopifyTools = {
  listProducts: tool({
    description:
      "Search Shopify products. Use this first to find exact product, variant, or inventory item IDs before editing, restocking, or deleting a product by name.",
    inputSchema: z.object({
      query: z.string().optional().describe("Optional Shopify product search filter."),
    }),
    execute: ({ query }) => listProducts(query),
  }),
  listAllProducts: tool({
    description:
      "Retrieve every product and all of its variants across the Shopify store. Use for explicit requests to list or audit the complete catalog; use listProducts for focused product lookup by name.",
    inputSchema: z.object({
      query: z.string().optional().describe("Optional Shopify product search filter."),
    }),
    execute: ({ query }) => listAllProducts(query),
  }),
  createProduct: tool({
    description:
      "Create a Shopify product and set the price of its default variant. If the user supplies a direct image URL, pass it as imageUrl. If the user explicitly asks for an image but gives no URL, set generateImage to true so a product image is generated from the product details. Do not generate images for products unless requested. Optionally publish it to the Online Store.",
    inputSchema: z.object({
      title: z.string().min(1),
      descriptionHtml: z.string().optional(),
      vendor: z.string().optional(),
      productType: z.string().optional(),
      price: z.union([z.string(), z.number()]),
      status: z.enum(["ACTIVE", "ARCHIVED", "DRAFT"]).optional(),
      imageUrl: z.string().url().optional(),
      generateImage: z.boolean().optional(),
      publishToOnlineStore: z.boolean().optional(),
    }),
    execute: async ({ imageUrl, generateImage, ...input }) => {
      const product = await createProduct({
        ...input,
        publishToOnlineStore:
          input.status === "ACTIVE" || input.publishToOnlineStore,
      });

      if (!imageUrl && !generateImage) return product;

      try {
        const sourceUrl =
          imageUrl ??
          (await generateAndStageProductImage({
            title: input.title,
            description: input.descriptionHtml,
            vendor: input.vendor,
            productType: input.productType,
            price: input.price,
          }));
        const imageResult = await addProductImage({
          id: product.id,
          imageUrl: sourceUrl,
          altText: input.title,
        });

        return { ...product, imageResult };
      } catch (error) {
        console.error(
          "Product creation image failed:",
          getChatErrorDetails(error),
        );
        return {
          ...product,
          imageResult: {
            imageStatus: "FAILED",
            imageUrl: null,
            imageError:
              "The product was created, but its image could not be generated or uploaded.",
          },
        };
      }
    },
  }),
  updateProduct: tool({
    description:
      "Update Shopify product fields, set a variant price, or publish to the Online Store. Use listProducts first when the product was identified by name; pass the exact returned product and variant IDs. Use addProductImage separately for images.",
    inputSchema: z.object({
      id: z.string().min(1).describe("Exact Shopify product GID."),
      title: z.string().optional(),
      descriptionHtml: z.string().optional(),
      vendor: z.string().optional(),
      productType: z.string().optional(),
      status: z.enum(["ACTIVE", "ARCHIVED", "DRAFT"]).optional(),
      price: z.union([z.string(), z.number()]).optional(),
      variantId: z.string().optional().describe("Exact Shopify variant GID."),
      publishToOnlineStore: z.boolean().optional(),
    }),
    execute: (input) => updateProduct(input),
  }),
  addProductImage: tool({
    description:
      "Add an image to an existing Shopify product. If the user supplied a direct image URL, pass it as imageUrl. If they explicitly asked for an image but provided no URL, omit imageUrl to generate an illustrative product image from the existing product's title and description. Do not generate images for unrelated product edits. Return Shopify's media processing status.",
    inputSchema: z.object({
      id: z.string().min(1).describe("Exact Shopify product GID."),
      imageUrl: z.string().url().optional().describe("Optional direct image URL."),
    }),
    execute: async ({ id, imageUrl }) => {
      if (imageUrl) {
        const product = await getProductImageContext(id);
        return addProductImage({
          id,
          imageUrl,
          altText: product.title,
        });
      }

      const product = await getProductImageContext(id);
      const generatedImageUrl = await generateAndStageProductImage({
        title: product.title,
        description: product.description,
        vendor: product.vendor,
        productType: product.productType,
        price: product.variants.nodes[0]?.price,
      });

      return addProductImage({
        id,
        imageUrl: generatedImageUrl,
        altText: product.title,
      });
    },
  }),
  listOrders: tool({
    description:
      "List recent Shopify orders with order dates, financial and fulfillment statuses, line items, and totals for reviewing recent sales and revenue.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(250).optional(),
    }),
    execute: ({ limit }) => listOrders(limit),
  }),
  getStoreOverview: tool({
    description:
      "Get a store health overview containing the product count, all low-stock variants with inventory of 10 or fewer, and recent order summaries.",
    inputSchema: z.object({}),
    execute: () => getStoreOverview(),
  }),
  updateInventory: tool({
    description:
      "Set the exact available inventory quantity for a Shopify inventory item. Use listProducts first when identifying the item by product name.",
    inputSchema: z.object({
      inventoryItemId: z
        .string()
        .min(1)
        .describe("Exact inventoryItem ID returned by listProducts."),
      quantity: z.number().int(),
    }),
    execute: (input) => updateInventory(input),
  }),
  deleteProduct: tool({
    description:
      "Permanently delete a Shopify product. Use listProducts first when the product was identified by name, and pass its exact product GID.",
    inputSchema: z.object({
      id: z.string().min(1).describe("Exact Shopify product GID."),
    }),
    execute: ({ id }) => deleteProduct(id),
  }),
};

const systemPrompt = `You are an expert Shopify Inventory Manager assistant.

Never guess or invent Shopify IDs. If asked to edit, restock, or delete a product by name, first call listProducts to find the exact matching product and retrieve the exact Shopify product GID, Variant ID, or InventoryItem ID required for the requested action. If the match is ambiguous, ask the user to clarify before making changes.

When the user asks for a complete product catalog, call listAllProducts. Use listProducts for focused name-based lookup before editing, restocking, or deleting. When creating a product with status ACTIVE, always set publishToOnlineStore to true so it appears on the live storefront immediately. Do not claim that a product is live unless the publishing tool call succeeds.

Only generate an image when the user explicitly requests one. For new products, pass generateImage: true to createProduct if an image was requested without a URL. For existing products, call addProductImage without imageUrl in that case; it will use the actual Shopify product details. Never invent an image URL. Generated images are illustrative, not verified photos of branded products. Only say an image is ready when Shopify returns imageStatus "READY"; for "UPLOADED" or "PROCESSING", explain it may not appear in the storefront until processing finishes. If createProduct returns an imageResult with imageStatus "FAILED", clearly say the product was created but the image generation/upload failed. If addProductImage fails during an update, clearly distinguish any successful field changes from the image failure.

Present product results as clear bullet points or clean Markdown tables. Include title, price, stock, status, storefront visibility, and the exact product ID whenever available. Use the first variant's price, total product inventory for Stock, and the product GID for ID. For order summaries, include order name, date, financial status, fulfillment status, and total with its currency.`;

function getChatErrorDetails(error: unknown) {
  const details: {
    name: string;
    statusCode?: number;
    code?: string | number;
    isRetryable?: boolean;
  } = {
    name: error instanceof Error ? error.name : "UnknownError",
  };

  if (typeof error !== "object" || error === null) return details;

  if ("statusCode" in error && typeof error.statusCode === "number") {
    details.statusCode = error.statusCode;
  }
  if (
    "code" in error &&
    (typeof error.code === "string" || typeof error.code === "number")
  ) {
    details.code = error.code;
  }
  if ("isRetryable" in error && typeof error.isRetryable === "boolean") {
    details.isRetryable = error.isRetryable;
  }

  return details;
}

function getChatErrorMessage(error: unknown) {
  const { statusCode } = getChatErrorDetails(error);

  switch (statusCode) {
    case 401:
      return "Google rejected the API key. Check GOOGLE_GENERATIVE_AI_API_KEY.";
    case 403:
      return "Google denied access to Gemini. Check the API key's project and model access.";
    case 404:
      return "Google could not find the configured Gemini model.";
    case 429:
      return "The Gemini API quota or rate limit was exceeded.";
    default:
      return statusCode
        ? `The Gemini request failed (HTTP ${statusCode}). Please try again.`
        : "The assistant could not finish this response. Please try again.";
  }
}

export async function POST(req: Request) {
  try {
    const adminPassword = process.env.ADMIN_CHAT_PASSWORD;
    if (
      !adminPassword ||
      req.headers.get("x-admin-password") !== adminPassword
    ) {
      return Response.json(
        { error: "Unauthorized: Invalid Admin Password" },
        { status: 401 },
      );
    }

    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const parsedBody = requestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return Response.json(
        { error: "Request body must include a messages array" },
        { status: 400 },
      );
    }

    let messages;
    try {
      messages = await validateUIMessages({
        messages: parsedBody.data.messages,
        tools: shopifyTools,
      });
    } catch {
      return Response.json({ error: "Invalid chat messages" }, { status: 400 });
    }

    const modelMessages = await convertToModelMessages(messages, {
      tools: shopifyTools,
    });
    const result = streamText({
      model: google("gemini-3.5-flash-lite"),
      system: systemPrompt,
      messages: modelMessages,
      tools: shopifyTools,
      stopWhen: isStepCount(6),
      abortSignal: req.signal,
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      onError: (error) => {
        console.error("Chat stream failed:", getChatErrorDetails(error));
        return getChatErrorMessage(error);
      },
      redactToolErrors: false,
    });
  } catch (error) {
    console.error("Chat request failed:", getChatErrorDetails(error));
    return Response.json(
      { error: getChatErrorMessage(error) },
      { status: 500 },
    );
  }
}
