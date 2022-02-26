import {mount} from "@vue/test-utils";
import {createApp, ref} from "vue";
import {createStore, Store} from "vuex";

import {createSelector, useSelector, useSelectorCreator, useStoreInjectionKey} from "../src/utils";

type TSimpleState = {
    a: number;
    b: number;
};

type TDeepState = {
    data: {
        name?: string;
        codes?: Record<string, number>;
    },
    status?: number;
};

/**
 * Expecting 1 million of calls to take less than 1 second for each of the following:
 * - `createSelector`;
 * - selector call without composition functions;
 *
 * Expecting 100 000 of calls to take less than 1 second for each of the following:
 * - `useSelector`;
 * - `useSelectorCreator`.
 */
const PERF_TEST_TIME = 1e3;
const PERF_TEST_CREATE_SELECTOR_TARGET = 1e6;
const PERF_TEST_SELECTOR_USAGE_TARGET = 1e6;
const PERF_TEST_USE_SELECTOR_TARGET = 1e5;
const PERF_TEST_USE_SELECTOR_CREATOR_TARGET = 1e5;

describe("createSelector", () => {

    test("one dependency, pure selector", () => {
        const getRecord = (state: TDeepState) => state.data;

        const getName = createSelector(
            getRecord,
            data => data.name,
        );

        const states: TDeepState[] = [
            {
                data: {
                    name: "A",
                },
            },
            {
                data: {
                    name: "B",
                },
            },
            {
                data: {
                    name: "C",
                },
            },
        ];

        expect(getName(states[0])).toBe("A");
        expect(getName(states[1])).toBe("B");
        expect(getName(states[2])).toBe("C");
    });

    test("two dependencies, pure and created selector", () => {
        const getData = (state: TDeepState) => state.data;
        const getStatus = (state: TDeepState) => state.status;

        const getCodes = createSelector(
            getData,
            data => data.codes,
        );

        const getCodeA = createSelector(
            getCodes,
            codes => codes.a,
        );

        const getSum = createSelector(
            getStatus,
            getCodeA,
            (status, a) => status + a,
        );

        const states: TDeepState[] = [
            {
                data: {
                    codes: {
                        a: 2,
                    },
                },
                status: 1,
            },
            {
                data: {
                    codes: {
                        a: 5,
                    },
                },
                status: 3,
            },
        ];

        expect(getSum(states[0])).toBe(3);
        expect(getSum(states[1])).toBe(8);
    });

    test("performance test - creating", () => {

        let time = 0;
        const getData = (state: TDeepState) => state.data;
        const start = performance.now();

        for (let i = 0; i < PERF_TEST_CREATE_SELECTOR_TARGET; i++) {
            createSelector(
                getData,
                data => data.codes,
            );
        }

        time = performance.now() - start;
        expect(time).toBeLessThan(PERF_TEST_TIME);
    });

    test("performance test - usage", () => {

        let time = 0;
        const start = performance.now();
        const getData = (state: TDeepState) => state.data;
        const selector = createSelector(
            getData,
            data => data.codes,
        );
        const state = {
            data: {
                codes: {
                    a: 2,
                },
            },
            status: 1,
        };

        for (let i = 0; i < PERF_TEST_SELECTOR_USAGE_TARGET; i++) {
            selector(state);
        }

        time = performance.now() - start;
        expect(time).toBeLessThan(PERF_TEST_TIME);
    });
});

