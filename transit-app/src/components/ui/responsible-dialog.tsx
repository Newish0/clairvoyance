import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import * as React from "react";

interface ResponsiveModalProps extends React.ComponentPropsWithoutRef<typeof Dialog> {
    children?: React.ReactNode;
}

interface ResponsiveModalTriggerProps extends React.ComponentPropsWithoutRef<typeof DialogTrigger> {
    className?: string;
    children?: React.ReactNode;
}

interface ResponsiveModalCloseProps extends React.ComponentPropsWithoutRef<typeof DrawerClose> {
    className?: string;
    children?: React.ReactNode;
}

interface ResponsiveModalContentProps extends React.ComponentPropsWithoutRef<typeof DialogContent> {
    className?: string;
    children?: React.ReactNode;
}

interface ResponsiveModalHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    children?: React.ReactNode;
}

interface ResponsiveModalFooterProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    children?: React.ReactNode;
}

interface ResponsiveModalTitleProps extends React.ComponentPropsWithoutRef<typeof DialogTitle> {
    className?: string;
    children?: React.ReactNode;
}

interface ResponsiveModalDescriptionProps
    extends React.ComponentPropsWithoutRef<typeof DialogDescription> {
    className?: string;
    children?: React.ReactNode;
}

function ResponsiveModal({ children, ...props }: ResponsiveModalProps) {
    const isMobile = useIsMobile();
    const ResponsiveModalComponent = isMobile ? Drawer : Dialog;

    return <ResponsiveModalComponent {...props}>{children}</ResponsiveModalComponent>;
}

function ResponsiveModalTrigger({ className, ...props }: ResponsiveModalTriggerProps) {
    const isMobile = useIsMobile();
    const ResponsiveModalTriggerComponent = isMobile ? DrawerTrigger : DialogTrigger;

    return <ResponsiveModalTriggerComponent className={className} {...props} />;
}

function ResponsiveModalClose({ className, ...props }: ResponsiveModalCloseProps) {
    const isMobile = useIsMobile();
    const ResponsiveModalCloseComponent = isMobile ? DrawerClose : DialogClose;

    return <ResponsiveModalCloseComponent className={className} {...props} />;
}

function ResponsiveModalContent({ className, children, ...props }: ResponsiveModalContentProps) {
    const isMobile = useIsMobile();
    const ResponsiveModalContentComponent = isMobile ? DrawerContent : DialogContent;

    return (
        <ResponsiveModalContentComponent className={className} {...props}>
            {children}
        </ResponsiveModalContentComponent>
    );
}

function ResponsiveModalHeader({ className, ...props }: ResponsiveModalHeaderProps) {
    const isMobile = useIsMobile();
    const ResponsiveModalHeaderComponent = isMobile ? DrawerHeader : DialogHeader;

    return <ResponsiveModalHeaderComponent className={className} {...props} />;
}

function ResponsiveModalFooter({ className, ...props }: ResponsiveModalFooterProps) {
    const isMobile = useIsMobile();
    const ResponsiveModalFooterComponent = isMobile ? DrawerFooter : DialogFooter;

    return <ResponsiveModalFooterComponent className={className} {...props} />;
}

function ResponsiveModalTitle({ className, ...props }: ResponsiveModalTitleProps) {
    const isMobile = useIsMobile();
    const ResponsiveModalTitleComponent = isMobile ? DrawerTitle : DialogTitle;

    return <ResponsiveModalTitleComponent className={className} {...props} />;
}

function ResponsiveModalDescription({ className, ...props }: ResponsiveModalDescriptionProps) {
    const isMobile = useIsMobile();
    const ResponsiveModalDescriptionComponent = isMobile ? DrawerDescription : DialogDescription;

    return <ResponsiveModalDescriptionComponent className={className} {...props} />;
}

export {
    ResponsiveModal,
    ResponsiveModalClose,
    ResponsiveModalContent,
    ResponsiveModalDescription,
    ResponsiveModalFooter,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
};
