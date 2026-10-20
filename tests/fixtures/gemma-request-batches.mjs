/** Bound in-flight inference per endpoint while keeping normalization serial. */
export function requestBatches(jobs, endpoints, concurrency) {
    if (!endpoints.length || !Number.isSafeInteger(concurrency) || concurrency < 1) {
        throw new Error('Supply endpoints and a positive integer concurrency per endpoint.');
    }
    const width = endpoints.length * concurrency;
    return Array.from({ length: Math.ceil(jobs.length / width) }, (_, index) =>
        jobs.slice(index * width, (index + 1) * width).map((job, slot) => ({
            ...job, endpoint: endpoints[slot % endpoints.length],
        })));
}
