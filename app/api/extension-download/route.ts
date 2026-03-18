import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";

export async function GET() {
  try {
    const extensionDir = path.join(process.cwd(), "extension");
    if (!fs.existsSync(extensionDir)) {
      return NextResponse.json({ error: "Extension not found" }, { status: 404 });
    }

    const zip = new AdmZip();
    const files = fs.readdirSync(extensionDir, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(extensionDir, file.name);
      if (file.isDirectory()) {
        if (file.name === "node_modules" || file.name === ".git") continue;
        zip.addLocalFolder(fullPath, file.name);
      } else {
        zip.addLocalFile(fullPath, undefined, file.name);
      }
    }

    const buffer = zip.toBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="gitvision-extension.zip"',
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("Extension download error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create extension zip" },
      { status: 500 }
    );
  }
}
