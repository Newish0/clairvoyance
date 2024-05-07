export const getQueryParams = (param: string) => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
};

export const updateQueryParam = (paramName: string, value: string | null) => {
    const urlParams = new URLSearchParams(window.location.search);
    if (value) {
        urlParams.set(paramName, String(value));
    } else {
        urlParams.delete(paramName);
    }

    const newUrl = `${window.location.pathname}?${urlParams.toString()}`;

    const urlWithoutParams = window.location.origin + window.location.pathname;
    if (newUrl !== window.location.href) {
        const hasOtherParams = Array.from(urlParams).some(([name]) => name !== paramName);
        if (hasOtherParams) {
            window.history.replaceState(null, "", newUrl);
        } else {
            window.history.replaceState(null, "", urlWithoutParams);
        }
    }
};
