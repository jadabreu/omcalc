#!/usr/bin/env -S gjs -m

import {
    evaluateExpression,
    formatResult,
    normalizeCalcErrorMessage,
    MAX_EXPRESSION_LENGTH,
} from '../engine.js';

let failures = 0;

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        failures += 1;
        print(`FAIL: ${label} | expected=${expected} actual=${actual}`);
    } else {
        print(`PASS: ${label}`);
    }
}

function assertThrowsMessage(fn, expectedMessage, label) {
    try {
        fn();
        failures += 1;
        print(`FAIL: ${label} | expected throw: ${expectedMessage}`);
    } catch (error) {
        const actual = normalizeCalcErrorMessage(error);
        if (actual !== expectedMessage) {
            failures += 1;
            print(`FAIL: ${label} | expected=${expectedMessage} actual=${actual}`);
            return;
        }
        print(`PASS: ${label}`);
    }
}

assertEqual(evaluateExpression('2 + 3 * 4'), 14, 'operator precedence');
assertEqual(evaluateExpression('(2 + 3) * 4'), 20, 'parentheses precedence');
assertEqual(evaluateExpression('-5 + 2'), -3, 'unary minus');
assertEqual(evaluateExpression(' 12 / 3 + 1 '), 5, 'whitespace parsing');
assertEqual(formatResult(12.3400000000), '12.34', 'result formatting');
assertEqual(formatResult(-0), '0', 'negative zero formatting');

assertThrowsMessage(() => evaluateExpression('1/0'), 'Division by zero', 'divide by zero');
assertThrowsMessage(() => evaluateExpression('2++*3'), 'Invalid expression', 'invalid token sequence');
assertThrowsMessage(() => evaluateExpression('(2+3'), 'Invalid expression', 'missing closing parenthesis');
const huge = `1${'0'.repeat(200)}`;
assertThrowsMessage(() => evaluateExpression(`${huge}*${huge}`), 'Number overflow', 'non-finite overflow');
const tooLong = '1'.repeat(MAX_EXPRESSION_LENGTH + 1);
assertThrowsMessage(() => evaluateExpression(tooLong), 'Expression too long', 'expression length limit');

if (failures > 0) {
    print(`\n${failures} test(s) failed.`);
    imports.system.exit(1);
}

print('\nAll tests passed.');
