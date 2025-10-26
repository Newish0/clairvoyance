import { CalendarIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Label } from "./label";

type DatePickerDropdownProps = {
    date: Date | undefined;
    onDateChange?: (date: Date | undefined) => void;
    label?: React.ReactNode;
    variant?: React.ComponentPropsWithoutRef<typeof Button>["variant"];
};

export function DatePickerDropdown(props: DatePickerDropdownProps) {
    const [open, setOpen] = React.useState(false);
    const [date, setDate] = React.useState<Date | undefined>(props.date);
    const [month, setMonth] = React.useState<Date | undefined>(date);

    React.useEffect(() => {
        setDate(props.date);
        setMonth(props.date);
    }, [props.date]);

    const handleCalendarSelect = (date: Date | undefined) => {
        setDate(date);
        setOpen(false);
        props.onDateChange?.(date);
    };

    return (
        <div className="flex flex-col gap-3">
            {props.label && (
                <Label htmlFor="date-picker-input" className="px-1">
                    {props.label}
                </Label>
            )}
            <div className="relative flex gap-2">
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant={props.variant}
                            id="date-picker-input"
                            className="w-48 justify-between font-normal"
                        >
                            {date ? format(date, "PP") : "Select date"}
                            <CalendarIcon className="size-3.5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-auto overflow-hidden p-0"
                        align="end"
                        alignOffset={-8}
                        sideOffset={10}
                    >
                        <Calendar
                            mode="single"
                            selected={date}
                            captionLayout="dropdown"
                            month={month}
                            onMonthChange={setMonth}
                            onSelect={handleCalendarSelect}
                        />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}
