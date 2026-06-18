import { Skeleton } from "@/components/ui/skeleton";

export function TripPanelSkeleton() {
    return (
        <div className="flex flex-col gap-3">
            {/* Header row: badge + title + close btn */}
            <div className="flex justify-between">
                <div className="flex items-center gap-2 w-full overflow-hidden">
                    <Skeleton className="h-7 w-16 rounded-md shrink-0" />
                    <div className="space-y-1.5 w-full">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                </div>
                <Skeleton className="h-8 w-8 rounded-md shrink-0" />
            </div>

            {/* Departure cards carousel */}
            <div className="flex gap-2 overflow-hidden">
                {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 w-24 rounded-xl shrink-0" />
                ))}
            </div>

            {/* Alert bar */}
            <Skeleton className="h-8 w-full rounded-lg" />

            {/* Timeline stops */}
            <div className="space-y-3">
                {new Array(24).fill(0).map((_, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                        <Skeleton className="h-4 w-4 rounded-full shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between gap-6">
                                <Skeleton className="h-6 w-full" />
                                <Skeleton className="h-6 w-16" />
                            </div>
                            <Skeleton className="h-3 w-3/4" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
