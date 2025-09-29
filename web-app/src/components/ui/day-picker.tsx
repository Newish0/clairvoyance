import { parseDate, useDatePicker, type DateValue } from "@ark-ui/solid";
import { format } from "date-fns";
import { Index, type ComponentProps } from "solid-js";
import { Portal } from "solid-js/web";

import {
    DatePicker,
    DatePickerContent,
    DatePickerContext,
    DatePickerControl,
    DatePickerInput,
    DatePickerNextTrigger,
    DatePickerPositioner,
    DatePickerPrevTrigger,
    DatePickerRangeText,
    DatePickerTable,
    DatePickerTableBody,
    DatePickerTableCell,
    DatePickerTableCellTrigger,
    DatePickerTableHead,
    DatePickerTableHeader,
    DatePickerTableRow,
    DatePickerTrigger,
    DatePickerView,
    DatePickerViewControl,
    DatePickerViewTrigger,
} from "~/components/ui/date-picker";

interface DayPickerProps {
    defaultDate?: Date;
    date?: Date;
    onDateChange?: (date: Date) => void;
    futureOnly?: boolean;
}

export function DayPicker(props: DayPickerProps) {
    const defaultValue = () => props.defaultDate && [parseDate(props.defaultDate)];
    const selectedDate = () => props.date && [parseDate(props.date)];

    const handleDateChange = (date: DateValue) => {
        props.onDateChange?.(date.toDate(Intl.DateTimeFormat().resolvedOptions().timeZone));
    };

    return (
        <DatePicker
            startOfWeek={1}
            format={(e) => {
                const parsedDate = new Date(Date.parse(e.toString()));

                const normalizedDate = new Date(
                    parsedDate.getUTCFullYear(),
                    parsedDate.getUTCMonth(),
                    parsedDate.getUTCDate()
                );

                return format(normalizedDate, "PPP");
            }}
            defaultValue={defaultValue()}
            value={selectedDate()}
            onValueChange={(details) => handleDateChange(details.value[0])}
            min={props.futureOnly ? parseDate(new Date()) : undefined}
            class="w-full"
        >
            <DatePickerControl class="w-full">
                <DatePickerTrigger class="w-full">
                    <DatePickerInput placeholder="mm/dd/yyyy" class="text-center" />
                </DatePickerTrigger>
            </DatePickerControl>
            <DatePickerPositioner>
                <DatePickerContent>
                    <DatePickerView view="day">
                        <DatePickerContext>
                            {(api) => (
                                <>
                                    <DatePickerViewControl>
                                        <DatePickerPrevTrigger />
                                        <DatePickerViewTrigger>
                                            <DatePickerRangeText />
                                        </DatePickerViewTrigger>
                                        <DatePickerNextTrigger />
                                    </DatePickerViewControl>
                                    <DatePickerTable>
                                        <DatePickerTableHead>
                                            <DatePickerTableRow>
                                                <Index each={api().weekDays}>
                                                    {(weekDay) => (
                                                        <DatePickerTableHeader>
                                                            {weekDay().short}
                                                        </DatePickerTableHeader>
                                                    )}
                                                </Index>
                                            </DatePickerTableRow>
                                        </DatePickerTableHead>
                                        <DatePickerTableBody>
                                            <Index each={api().weeks}>
                                                {(week) => (
                                                    <DatePickerTableRow>
                                                        <Index each={week()}>
                                                            {(day) => (
                                                                <DatePickerTableCell value={day()}>
                                                                    <DatePickerTableCellTrigger>
                                                                        {day().day}
                                                                    </DatePickerTableCellTrigger>
                                                                </DatePickerTableCell>
                                                            )}
                                                        </Index>
                                                    </DatePickerTableRow>
                                                )}
                                            </Index>
                                        </DatePickerTableBody>
                                    </DatePickerTable>
                                </>
                            )}
                        </DatePickerContext>
                    </DatePickerView>
                    <DatePickerView view="month">
                        <DatePickerContext>
                            {(api) => (
                                <>
                                    <DatePickerViewControl>
                                        <DatePickerPrevTrigger />
                                        <DatePickerViewTrigger>
                                            <DatePickerRangeText />
                                        </DatePickerViewTrigger>
                                        <DatePickerNextTrigger />
                                    </DatePickerViewControl>
                                    <DatePickerTable>
                                        <DatePickerTableBody>
                                            <Index
                                                each={api().getMonthsGrid({
                                                    columns: 4,
                                                    format: "short",
                                                })}
                                            >
                                                {(months) => (
                                                    <DatePickerTableRow>
                                                        <Index each={months()}>
                                                            {(month) => (
                                                                <DatePickerTableCell
                                                                    value={month().value}
                                                                >
                                                                    <DatePickerTableCellTrigger>
                                                                        {month().label}
                                                                    </DatePickerTableCellTrigger>
                                                                </DatePickerTableCell>
                                                            )}
                                                        </Index>
                                                    </DatePickerTableRow>
                                                )}
                                            </Index>
                                        </DatePickerTableBody>
                                    </DatePickerTable>
                                </>
                            )}
                        </DatePickerContext>
                    </DatePickerView>
                    <DatePickerView view="year">
                        <DatePickerContext>
                            {(api) => (
                                <>
                                    <DatePickerViewControl>
                                        <DatePickerPrevTrigger />
                                        <DatePickerViewTrigger>
                                            <DatePickerRangeText />
                                        </DatePickerViewTrigger>
                                        <DatePickerNextTrigger />
                                    </DatePickerViewControl>
                                    <DatePickerTable>
                                        <DatePickerTableBody>
                                            <Index each={api().getYearsGrid({ columns: 4 })}>
                                                {(years) => (
                                                    <DatePickerTableRow>
                                                        <Index each={years()}>
                                                            {(year) => (
                                                                <DatePickerTableCell
                                                                    value={year().value}
                                                                >
                                                                    <DatePickerTableCellTrigger>
                                                                        {year().label}
                                                                    </DatePickerTableCellTrigger>
                                                                </DatePickerTableCell>
                                                            )}
                                                        </Index>
                                                    </DatePickerTableRow>
                                                )}
                                            </Index>
                                        </DatePickerTableBody>
                                    </DatePickerTable>
                                </>
                            )}
                        </DatePickerContext>
                    </DatePickerView>
                </DatePickerContent>
            </DatePickerPositioner>
        </DatePicker>
    );
}
