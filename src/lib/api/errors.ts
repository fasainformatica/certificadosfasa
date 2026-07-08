import { NextResponse } from "next/server";

export function jsonError(message: string, status: number, code = "erro") {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}
