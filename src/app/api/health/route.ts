import { NextResponse } from "next/server";
import { getLocalEnvironmentStatus } from "@/infrastructure/firebase/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const environment = await getLocalEnvironmentStatus();
  return NextResponse.json(
    {
      status: "ok",
      app: "sistema-asignacion-clases",
      environment
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
