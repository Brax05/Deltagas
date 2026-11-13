import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { calculateNetwork } from "@/domain/calculations/network";
import { evaluateRooms } from "@/domain/calculations/rooms";
import { validateDiagram } from "@/domain/diagram/collisions";
import { projectPayloadSchema } from "@/domain/validation/schemas";

/**
 * Valida en el servidor todos los tramos y recintos y genera una versión
 * congelada con fecha y código de integridad SHA-256 (Sección 13.3 y 13.7).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = projectPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos de red o recintos inválidos según validación de servidor.",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const diagram = validateDiagram(parsed.data.segments);
    if (!diagram.valid) {
      return NextResponse.json(
        {
          error: "El trazado de la red tiene cruces o superposiciones.",
          conflicts: diagram.conflicts,
        },
        { status: 422 }
      );
    }

    const network = calculateNetwork({
      gasType: parsed.data.gasType,
      segments: parsed.data.segments,
      appliances: parsed.data.appliances,
    });

    const rooms = evaluateRooms({
      gasType: parsed.data.gasType,
      rooms: parsed.data.rooms,
      appliances: parsed.data.appliances,
    });

    const issuedAt = new Date().toISOString();
    const snapshot = {
      issuedAt,
      disclaimer:
        "DeltaGas — Documento de apoyo al cálculo (DS 66). Sin sellos ni logos SEC. Debe ser revisado y firmado por un instalador autorizado.",
      project: parsed.data,
      calculations: {
        network,
        rooms,
      },
    };

    const integritySha256 = crypto
      .createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex");

    return NextResponse.json({
      issuedAt,
      integritySha256,
      snapshot,
    });
  } catch {
    return NextResponse.json(
      { error: "Error generando la instantánea de memoria de cálculo." },
      { status: 500 }
    );
  }
}
