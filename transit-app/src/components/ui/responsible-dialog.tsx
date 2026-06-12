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

const ResponsiveModalContext = React.createContext<boolean>(false);

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

    return (
        <ResponsiveModalContext.Provider value={isMobile}>
            <ResponsiveModalComponent {...props}>{children}</ResponsiveModalComponent>
        </ResponsiveModalContext.Provider>
    );
}

function ResponsiveModalTrigger({ className, ...props }: ResponsiveModalTriggerProps) {
    const isMobile = React.useContext(ResponsiveModalContext);
    const ResponsiveModalTriggerComponent = isMobile ? DrawerTrigger : DialogTrigger;

    return <ResponsiveModalTriggerComponent className={className} {...props} />;
}

function ResponsiveModalClose({ className, ...props }: ResponsiveModalCloseProps) {
    const isMobile = React.useContext(ResponsiveModalContext);
    const ResponsiveModalCloseComponent = isMobile ? DrawerClose : DialogClose;

    return <ResponsiveModalCloseComponent className={className} {...props} />;
}

function ResponsiveModalContent({ className, children, ...props }: ResponsiveModalContentProps) {
    const isMobile = React.useContext(ResponsiveModalContext);
    const ResponsiveModalContentComponent = isMobile ? DrawerContent : DialogContent;

    return (
        <ResponsiveModalContentComponent className={className} {...props}>
            {children}
        </ResponsiveModalContentComponent>
    );
}

function ResponsiveModalHeader({ className, ...props }: ResponsiveModalHeaderProps) {
    const isMobile = React.useContext(ResponsiveModalContext);
    const ResponsiveModalHeaderComponent = isMobile ? DrawerHeader : DialogHeader;

    return <ResponsiveModalHeaderComponent className={className} {...props} />;
}

function ResponsiveModalFooter({ className, ...props }: ResponsiveModalFooterProps) {
    const isMobile = React.useContext(ResponsiveModalContext);
    const ResponsiveModalFooterComponent = isMobile ? DrawerFooter : DialogFooter;

    return <ResponsiveModalFooterComponent className={className} {...props} />;
}

function ResponsiveModalTitle({ className, ...props }: ResponsiveModalTitleProps) {
    const isMobile = React.useContext(ResponsiveModalContext);
    const ResponsiveModalTitleComponent = isMobile ? DrawerTitle : DialogTitle;

    return <ResponsiveModalTitleComponent className={className} {...props} />;
}

function ResponsiveModalDescription({ className, ...props }: ResponsiveModalDescriptionProps) {
    const isMobile = React.useContext(ResponsiveModalContext);
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
