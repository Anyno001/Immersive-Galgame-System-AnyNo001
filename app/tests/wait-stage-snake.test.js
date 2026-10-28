import test from 'node:test';
import assert from 'node:assert/strict';
import { SNAKE_STYLE, createSnakeState, isOpposite, snakeDelay, snakeKeyDir, startSnake, stepSnake } from '../src/visual/igs-ui/wait-stage-snake.js';

const fixed = (value) => () => value;

test('开局三节朝右且有食物', () => {
    const state = createSnakeState(10, 10, fixed(0));
    assert.equal(state.snake.length, 3);
    assert.equal(state.dir, 'right');
    assert.ok(state.food);
    assert.ok(!state.snake.some((cell) => cell.x === state.food.x && cell.y === state.food.y));
});

test('向前移动一格，长度不变', () => {
    const state = createSnakeState(10, 10, fixed(0));
    const next = stepSnake(state, 'right');
    assert.equal(next.snake[0].x, state.snake[0].x + 1);
    assert.equal(next.snake.length, 3);
    assert.equal(state.snake[0].x, next.snake[0].x - 1, '入参不被改动');
});

test('吃到食物变长并加分，食物换位置', () => {
    const state = createSnakeState(10, 10, fixed(0));
    const head = state.snake[0];
    const fed = { ...state, food: { x: head.x + 1, y: head.y } };
    const next = stepSnake(fed, 'right', fixed(0.99));
    assert.equal(next.snake.length, 4);
    assert.equal(next.score, 1);
    assert.ok(next.alive);
    assert.notDeepEqual(next.food, fed.food);
});

test('撞墙判负', () => {
    let state = { ...createSnakeState(6, 6, fixed(0)), food: { x: 0, y: 0 } };
    for (let i = 0; i < 10 && state.alive; i += 1) state = stepSnake(state, 'right');
    assert.equal(state.alive, false);
    assert.equal(stepSnake(state, 'up'), state, '结束后不再移动');
});

test('撞自己判负', () => {
    const snake = [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 2 }, { x: 3, y: 2 }];
    const state = { cols: 10, rows: 10, snake, dir: 'up', food: { x: 9, y: 9 }, score: 0, alive: true, won: false };
    const next = stepSnake(state, 'right');
    assert.equal(next.alive, false);
});

test('可以进入刚离开的尾巴格', () => {
    const snake = [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 3 }];
    const state = { cols: 10, rows: 10, snake, dir: 'up', food: { x: 9, y: 9 }, score: 0, alive: true, won: false };
    const next = stepSnake(state, 'right');
    assert.equal(next.alive, true);
});

test('禁止直接掉头', () => {
    const state = createSnakeState(10, 10, fixed(0));
    assert.ok(isOpposite('right', 'left'));
    const next = stepSnake(state, 'left');
    assert.equal(next.alive, true);
    assert.equal(next.dir, 'right');
    assert.equal(next.snake[0].x, state.snake[0].x + 1);
});

test('速度随长度加快且有下限；按键映射', () => {
    assert.ok(snakeDelay(10) < snakeDelay(3));
    assert.equal(snakeDelay(500), 80);
    assert.equal(snakeKeyDir('ArrowUp'), 'up');
    assert.equal(snakeKeyDir('a'), 'left');
    assert.equal(snakeKeyDir('x'), '');
});

test('样式只用主题变量，没有写死颜色', () => {
    assert.equal(typeof SNAKE_STYLE, 'string');
    assert.ok(SNAKE_STYLE.includes('--igs-bar-ink'));
    assert.ok(!/#[0-9a-f]{6}\b(?!\))/i.test(SNAKE_STYLE.replace(/var\([^)]*\)/g, '')));
});

test('startSnake 缺 ctx 时返回 null', () => {
    assert.equal(startSnake(null), null);
});
