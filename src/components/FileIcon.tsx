import type { FileType } from "@/lib/fileTypes";
import clsx from "clsx";

type Variant = FileType | "folder";

const palette: Record<Variant, { bg: string; fg: string; label: string }> = {
  folder: { bg: "bg-cyan-accent/10", fg: "text-cyan-accent", label: "FOL" },
  pdf:    { bg: "bg-red-500/10",      fg: "text-red-600",   label: "PDF" },
  doc:    { bg: "bg-blue-500/10",     fg: "text-blue-600",  label: "DOC" },
  docx:   { bg: "bg-blue-500/10",     fg: "text-blue-600",  label: "DOC" },
  xls:    { bg: "bg-emerald-500/10",  fg: "text-emerald-600", label: "XLS" },
  xlsx:   { bg: "bg-emerald-500/10",  fg: "text-emerald-600", label: "XLS" },
  ppt:    { bg: "bg-orange-500/10",   fg: "text-orange-600", label: "PPT" },
  pptx:   { bg: "bg-orange-500/10",   fg: "text-orange-600", label: "PPT" },
  dwg:    { bg: "bg-indigo-500/10",   fg: "text-indigo-600", label: "DWG" },
  zip:    { bg: "bg-amber-500/10",    fg: "text-amber-700",  label: "ZIP" },
  rar:    { bg: "bg-amber-500/10",    fg: "text-amber-700",  label: "RAR" },
  image:  { bg: "bg-fuchsia-500/10",  fg: "text-fuchsia-600", label: "IMG" },
  video:  { bg: "bg-purple-500/10",   fg: "text-purple-600", label: "VID" },
  other:  { bg: "bg-steel-200/70",    fg: "text-steel-600",  label: "FILE" },
};

export default function FileIcon({
  variant,
  size = 40,
  className,
}: {
  variant: Variant;
  size?: number;
  className?: string;
}) {
  const conf = palette[variant] ?? palette.other;
  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-xl font-semibold",
        conf.bg,
        conf.fg,
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.28 }}
      aria-hidden
    >
      {conf.label}
    </div>
  );
}
