import { NextResponse } from "next/server";
import { datasheetExtractRequestSchema } from "@/domain/validation/schemas";

/**
 * Lectura de placa / ficha técnica desde el servidor (Sección 12 y 13.4).
 * La clave ANTHROPIC_API_KEY nunca sale del servidor.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = datasheetExtractRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Solicitud inválida o falta consentimiento explícito para envío a IA.",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "El servicio de lectura por visión no está configurado en el servidor (falta ANTHROPIC_API_KEY). Puedes ingresar los datos de la placa manualmente para confirmarlos.",
          code: "VISION_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const model = process.env.VISION_MODEL || "claude-sonnet-4-20250514";
    const base64Data = parsed.data.imageBase64.replace(
      /^data:image\/\w+;base64,/,
      ""
    );

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: parsed.data.mimeType,
                  data: base64Data,
                },
              },
              {
                type: "text",
                text:
                  "Extrae únicamente los datos visibles de esta placa técnica de artefacto a gas en formato JSON estricto con las claves: brand, model, serialNumber, nominalPowerMcalH (número o null), nominalPowerKw (número o null), gasType, readable (boolean). Si falta modelo o potencia legible, indica readable=false. Responde solo JSON.",
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      return NextResponse.json(
        { error: "No se pudo procesar la imagen en el servicio de visión." },
        { status: 502 }
      );
    }

    const result = (await anthropicResponse.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textBlock = result.content?.find((c) => c.type === "text")?.text ?? "{}";
    const jsonMatch = textBlock.match(/\{[\s\S]*\}/);
    const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : { readable: false };

    if (!extracted.readable || (!extracted.model && !extracted.nominalPowerMcalH && !extracted.nominalPowerKw)) {
      return NextResponse.json(
        {
          readable: false,
          message:
            "No se logró leer modelo o potencia nominal de la placa. Toma otra foto más nítida y centrada o completa manualmente.",
          extracted,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      readable: true,
      extracted,
      requiresHumanConfirmation: true,
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno leyendo la ficha técnica." },
      { status: 500 }
    );
  }
}
