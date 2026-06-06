import { err, ok, type Result } from "neverthrow";

export type IngestErrorSeverity = "recoverable" | "fatal";

export type IngestError = {
    severity: IngestErrorSeverity;
    code: string;
    message: string;
    cause?: unknown;
};

export function fatalError(code: string, message: string, cause?: unknown): IngestError {
    return { severity: "fatal", code, message, cause };
}

export function recoverableError(code: string, message: string, cause?: unknown): IngestError {
    return { severity: "recoverable", code, message, cause };
}

export type ItemResult<T> = Result<T, IngestError>;

export function itemOk<T>(value: T): ItemResult<T> {
    return ok(value);
}

export function skipItem(code: string, message: string, cause?: unknown): ItemResult<never> {
    return err(recoverableError(code, message, cause));
}

export function fatalItem(code: string, message: string, cause?: unknown): ItemResult<never> {
    return err(fatalError(code, message, cause));
}
