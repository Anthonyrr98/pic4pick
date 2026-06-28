// Supabase Edge Function: generate short-lived Aliyun OSS signed PUT URLs.
// The browser uploads image bytes directly to OSS, so Supabase does not carry
// image upload egress.

import { corsHeaders } from "../_shared/cors.ts";

type SignRequest = {
  filename?: string;
  contentType?: string;
  thumbnailContentType?: string | null;
};

type SignedPut = {
  objectKey: string;
  uploadUrl: string;
  publicUrl: string;
  headers: Record<string, string>;
  expiresIn: number;
};

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const normalizeRegion = (region: string) => {
  const trimmed = region.trim();
  return trimmed.startsWith("oss-") ? trimmed : `oss-${trimmed}`;
};

const sanitizeFilename = (value?: string) => {
  const raw = (value || `${crypto.randomUUID()}.jpg`).split(/[\\/]/).pop() || "";
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "");
  return safe || `${crypto.randomUUID()}.jpg`;
};

const getBeijingDatePrefix = (date = new Date()) => {
  const beijingOffsetMs = 8 * 60 * 60 * 1000;
  const [year, month, day] = new Date(date.getTime() + beijingOffsetMs)
    .toISOString()
    .slice(0, 10)
    .split("-");
  return `${year}/${month}/${day}`;
};

const hmacSha1Base64 = async (secret: string, message: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

const getOssConfig = () => {
  const region = Deno.env.get("ALIYUN_OSS_REGION");
  const bucket = Deno.env.get("ALIYUN_OSS_BUCKET");
  const accessKeyId = Deno.env.get("ALIYUN_OSS_ACCESS_KEY_ID");
  const accessKeySecret = Deno.env.get("ALIYUN_OSS_ACCESS_KEY_SECRET");

  if (!region || !bucket || !accessKeyId || !accessKeySecret) {
    throw new Error("阿里云 OSS 配置不完整，请检查 Supabase Function Secrets");
  }

  const normalizedRegion = normalizeRegion(region);
  const endpoint =
    Deno.env.get("ALIYUN_OSS_ENDPOINT")?.replace(/\/+$/, "") ||
    `https://${bucket}.${normalizedRegion}.aliyuncs.com`;

  return {
    region: normalizedRegion,
    bucket,
    accessKeyId,
    accessKeySecret,
    endpoint,
  };
};

const buildPublicUrl = (endpoint: string, objectKey: string) =>
  `${endpoint}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;

const signPutUrl = async (
  objectKey: string,
  contentType: string,
  config: ReturnType<typeof getOssConfig>,
): Promise<SignedPut> => {
  const expiresIn = 5 * 60;
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const canonicalizedResource = `/${config.bucket}/${objectKey}`;
  const stringToSign = ["PUT", "", contentType, String(expires), canonicalizedResource].join("\n");
  const signature = await hmacSha1Base64(config.accessKeySecret, stringToSign);
  const publicUrl = buildPublicUrl(config.endpoint, objectKey);
  const uploadUrl =
    `${publicUrl}?OSSAccessKeyId=${encodeURIComponent(config.accessKeyId)}` +
    `&Expires=${expires}` +
    `&Signature=${encodeURIComponent(signature)}`;

  return {
    objectKey,
    uploadUrl,
    publicUrl,
    headers: {
      "Content-Type": contentType,
    },
    expiresIn,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "只支持 POST 请求" }, 405);
  }

  if (Deno.env.get("ENABLE_EDGE_OSS_SIGNING") !== "true") {
    return jsonResponse({
      success: false,
      error: "OSS Edge 签名直传已禁用，请改用受管理员 JWT 保护的后端 /api/upload/oss",
    }, 410);
  }

  try {
    const payload = (await req.json().catch(() => ({}))) as SignRequest;
    const contentType = payload.contentType || "application/octet-stream";
    const thumbnailContentType = payload.thumbnailContentType || null;

    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return jsonResponse({ success: false, error: `不支持的图片类型: ${contentType}` }, 400);
    }
    if (thumbnailContentType && !ALLOWED_IMAGE_TYPES.has(thumbnailContentType)) {
      return jsonResponse({ success: false, error: `不支持的缩略图类型: ${thumbnailContentType}` }, 400);
    }

    const config = getOssConfig();
    const filename = sanitizeFilename(payload.filename);
    const datePrefix = getBeijingDatePrefix();
    const origin = await signPutUrl(`origin/${datePrefix}/${filename}`, contentType, config);
    const thumbnail = thumbnailContentType
      ? await signPutUrl(`ore/${datePrefix}/${filename}`, thumbnailContentType, config)
      : null;

    return jsonResponse({
      success: true,
      mode: "signed-put",
      url: origin.publicUrl,
      thumbnailUrl: thumbnail?.publicUrl || null,
      uploads: {
        origin,
        thumbnail,
      },
    });
  } catch (error) {
    console.error("OSS signed URL error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "生成 OSS 上传签名失败",
    }, 500);
  }
});
