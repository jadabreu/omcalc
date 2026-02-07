export const MAX_EXPRESSION_LENGTH = 2048;

export class ExpressionParser {
    constructor(input) {
        this.input = input;
        this.position = 0;
    }

    parse() {
        const value = this.parseExpression();
        this.skipWhitespace();
        if (this.position < this.input.length)
            throw new Error('Unexpected token');
        return value;
    }

    parseExpression() {
        let value = this.parseTerm();

        while (true) {
            this.skipWhitespace();
            const operator = this.peek();

            if (operator !== '+' && operator !== '-')
                return value;

            this.position += 1;
            const right = this.parseTerm();
            value = operator === '+' ? value + right : value - right;
        }
    }

    parseTerm() {
        let value = this.parseUnary();

        while (true) {
            this.skipWhitespace();
            const operator = this.peek();

            if (operator !== '*' && operator !== '/')
                return value;

            this.position += 1;
            const right = this.parseUnary();

            if (operator === '/') {
                if (right === 0)
                    throw new Error('Cannot divide by zero');
                value /= right;
                continue;
            }

            value *= right;
        }
    }

    parseUnary() {
        this.skipWhitespace();
        const current = this.peek();

        if (current === '+') {
            this.position += 1;
            return this.parseUnary();
        }

        if (current === '-') {
            this.position += 1;
            return -this.parseUnary();
        }

        return this.parsePrimary();
    }

    parsePrimary() {
        this.skipWhitespace();
        const current = this.peek();

        if (current === '(') {
            this.position += 1;
            const value = this.parseExpression();
            this.skipWhitespace();

            if (this.peek() !== ')')
                throw new Error('Missing closing parenthesis');

            this.position += 1;
            return value;
        }

        return this.parseNumber();
    }

    parseNumber() {
        this.skipWhitespace();
        const start = this.position;
        let hasDigits = false;
        let hasDot = false;

        while (this.position < this.input.length) {
            const char = this.input[this.position];

            if (char >= '0' && char <= '9') {
                hasDigits = true;
                this.position += 1;
                continue;
            }

            if (char === '.' && !hasDot) {
                hasDot = true;
                this.position += 1;
                continue;
            }

            break;
        }

        if (!hasDigits)
            throw new Error('Expected a number');

        const parsed = Number.parseFloat(this.input.slice(start, this.position));
        if (!Number.isFinite(parsed))
            throw new Error('Invalid number');

        return parsed;
    }

    skipWhitespace() {
        while (this.position < this.input.length && /\s/.test(this.input[this.position]))
            this.position += 1;
    }

    peek() {
        return this.input[this.position] ?? '';
    }
}

export function evaluateExpression(expression) {
    if (typeof expression !== 'string')
        throw new Error('Invalid expression type');

    if (expression.length > MAX_EXPRESSION_LENGTH)
        throw new Error('Expression too long');

    const parser = new ExpressionParser(expression);
    const value = parser.parse();

    if (!Number.isFinite(value))
        throw new Error('Result is not finite');

    return value;
}

export function formatResult(number) {
    if (Object.is(number, -0))
        return '0';

    const absolute = Math.abs(number);
    if (absolute !== 0 && (absolute >= 1e12 || absolute < 1e-10)) {
        return number
            .toExponential(10)
            .replace(/\.0+e/, 'e')
            .replace(/(\.[0-9]*[1-9])0+e/, '$1e');
    }

    return number
        .toFixed(12)
        .replace(/\.0+$/, '')
        .replace(/(\.[0-9]*[1-9])0+$/, '$1');
}

export function normalizeCalcErrorMessage(error) {
    const message = String(error?.message ?? '');
    const lower = message.toLowerCase();

    if (lower.includes('too long'))
        return 'Expression too long';

    if (lower.includes('divide by zero'))
        return 'Division by zero';

    if (lower.includes('not finite') || lower.includes('invalid number'))
        return 'Number overflow';

    return 'Invalid expression';
}
