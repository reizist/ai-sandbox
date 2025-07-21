import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { updateReadingProgress } from "~/models/manga.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  
  try {
    const { collectionId, pageNumber } = await request.json();
    
    if (!collectionId || typeof pageNumber !== 'number') {
      return json({ error: "Invalid parameters" }, { status: 400 });
    }
    
    await updateReadingProgress(collectionId, pageNumber);
    
    return json({ success: true });
    
  } catch (error) {
    console.error("Error updating reading progress:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}