import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decode } from "https://deno.land/std@0.145.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-file-name, x-mime-type, x-bot-token, x-chat-id, x-target-endpoint',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let fileBlob: Blob;
    let fileName: string;
    let mimeType: string;
    let botToken: string;
    let chat_id: string;
    let endpoint: string;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      fileName = req.headers.get("x-file-name") || "snap.jpg";
      mimeType = req.headers.get("x-mime-type") || "image/jpeg";
      botToken = req.headers.get("x-bot-token") || "";
      chat_id = req.headers.get("x-chat-id") || "";
      endpoint = req.headers.get("x-target-endpoint") || "sendPhoto";

      const formDataParser = await req.formData();
      const rawFile = formDataParser.get('file');
      if (!rawFile) {
        throw new Error("No file found in form data");
      }
      const fileData = rawFile as any;
      fileBlob = new Blob([await fileData.arrayBuffer()], { type: mimeType });
    } else {
      const { fileData, fileName: fn, mimeType: mt, botToken: bt, chat_id: ci, endpoint: ep } = await req.json();
      fileName = fn;
      mimeType = mt;
      botToken = bt;
      chat_id = ci;
      endpoint = ep;

      if (!fileData || !fileName || !mimeType || !botToken || !chat_id || !endpoint) {
        return new Response(
          JSON.stringify({ error: 'Missing required parameters.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const binaryBuffer = decode(fileData);
      fileBlob = new Blob([binaryBuffer], { type: mimeType });
    }

    // Forward the file payload directly to Telegram's backend
    const tgPayload = new FormData();
    tgPayload.append('chat_id', chat_id);
    
    // Determine the field name expected by Telegram
    let fieldName = 'document';
    if (endpoint === 'sendPhoto') {
      fieldName = 'photo';
    } else if (endpoint === 'sendVideo') {
      fieldName = 'video';
    }
    
    tgPayload.append(fieldName, fileBlob, fileName);

    const tgUrl = `https://api.telegram.org/bot${botToken}/${endpoint}`;
    const tgResponse = await fetch(tgUrl, {
      method: 'POST',
      body: tgPayload,
    });

    const tgResult = await tgResponse.json();
    if (!tgResult.ok) {
      throw new Error(tgResult.description || 'Telegram upload failed');
    }

    // 1. Correctly extract the target media payload based on the endpoint structure
    let targetFileId = '';
    if (endpoint === 'sendVideo') {
      targetFileId = tgResult.result.video.file_id;
    } else if (endpoint === 'sendDocument') {
      targetFileId = tgResult.result.document.file_id;
    } else {
      // Photos array contains multiple sizes; grab the highest resolution (last item)
      const photosArray = tgResult.result.photo;
      targetFileId = photosArray[photosArray.length - 1].file_id;
    }

    // 2. Return a standardized layout that your app can read effortlessly
    const customReturnPayload = {
      ok: true,
      file_id: targetFileId,
      message_id: tgResult.result.message_id
    };

    return new Response(JSON.stringify(customReturnPayload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error('Edge Function Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
