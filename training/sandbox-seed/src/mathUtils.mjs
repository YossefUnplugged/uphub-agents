// Tiny pure math module. Baseline ships with ONE deliberate bug (subtract) for task T1.

export function add(a, b) {
    return a + b;
}

// BUG (task T1): returns a + b instead of a - b.
export function subtract(a, b) {
    return a + b;
}