describe("useSelector", () => {

    test("using selector in component, store without injection key", () => {

        const getA = (state: TSimpleState) => state.a;
        const getB = (state: TSimpleState) => state.b;

        const getMultiplication = createSelector(
            getA,
            getB,
            (a, b) => a * b,
        );

        const component = {
            setup () {
                const result = useSelector(getMultiplication);

                return {result};
            },
            template: "{{result}}",
        };

        const store: Store<TSimpleState> = createStore<TSimpleState>({
            state: () => ({
                a: 3,
                b: 3,
            }),
        });

        createApp(component).use(store);

        const wrapper = mount(component, {
            global: {
                plugins: [store],
            },
        });

        expect(wrapper.html()).toContain("9");
    });

    test("using selector in component, store with injection key", () => {

        const STORE_KEY = Symbol();

        const getA = (state: TSimpleState) => state.a;
        const getB = (state: TSimpleState) => state.b;

        const getMultiplication = createSelector(
            getA,
            getB,
            (a, b) => a * b,
        );

        const component = {
            setup () {
                const result = useSelector(getMultiplication);

                return {result};
            },
            template: "{{result}}",
        };

        const store: Store<TSimpleState> = createStore<TSimpleState>({
            state: () => ({
                a: 2,
                b: 2,
            }),
        });

        createApp(component).use(store, STORE_KEY);
        useStoreInjectionKey(STORE_KEY);

        const wrapper = mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });

        expect(wrapper.html()).toContain("4");
    });

    test("performance test", () => {

        const STORE_KEY = Symbol();

        let time = 0;

        const getA = (state: TSimpleState) => state.a;
        const getB = (state: TSimpleState) => state.b;

        const getSum = createSelector(
            getA,
            getB,
            (a, b) => a + b,
        );

        const component = {
            setup () {
                const start = performance.now();

                for (let i = 0; i < PERF_TEST_USE_SELECTOR_TARGET; i++) {
                    useSelector(getSum);
                }

                time = performance.now() - start;

            },
            template: "<div />",
        };

        const store: Store<TSimpleState> = createStore<TSimpleState>({
            state: () => ({
                a: 1,
                b: 2,
            }),
        });

        createApp(component).use(store, STORE_KEY);
        useStoreInjectionKey(STORE_KEY);

        mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });

        expect(time).toBeLessThan(PERF_TEST_TIME);
    });

    test("data mutation attempt inside selector", () => {

        const STORE_KEY = Symbol();

        const getData = (state: TDeepState) => state.data;
        const getCodes = createSelector(
            getData,
            data => {
                data.codes = null;

                return data.codes;
            },
        );

        const component = {
            setup () {
                let result;

                expect(() => {
                    const codes = useSelector(getCodes);

                    result = codes.value;

                }).toThrow("Mutations in selectors are not allowed.");

                return {result};
            },
            template: "{{result}}",
        };

        const store: Store<TDeepState> = createStore<TDeepState>({
            state: () => ({
                data: {
                    codes: {
                        a: 2,
                    },
                },
            }),
        });

        createApp(component).use(store);
        useStoreInjectionKey(STORE_KEY);

        mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });
    });

    test("data mutation outside selector", () => {

        const STORE_KEY = Symbol();

        const getData = (state: TDeepState) => state.data;

        const component = {
            setup () {
                const data = useSelector(getData);

                expect(() => {
                    data.value.codes.a = 3;
                }).not.toThrow("Mutations in selectors are not allowed.");
                expect(data.value.codes.a).toBe(3);
            },
            template: "<div />",
        };

        const store: Store<TDeepState> = createStore<TDeepState>({
            state: () => ({
                data: {
                    codes: {
                        a: 2,
                    },
                },
            }),
        });

        createApp(component).use(store);
        useStoreInjectionKey(STORE_KEY);

        mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });
    });

    test("store mutation usage as setter (passing mutation name as string)", () => {

        const SET_A = "SET_A";
        const STORE_KEY = Symbol();

        const selector = (state: TSimpleState) => state.a;

        const component = {
            setup () {
                const code = useSelector(selector, SET_A, 20);

                code.value = 10;

                expect(code.value).toBe(30);

                return {code};
            },
            template: "{{code}}",
        };

        const store: Store<TSimpleState> = createStore<TSimpleState>({
            state: () => ({
                a: 1,
                b: 2,
            }),
            mutations: {
                [SET_A]: (state: TSimpleState, [b, a]: number[]) => {
                    state.a = a + b;
                },
            },
        });
        const commitSpy = jest.spyOn(store, "commit");

        createApp(component).use(store);
        useStoreInjectionKey(STORE_KEY);

        mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });
        expect(commitSpy).toHaveBeenCalledWith(SET_A, [20, 10]);
    });

    test("store mutation usage as setter (passing mutation function itself)", () => {

        const STORE_KEY = Symbol();

        // mutation
        const setA = (state: TSimpleState, [b, a]: number[]) => {
            state.a = a + b;
        };

        const selector = (state: TSimpleState) => state.a;

        const component = {
            setup () {
                const code = useSelector(selector, setA, 20);

                code.value = 10;

                expect(code.value).toBe(30);

                return {code};
            },
            template: "{{code}}",
        };

        const store: Store<TSimpleState> = createStore<TSimpleState>({
            state: () => ({
                a: 1,
                b: 2,
            }),
            mutations: {
                setA,
            },
        });
        const commitSpy = jest.spyOn(store, "commit");

        createApp(component).use(store);
        useStoreInjectionKey(STORE_KEY);

        mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });
        expect(commitSpy).toHaveBeenCalledWith(setA.name, [20, 10]);
    });

    test("mutation setter calls optimization", () => {

        const SET_A = "SET_A";
        const STORE_KEY = Symbol();

        const selector = (state: TSimpleState) => state.a;

        const component = {
            setup () {
                const code = useSelector(selector, SET_A);

                for (let i = 0; i < 5; i++) {
                    code.value = 10;
                }

                expect(code.value).toBe(10);

                return {code};
            },
            template: "{{code}}",
        };

        const store: Store<TSimpleState> = createStore<TSimpleState>({
            state: () => ({
                a: 1,
                b: 2,
            }),
            mutations: {
                [SET_A]: (state: TSimpleState, a: number) => {
                    state.a = a;
                },
            },
        });
        const commitSpy = jest.spyOn(store, "commit");

        createApp(component).use(store);
        useStoreInjectionKey(STORE_KEY);

        mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });
        expect(commitSpy).toHaveBeenCalledTimes(1);
    });

});

