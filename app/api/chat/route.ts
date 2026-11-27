import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
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
  generateAndUploadProductImage,
  getProductImageContext,
  getStoreOverview,
  listAllProducts,
  listOrders,
  listProducts,
  updateInventory,
  updateProduct,
} from "@/lib/shopify-admin";

const requestSchema = z.object({
  messages: z.array(z.unknown()),
});

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
      "Create a Shopify product and set the price of its default variant. Every new product automatically receives an image unless imageUrl is supplied. Include a detailed visualPrompt describing the product's appearance. Never invent example image URLs. Optionally publish it to the Online Store.",
    inputSchema: z.object({
      title: z.string().min(1),
      descriptionHtml: z.string().optional(),
      vendor: z.string().optional(),
      productType: z.string().optional(),
      price: z.union([z.string(), z.number()]),
      status: z.enum(["ACTIVE", "ARCHIVED", "DRAFT"]).optional(),
      imageUrl: z.string().url().optional(),
      visualPrompt: z
        .string()
        .optional()
        .describe("Detailed visual description matching the product details."),
      generateImage: z.boolean().optional(),
      publishToOnlineStore: z.boolean().optional(),
    }),
    execute: (input) =>
      createProduct({
        ...input,
        publishToOnlineStore:
          input.status === "ACTIVE" || input.publishToOnlineStore,
      }),
  }),
  updateProduct: tool({
    description:
      "Update Shopify product fields, set a variant price, optionally add a direct imageUrl, or generate a new image by setting generateImage true. Include a detailed visualPrompt for generated images. Use listProducts first when the product was identified by name; pass exact returned IDs.",
    inputSchema: z.object({
      id: z.string().min(1).describe("Exact Shopify product GID."),
      title: z.string().optional(),
      descriptionHtml: z.string().optional(),
      vendor: z.string().optional(),
      productType: z.string().optional(),
      status: z.enum(["ACTIVE", "ARCHIVED", "DRAFT"]).optional(),
      price: z.union([z.string(), z.number()]).optional(),
      variantId: z.string().optional().describe("Exact Shopify variant GID."),
      imageUrl: z.string().url().optional(),
      visualPrompt: z
        .string()
        .optional()
        .describe("Detailed visual description for the generated product image."),
      generateImage: z.boolean().optional(),
      publishToOnlineStore: z.boolean().optional(),
    }),
    execute: (input) => updateProduct(input),
  }),
  addProductImage: tool({
    description:
      "Add or regenerate an existing product image. Use a user-supplied direct imageUrl if available; otherwise generate one from product details and visualPrompt. Never invent image URLs.",
    inputSchema: z.object({
      id: z.string().min(1).describe("Exact Shopify product GID."),
      imageUrl: z.string().url().optional().describe("Optional direct image URL."),
      visualPrompt: z
        .string()
        .optional()
        .describe("Detailed visual description for the product image."),
    }),
    execute: async ({ id, imageUrl, visualPrompt }) => {
      if (imageUrl) {
        const product = await getProductImageContext(id);
        if (!product) {
          throw new Error("Shopify could not find the product for the image.");
        }
        return addProductImage({
          id,
          imageUrl,
          altText: product.title,
        });
      }

      const product = await getProductImageContext(id);
      if (!product) {
        throw new Error("Shopify could not find the product for the image.");
      }

      return generateAndUploadProductImage(
        id,
        product.title,
        visualPrompt ??
          [product.title, product.description, product.vendor, product.productType]
            .filter(Boolean)
            .join(", "),
      );
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

For every new product, include a detailed, visually specific visualPrompt matching its title and description; Shopify image generation runs automatically unless an imageUrl is supplied. Never invent fake/example.com image URLs. When a user asks to add or regenerate an image for an existing product, include a detailed visualPrompt and use updateProduct with generateImage: true (or the addProductImage tool). If a direct user-supplied imageUrl exists, use it instead of generating. If imageUpload.status is FAILED, clearly say the product was created or updated but the image could not be generated/uploaded. For addProductImage, the result field is imageStatus; only claim the image is ready when it is READY. For UPLOADED or PROCESSING, explain processing may still be underway.

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
