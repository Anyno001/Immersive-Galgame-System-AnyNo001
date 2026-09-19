export function createGenerationQueue() {
    const queue = [];

    return {
        enqueue(task) {
            queue.push(task);
            return task;
        },
        dequeue() {
            return queue.shift() || null;
        },
        size() {
            return queue.length;
        },
        clear() {
            queue.length = 0;
        },
    };
}
