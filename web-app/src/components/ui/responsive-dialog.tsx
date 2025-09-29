import type { ComponentProps, JSX } from "solid-js";
import { createContext, useContext, Show, splitProps } from "solid-js";
import { cn } from "~/lib/utils";
import { useIsMobile } from "~/hooks/use-media-query";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "~/components/ui/dialog";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "~/components/ui/drawer";

// Context for sharing responsive state
const ResponsiveDialogContext = createContext<{
    isMobile: () => boolean;
}>();

// Root component that provides responsive context
interface ResponsiveDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    breakpoint?: number;
    children: JSX.Element;
}

export function ResponsiveDialog(props: ResponsiveDialogProps) {
    const [local, others] = splitProps(props, ["breakpoint", "children"]);
    const isMobile = useIsMobile(local.breakpoint);

    const contextValue = {
        isMobile,
    };

    return (
        <ResponsiveDialogContext.Provider value={contextValue}>
            <Show when={!isMobile()} fallback={<Drawer {...others}>{local.children}</Drawer>}>
                <Dialog {...others}>{local.children}</Dialog>
            </Show>
        </ResponsiveDialogContext.Provider>
    );
}

// Hook to access responsive context
function useResponsiveDialog() {
    const context = useContext(ResponsiveDialogContext);
    if (!context) {
        throw new Error("ResponsiveDialog components must be used within ResponsiveDialog");
    }
    return context;
}

// Trigger component
interface ResponsiveDialogTriggerProps extends ComponentProps<typeof Button> {
    as?: any;
    children: JSX.Element;
}

export function ResponsiveDialogTrigger(props: ResponsiveDialogTriggerProps) {
    const { isMobile } = useResponsiveDialog();
    const [local, others] = splitProps(props, ["as"]);

    return (
        <Show
            when={!isMobile()}
            fallback={
                <DrawerTrigger as={local.as || Button<"button">} {...others}>
                    {props.children}
                </DrawerTrigger>
            }
        >
            <DialogTrigger as={local.as || Button} {...others}>
                {props.children}
            </DialogTrigger>
        </Show>
    );
}

// Content component
interface ResponsiveDialogContentProps {
    class?: string;
    children: JSX.Element;
}

export function ResponsiveDialogContent(props: ResponsiveDialogContentProps) {
    const { isMobile } = useResponsiveDialog();

    return (
        <Show
            when={!isMobile()}
            fallback={<DrawerContent class={cn(props.class)}>{props.children}</DrawerContent>}
        >
            <DialogContent class={cn("sm:max-w-[425px]", props.class)}>
                {props.children}
            </DialogContent>
        </Show>
    );
}

// Header component
interface ResponsiveDialogHeaderProps {
    class?: string;
    children: JSX.Element;
}

export function ResponsiveDialogHeader(props: ResponsiveDialogHeaderProps) {
    const { isMobile } = useResponsiveDialog();

    return (
        <Show
            when={!isMobile()}
            fallback={
                <DrawerHeader class={cn("text-left", props.class)}>{props.children}</DrawerHeader>
            }
        >
            <DialogHeader class={cn(props.class)}>{props.children}</DialogHeader>
        </Show>
    );
}

// Title component
interface ResponsiveDialogTitleProps {
    class?: string;
    children: JSX.Element;
}

export function ResponsiveDialogTitle(props: ResponsiveDialogTitleProps) {
    const { isMobile } = useResponsiveDialog();

    return (
        <Show
            when={!isMobile()}
            fallback={<DrawerTitle class={cn(props.class)}>{props.children}</DrawerTitle>}
        >
            <DialogTitle class={cn(props.class)}>{props.children}</DialogTitle>
        </Show>
    );
}

// Description component
interface ResponsiveDialogDescriptionProps {
    class?: string;
    children: JSX.Element;
}

export function ResponsiveDialogDescription(props: ResponsiveDialogDescriptionProps) {
    const { isMobile } = useResponsiveDialog();

    return (
        <Show
            when={!isMobile()}
            fallback={
                <DrawerDescription class={cn(props.class)}>{props.children}</DrawerDescription>
            }
        >
            <DialogDescription class={cn(props.class)}>{props.children}</DialogDescription>
        </Show>
    );
}

// Body component (for mobile drawer content padding)
interface ResponsiveDialogBodyProps {
    class?: string;
    children: JSX.Element;
}

export function ResponsiveDialogBody(props: ResponsiveDialogBodyProps) {
    const { isMobile } = useResponsiveDialog();

    return (
        <Show
            when={!isMobile()}
            fallback={<div class={cn("px-4", props.class)}>{props.children}</div>}
        >
            <div class={cn(props.class)}>{props.children}</div>
        </Show>
    );
}

// Footer component (only shows on mobile)
interface ResponsiveDialogFooterProps {
    class?: string;
    children: JSX.Element;
}

export function ResponsiveDialogFooter(props: ResponsiveDialogFooterProps) {
    const { isMobile } = useResponsiveDialog();

    return (
        <Show when={isMobile()}>
            <DrawerFooter class={cn("pt-2", props.class)}>{props.children}</DrawerFooter>
        </Show>
    );
}

// Close component (for mobile drawer)
interface ResponsiveDialogCloseProps extends ComponentProps<typeof Button> {
    as?: any;
    children: JSX.Element;
}

export function ResponsiveDialogClose(props: ResponsiveDialogCloseProps) {
    const { isMobile } = useResponsiveDialog();
    const [local, others] = splitProps(props, ["as"]);

    return (
        <Show when={isMobile()}>
            <DrawerClose as={local.as || Button<"button">} {...others}>
                {props.children}
            </DrawerClose>
        </Show>
    );
}
