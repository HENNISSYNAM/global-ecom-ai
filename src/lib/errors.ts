export type DomainErrorCode = "not_found" | "forbidden" | "conflict" | "invalid";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Maps Postgres errors raised by our SQL functions/policies to domain errors. */
export function fromPgError(err: unknown): DomainError | null {
  const e = err as { code?: string; message?: string };
  if (e.code === "42501") return new DomainError("forbidden", "Không có quyền thực hiện thao tác này");
  if (e.code === "P0002") return new DomainError("not_found", e.message ?? "Không tìm thấy");
  if (e.code === "P0001" && e.message?.startsWith("version_conflict"))
    return new DomainError("conflict", "Bản nháp đã thay đổi; hãy tải lại trước khi xuất bản");
  if (e.code === "23505") return new DomainError("conflict", "Dữ liệu bị trùng");
  if (e.code === "23514" || e.code === "23503" || e.code === "22P02")
    return new DomainError("invalid", e.message ?? "Dữ liệu không hợp lệ");
  return null;
}
