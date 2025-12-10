export function lowerBound(sortedArr, target, lo = 0, hi = sortedArr.length) {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedArr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function scrollChildToCenter(child, container) {
  const parent = child.parentElement;
  if (!parent || !container) return;

  const containerRect = container.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();

  const scrollTop = container.scrollTop;
  const offset = parentRect.top - containerRect.top;
  const centerOffset =
    offset - containerRect.height / 2 + parentRect.height / 2;

  const targetScroll = scrollTop + centerOffset;

  container.scrollTo({
    top: targetScroll,
    behavior: "smooth",
  });
}
