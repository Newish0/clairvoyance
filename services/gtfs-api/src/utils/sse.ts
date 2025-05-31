export const SSEEvent = ({
    id,
    event,
    data,
}: {
    id: string | number;
    event: string;
    data: string;
}) => {
    return `id: ${id}\nevent: ${event}\ndata: ${data}\n\n`;
};
