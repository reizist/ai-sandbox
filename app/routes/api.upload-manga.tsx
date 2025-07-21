import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { processAndStoreZipFileToS3 } from "~/utils/s3ZipUpload.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return json({ error: "ファイルが選択されていません" }, { status: 400 });
    }
    
    if (!file.name.toLowerCase().endsWith('.zip')) {
      return json({ error: "ZIPファイルを選択してください" }, { status: 400 });
    }
    
    // ファイルサイズチェック (100MB制限)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      return json({ error: "ファイルサイズが大きすぎます (100MB以下)" }, { status: 400 });
    }
    
    console.log(`Uploading manga file: ${file.name} (${file.size} bytes)`);
    
    // S3設定の確認
    if (!process.env.S3_BUCKET_NAME || !process.env.AWS_ACCESS_KEY_ID) {
      return json({ error: "S3設定が必要です。環境変数を確認してください。" }, { status: 400 });
    }
    
    // ZIPファイルを直接S3にアップロード
    const result = await processAndStoreZipFileToS3(file);
    
    if (!result.success) {
      return json({ error: result.error }, { status: 400 });
    }
    
    return json({
      success: true,
      message: "漫画のアップロードが完了しました",
      collectionId: result.collectionId
    });
    
  } catch (error) {
    console.error("Upload error:", error);
    return json(
      { error: "アップロード中にエラーが発生しました" }, 
      { status: 500 }
    );
  }
}