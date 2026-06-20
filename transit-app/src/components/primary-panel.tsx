import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Drawer } from "vaul";

interface PrimaryPanelProps {
    snapPoints?: (number | string)[];
    children?:
        | React.ReactNode
        | ((snap: string | number | null, snapPoints: (number | string)[]) => React.ReactNode);
}

const PrimaryPanel: React.FC<PrimaryPanelProps> = ({
    snapPoints = ["136px", 0.5, 1],
    children,
}) => {
    const isMobile = useIsMobile();
    const [snap, setSnap] = useState<number | string | null>(snapPoints[1]);

    if (isMobile) {
        return (
            <Drawer.Root
                snapPoints={snapPoints}
                activeSnapPoint={snap}
                setActiveSnapPoint={setSnap}
                modal={false}
                open={true}
                dismissible={false}
            >
                <Drawer.Portal>
                    <Drawer.Content
                        className={cn(
                            "fixed flex flex-col gap-2 rounded-t-xl bottom-0 left-0 right-0 h-full max-h-[97%] p-4 mx-2 bg-primary-foreground/60 backdrop-blur-md ",
                            {
                                "mx-0": snap === snapPoints.at(-1),
                            },
                        )}
                    >
                        <Drawer.Title className="sr-only">Primary Panel</Drawer.Title>

                        {/* Handle */}
                        <div className="bg-primary/20 mx-auto h-1.5 -mt-2 w-25 shrink-0 rounded-full" />

                        {typeof children === "function" ? children(snap, snapPoints) : children}
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        );
    }

    return (
        <div
            className={cn(
                "absolute top-4 left-4 w-sm max-h-[calc(100dvh-2rem)] flex flex-col gap-3 p-4 rounded-xl bg-primary-foreground/60 backdrop-blur-md",
            )}
        >
            {typeof children === "function" ? children(snap, snapPoints) : children}
        </div>
    );
};

export default PrimaryPanel;
