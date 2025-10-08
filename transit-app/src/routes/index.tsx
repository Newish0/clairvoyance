import { createFileRoute } from "@tanstack/react-router";

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
    component: App,
});

function App() {
    return (
        <div className="text-center">
            <Accordion type="single" collapsible>
                <AccordionItem value="item-1">
                    <AccordionTrigger>Is it accessible?</AccordionTrigger>
                    <AccordionContent>
                        Yes. It adheres to the WAI-ARIA design pattern.
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                    <AccordionTrigger>Is it accessible?</AccordionTrigger>
                    <AccordionContent>
                        Yes. It adheres to the WAI-ARIA design pattern.
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
            <Button>Button</Button>
            {/* <header className="min-h-screen flex flex-col items-center justify-center bg-[#282c34] text-white text-[calc(10px+2vmin)]">
                <img
                    src={logo}
                    className="h-[40vmin] pointer-events-none animate-[spin_20s_linear_infinite]"
                    alt="logo"
                />
                <p>
                    Edit <code>src/routes/index.tsx</code> and save to reload.
                </p>
                <a
                    className="text-[#61dafb] hover:underline"
                    href="https://reactjs.org"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Learn React
                </a>
                <a
                    className="text-[#61dafb] hover:underline"
                    href="https://tanstack.com"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Learn TanStack
                </a>
            </header> */}
        </div>
    );
}