describe("useSelectorCreator", () => {

    test("using selector factory with primitive argument", () => {

        const STORE_KEY = Symbol();

        const getA = (state: TSimpleState) => state.a;
        const getB = (state: TSimpleState) => state.b;

        const createGetMultiplication = (c: number) => createSelector(
            getA,
            getB,
            (a, b) => a * b * c,
        );

        const component = {
            setup () {
                const result = useSelectorCreator(createGetMultiplication, 10);

                return {result};
            },
            template: "{{result}}",
        };

        const store: Store<TSimpleState> = createStore<TSimpleState>({
            state: () => ({
                a: 2,
                b: 2,
            }),
        });

        createApp(component).use(store, STORE_KEY);
        useStoreInjectionKey(STORE_KEY);

        const wrapper = mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });

        expect(wrapper.html()).toContain("40");
    });

    test("using selector factory with object type argument", () => {

        const STORE_KEY = Symbol();

        const getA = (state: TSimpleState) => state.a;
        const getB = (state: TSimpleState) => state.b;

        const createGetMultiplication = ({c, d}: Record<string, number>) => createSelector(
            getA,
            getB,
            (a, b) => a * b * c * d,
        );

        const component = {
            setup () {
                const result = useSelectorCreator(createGetMultiplication, {c: 10, d: 20});

                return {result};
            },
            template: "{{result}}",
        };

        const store: Store<TSimpleState> = createStore<TSimpleState>({
            state: () => ({
                a: 2,
                b: 2,
            }),
        });

        createApp(component).use(store, STORE_KEY);
        useStoreInjectionKey(STORE_KEY);

        const wrapper = mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });

        expect(wrapper.html()).toContain("800");
    });

    test("using selector factory with ref argument", () => {

        const STORE_KEY = Symbol();

        const getA = (state: TSimpleState) => state.a;
        const getB = (state: TSimpleState) => state.b;

        const createGetMultiplication = (c: number) => createSelector(
            getA,
            getB,
            (a, b) => a * b * c,
        );

        const component = {
            setup () {
                const multiplier = ref<number>(10);
                const result = useSelectorCreator(createGetMultiplication, multiplier);

                return {result};
            },
            template: "{{result}}",
        };

        const store: Store<TSimpleState> = createStore<TSimpleState>({
            state: () => ({
                a: 2,
                b: 2,
            }),
        });

        createApp(component).use(store, STORE_KEY);
        useStoreInjectionKey(STORE_KEY);

        const wrapper = mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });

        expect(wrapper.html()).toContain("40");
    });

    test("data mutation outside selector factory", () => {

        const STORE_KEY = Symbol();

        const createGetData = (hasAccess: boolean) => (state: TDeepState) => hasAccess ? state.data : null;

        const component = {
            setup () {
                const data = useSelectorCreator(createGetData, true);

                expect(() => {
                    data.value.codes.a = 3;
                }).not.toThrow("Mutations in selectors are not allowed.");
                expect(data.value.codes.a).toBe(3);
            },
            template: "<div />",
        };

        const store: Store<TDeepState> = createStore<TDeepState>({
            state: () => ({
                data: {
                    codes: {
                        a: 2,
                    },
                },
            }),
        });

        createApp(component).use(store);
        useStoreInjectionKey(STORE_KEY);

        mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });
    });

    test("performance test", () => {

        const STORE_KEY = Symbol();

        let time = 0;

        const getData = (state: TDeepState) => state.data;

        const createGetCodes = (hasAccess: boolean) => createSelector(
            getData,
            data => hasAccess ? data.codes : null,
        );

        const component = {
            setup () {
                const start = performance.now();
                const hasAccess = ref<boolean>(true);

                for (let i = 0; i < PERF_TEST_USE_SELECTOR_CREATOR_TARGET; i++) {
                    useSelectorCreator(createGetCodes, hasAccess);
                }

                time = performance.now() - start;
            },
            template: "<div />",
        };

        const store: Store<TDeepState> = createStore<TDeepState>({
            state: () => ({
                data: {
                    codes: {
                        a: 2,
                    },
                },
            }),
        });

        createApp(component).use(store, STORE_KEY);
        useStoreInjectionKey(STORE_KEY);

        mount(component, {
            global: {
                provide: {
                    [STORE_KEY]: store,
                },
            },
        });

        expect(time).toBeLessThan(PERF_TEST_TIME);
    });

});
