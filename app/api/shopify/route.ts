import { z } from "zod";
import {
  deleteProduct,
  getStoreOverview,
  listAllProducts,
  listOrders,
  shopifyAdminFetch,
  updateInventory,
  updateProduct,
} from "@/lib/shopify-admin";

const postActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("updateInventory"),
    inventoryItemId: z.string().min(1),
    quantity: z.number().int(),
  }),
  z.object({
    action: z.literal("deleteProduct"),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal("toggleStatus"),
    id: z.string().min(1),
  }),
]);

function isAuthorized(request: Request): boolean {
  const adminPassword = process.env.ADMIN_CHAT_PASSWORD;
  return Boolean(
    adminPassword &&
      request.headers.get("x-admin-password") === adminPassword,
  );
}

function errorResponse(error: unknown): Response {
  const message =
    error instanceof Error ? error.message : "Shopify request failed.";

  return Response.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = new URL(request.url).searchParams.get("action");

  try {
    switch (action) {
      case "products":
        return Response.json(await listAllProducts());
      case "orders":
        return Response.json(await listOrders());
      case "overview":
        return Response.json(await getStoreOverview());
      case "health": {
        const data = await shopifyAdminFetch<{
          shop: { name: string; myshopifyDomain: string };
        }>(
          `query CheckShopifyConnection {
            shop {
              name
              myshopifyDomain
            }
          }`,
        );
        return Response.json(data.shop);
      }
      default:
        return Response.json(
          { error: "Invalid action. Use products, orders, or overview." },
          { status: 400 },
        );
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const parsedBody = postActionSchema.safeParse(requestBody);
  if (!parsedBody.success) {
    return Response.json(
      {
        error:
          "Invalid action body. Provide updateInventory, deleteProduct, or toggleStatus with its required fields.",
      },
      { status: 400 },
    );
  }

  try {
    switch (parsedBody.data.action) {
      case "updateInventory": {
        const result = await updateInventory({
          inventoryItemId: parsedBody.data.inventoryItemId,
          quantity: parsedBody.data.quantity,
        });
        return Response.json(result);
      }
      case "deleteProduct": {
        const deletedProductId = await deleteProduct(parsedBody.data.id);
        return Response.json({ deletedProductId });
      }
      case "toggleStatus": {
        const { product } = await shopifyAdminFetch<{
          product: { id: string; status: "ACTIVE" | "ARCHIVED" | "DRAFT" } | null;
        }>(
          `query GetProductStatus($id: ID!) {
            product(id: $id) {
              id
              status
            }
          }`,
          { id: parsedBody.data.id },
        );

        if (!product) {
          return Response.json({ error: "Product not found." }, { status: 404 });
        }

        const status = product.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
        const updatedProduct = await updateProduct({
          id: product.id,
          status,
          publishToOnlineStore: status === "ACTIVE",
        });

        return Response.json({ product: updatedProduct });
      }
    }
  } catch (error) {
    return errorResponse(error);
  }
}
