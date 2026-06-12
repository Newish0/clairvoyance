import { BusFrontIcon } from "lucide-react";

export default function PageLoader() {
    return (
        <div className="h-dvh flex flex-col items-center justify-center gap-4 p-16 text-muted-foreground">
            <div className="relative h-14 w-14">
                <svg className="animate-spin h-14 w-14" viewBox="0 0 56 56" fill="none">
                    <circle
                        cx="28"
                        cy="28"
                        r="24"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeOpacity="0.15"
                    />
                    <path
                        d="M28 4 A24 24 0 0 1 52 28"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <BusFrontIcon className="h-5 w-5 opacity-70" />
                </div>
            </div>
            <span className="text-sm tracking-wide">Loading…</span>
            <div className="flex gap-1.5">
                {[0, 200, 400].map((delay) => (
                    <span
                        key={delay}
                        className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"
                        style={{ animationDelay: `${delay}ms` }}
                    />
                ))}
            </div>
        </div>
    );
}
