

export function debounce(func: Function, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return  (...args: any[]) => {
    clearTimeout(timer);
    // @ts-ignore
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

