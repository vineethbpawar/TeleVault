import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decode } from "https://deno.land/std@0.145.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { fileData, fileName, mimeType, botToken, chat_id, endpoint } = await req.json();

    if (!fileData || !fileName || !mimeType || !botToken || !chat_id || !endpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert the Base64 text string back into pure raw binary bytes
    const binaryBuffer = decode(fileData);
    const mediaBlob = new Blob([binaryBuffer], { type: mimeType });

    // Pack cleanly for the Telegram HTTP Endpoint
    const tgPayload = new FormData();
    tgPayload.append('chat_id', chat_id);
    
    // Determine the field name expected by Telegram
    let fieldName = 'document';
    if (endpoint === 'sendPhoto') {
      fieldName = 'photo';
    } else if (endpoint === 'sendVideo') {
      fieldName = 'video';
    }
    
    tgPayload.append(fieldName, mediaBlob, fileName);

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
