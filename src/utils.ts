const scrollToBottom = async (el: SVGElement | HTMLElement) => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < el.scrollHeight; i += 100) {
    el.scrollTo(0, i);
    await delay(100);
  }
};

export { scrollToBottom };
