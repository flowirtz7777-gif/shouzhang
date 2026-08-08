import { ZodError } from "zod";
import type { ImportResult, ImportSummary } from "./importExport";

export type ImportSourceKind = "json" | "zip";

export interface ImportPreview {
  sourceKind: ImportSourceKind;
  projectTitle: string;
  summary: ImportSummary;
  warnings: string[];
  assetFiles: number;
}

export function createImportPreview(
  result: ImportResult,
  sourceKind: ImportSourceKind,
): ImportPreview {
  return {
    sourceKind,
    projectTitle: result.project.title,
    summary: result.summary,
    warnings: [...result.warnings],
    assetFiles: result.assets.size,
  };
}

export function describeImportError(error: unknown): string[] {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => {
      const path = issue.path.map(String).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    });
  }
  if (error instanceof SyntaxError) return [`JSON 格式无效：${error.message}`];
  if (error instanceof Error) return [error.message];
  return ["导入失败，请检查文件内容"];
}
