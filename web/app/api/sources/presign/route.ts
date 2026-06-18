import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { presignRequestSchema, type SourceType } from "@chatforge/shared";
import { withTenant } from "@/src/db/client";
import { sources } from "@/src/db/schema";
import { requireTenant } from "@/src/lib/auth";
import { handle } from "@/src/lib/api";
import { assertCanAddSource } from "@/src/lib/limits";
import { buildStorageKey, presignUpload } from "@/src/lib/storage";

const EXT_TO_TYPE: Record<string, SourceType> = {
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
};

// POST /api/sources/presign — create a pending file source + return a presigned PUT URL.
export async function POST(req: NextRequest): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    await assertCanAddSource(tenantId);
    const input = presignRequestSchema.parse(await req.json());

    const ext = input.filename.split(".").pop()?.toLowerCase() ?? "";
    const type = EXT_TO_TYPE[ext];
    if (!type) {
      return NextResponse.json(
        { error: `unsupported file type: .${ext}` },
        { status: 400 },
      );
    }

    const [source] = await withTenant(tenantId, (tx) =>
      tx
        .insert(sources)
        .values({
          tenantId,
          botId: input.botId,
          type,
          uri: input.filename,
          status: "pending",
          bytes: input.bytes,
        })
        .returning(),
    );

    const storageKey = buildStorageKey({
      tenantId,
      botId: input.botId,
      sourceId: source.id,
      filename: input.filename,
    });
    await withTenant(tenantId, (tx) =>
      tx.update(sources).set({ storageKey }).where(eq(sources.id, source.id)),
    );

    const uploadUrl = await presignUpload(storageKey, input.contentType);
    return NextResponse.json({ uploadUrl, storageKey, sourceId: source.id });
  });
}
