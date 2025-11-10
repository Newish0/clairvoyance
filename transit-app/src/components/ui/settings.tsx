import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// Setting type definitions for maximum flexibility
export type SettingType = "switch" | "input" | "select" | "slider" | "textarea" | "custom";

export interface BaseSetting {
    id: string;
    label: string;
    description?: string;
    type: SettingType;
}

export interface SwitchSetting extends BaseSetting {
    type: "switch";
    value: boolean;
    onChange: (value: boolean) => void;
}

export interface InputSetting extends BaseSetting {
    type: "input";
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    inputType?: "text" | "email" | "password" | "number" | "url";
}

export interface SelectSetting extends BaseSetting {
    type: "select";
    value: string;
    onChange: (value: string) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
}

export interface SliderSetting extends BaseSetting {
    type: "slider";
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    showValue?: boolean;
}

export interface TextareaSetting extends BaseSetting {
    type: "textarea";
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
}

export interface CustomSetting extends BaseSetting {
    type: "custom";
    render: () => ReactNode;
}

export type Setting =
    | SwitchSetting
    | InputSetting
    | SelectSetting
    | SliderSetting
    | TextareaSetting
    | CustomSetting;

export interface SettingSection {
    title: string;
    description?: string;
    settings: Setting[];
}

export interface SettingsProps {
    sections: SettingSection[];
    className?: string;
    variant?: "default" | "compact";
}

function SettingItem({
    setting,
    variant = "default",
}: {
    setting: Setting;
    variant?: "default" | "compact";
}) {
    const renderControl = () => {
        switch (setting.type) {
            case "switch":
                return (
                    <Switch
                        id={setting.id}
                        checked={setting.value}
                        onCheckedChange={setting.onChange}
                    />
                );

            case "input":
                return (
                    <Input
                        id={setting.id}
                        type={setting.inputType || "text"}
                        value={setting.value}
                        onChange={(e) => setting.onChange(e.target.value)}
                        placeholder={setting.placeholder}
                        className="max-w-md"
                    />
                );

            case "select":
                return (
                    <Select value={setting.value} onValueChange={setting.onChange}>
                        <SelectTrigger id={setting.id} className="max-w-md">
                            <SelectValue placeholder={setting.placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                            {setting.options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                );

            case "slider":
                return (
                    <div className="flex items-center gap-4 max-w-md">
                        <Slider
                            id={setting.id}
                            value={[setting.value]}
                            onValueChange={(values) => setting.onChange(values[0])}
                            min={setting.min}
                            max={setting.max}
                            step={setting.step || 1}
                            className="flex-1"
                        />
                        {setting.showValue && (
                            <span className="text-sm text-muted-foreground w-12 text-right">
                                {setting.value}
                            </span>
                        )}
                    </div>
                );

            case "textarea":
                return (
                    <Textarea
                        id={setting.id}
                        value={setting.value}
                        onChange={(e) => setting.onChange(e.target.value)}
                        placeholder={setting.placeholder}
                        rows={setting.rows || 4}
                        className="max-w-2xl"
                    />
                );

            case "custom":
                return setting.render();

            default:
                return null;
        }
    };

    const isInlineControl = setting.type === "switch";
    const isFullWidth = setting.type === "textarea" || setting.type === "custom";

    if (variant === "compact") {
        return (
            <div className="flex flex-col gap-2 py-3">
                <div
                    className={cn(
                        "flex items-start justify-between gap-4",
                        isInlineControl && "items-center"
                    )}
                >
                    <div className="flex-1 space-y-1">
                        <Label htmlFor={setting.id} className="text-sm font-medium">
                            {setting.label}
                        </Label>
                        {setting.description && (
                            <p className="text-sm text-muted-foreground">{setting.description}</p>
                        )}
                    </div>
                    {isInlineControl && <div className="flex-shrink-0">{renderControl()}</div>}
                </div>
                {!isInlineControl && <div className="mt-2">{renderControl()}</div>}
            </div>
        );
    }

    return (
        <div
            className={cn(
                "grid gap-3 py-4",
                isFullWidth ? "grid-cols-1" : "md:grid-cols-2 grid-cols-1"
            )}
        >
            <div className="space-y-1">
                <Label htmlFor={setting.id} className="text-sm font-medium">
                    {setting.label}
                </Label>
                {setting.description && (
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                )}
            </div>
            <div className={cn("md:col-span-2", isInlineControl && "flex items-center")}>
                {renderControl()}
            </div>
        </div>
    );
}

export function Settings({ sections, className, variant = "default" }: SettingsProps) {
    return (
        <div className={cn("space-y-6", className)}>
            {sections.map((section, sectionIndex) => (
                <Card key={sectionIndex}>
                    <CardHeader>
                        <CardTitle>{section.title}</CardTitle>
                        {section.description && (
                            <CardDescription>{section.description}</CardDescription>
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className="divide-y">
                            {section.settings.map((setting, settingIndex) => (
                                <SettingItem key={setting.id} setting={setting} variant={variant} />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
