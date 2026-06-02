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
