import path from "node:path";

export type FileType =
  | "pdf"
  | "doc"
  | "docx"
  | "dwg"
  | "xls"
  | "xlsx"
  | "ppt"
  | "pptx"
  | "zip"
  | "rar"
  | "image"
  | "video"
  | "other";

/**
 * Derive our coarse file-type bucket from a filename's extension.
 */
export function fileTypeFromName(name: string): FileType {
  const ext = path.extname(name).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "pdf";
    case ".doc":
      return "doc";
    case ".docx":
      return "docx";
    case ".dwg":
      return "dwg";
    case ".xls":
      return "xls";
    case ".xlsx":
      return "xlsx";
    case ".ppt":
      return "ppt";
    case ".pptx":
      return "pptx";
    case ".zip":
      return "zip";
    case ".rar":
      return "rar";
    case ".jpg":
    case ".jpeg":
    case ".png":
    case ".gif":
    case ".bmp":
    case ".webp":
      return "image";
    case ".mp4":
    case ".mpeg":
    case ".mov":
    case ".wmv":
    case ".avi":
    case ".mkv":
      return "video";
    default:
      return "other";
  }
}

/**
 * Files a human never asked to see:
 *  - Windows/OneDrive noise (desktop.ini, Thumbs.db)
 *  - AutoCAD temp/lock artifacts (.dwl, .dwl2, .SV$, .SHX)
 *  - Random .log / .db leftovers
 *
 * They are still indexed (isHidden=true) so we have a record, but
 * the explorer/search APIs filter them out.
 */
export function isNoiseFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === "desktop.ini" || lower === "thumbs.db") return true;
  const ext = path.extname(lower);
  return (
    ext === ".dwl" ||
    ext === ".dwl2" ||
    ext === ".sv$" ||
    ext === ".shx" ||
    ext === ".db" ||
    ext === ".ini"
  );
}

/**
 * Archive/backup items that should never be offered as browsable library
 * entries. The 1.1Θ ... .rar at the archive root is the concrete example.
 */
export function isArchiveBackupFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ext === ".rar" || ext === ".7z";
}

/**
 * Files that must be downloaded rather than previewed inline.
 * DWG is the obvious case (no free in-browser renderer).
 */
export function isDownloadOnlyType(fileType: FileType): boolean {
  return (
    fileType === "dwg" ||
    fileType === "zip" ||
    fileType === "rar" ||
    fileType === "other" ||
    fileType === "video"
  );
}

/**
 * MIME mapping for the stream/download route handlers.
 */
export function mimeFromFileType(fileType: FileType): string {
  switch (fileType) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "dwg":
      return "application/acad";
    case "zip":
      return "application/zip";
    case "rar":
      return "application/vnd.rar";
    case "image":
      return "image/*";
    case "video":
      return "video/*";
    default:
      return "application/octet-stream";
  }
}
