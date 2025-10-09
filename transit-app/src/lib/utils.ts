import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function debounce<T extends (...args: any[]) => void>(
    func: T,
    delay = 300
): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout>;

    return (...args: Parameters<T>) => {
        clearTimeout(timer);
        timer = setTimeout(() => func(...args), delay);
    };
}
