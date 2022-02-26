import {
    computed,
    isRef,
    ComputedRef,
    WritableComputedRef,
    Ref,
} from "vue";
import {Mutation, useStore} from "vuex";

import {
    CONFIGURATION,
    IMMUTABLE_STATE_PROXY_HANDLER,
    IMMUTABLE_STATE_PROXY_UNWRAP_KEY,
    OBJECT_TYPES_TYPEOF_VALUES,
    STORES_REGISTRY_DEFAULT_KEY,
} from "./constants";
import {
    TCreateSelectorArgs,
    TGetterRegistry,
    TImmutable,
    TSelector,
    TSelectorFactoryRegistry,
    TSelectorResultList,
    TStoreRegistry,
} from "./types";

/**
 * Creates selector factory registry that differentiates instances of the same factory basing on each instance
 * arguments to avoid side effects.
 *
 * @returns Registry of all selector factories registered in application.
 */
function createGetSelectorFactoryRegistry () {
    let registry: any;

    return <S extends object, T>(): TSelectorFactoryRegistry<S, T> => {
        if (!registry) {
            registry = new Map();
        }

        return registry as TSelectorFactoryRegistry<S, T>;
    };
}

const getSelectorFactoryRegistry = createGetSelectorFactoryRegistry();

/**
 * Creates registry for caching getters. Helps to avoid creating new getters for same selectors each time
 * when `useSelector` called - since getters created by these functions do not keep data or change behaviour between
 * calls, it is safe to create getter just once for each selector / factory and reuse it.
 *
 * @returns Getters registry with selectors or selector factory arguments as keys and getters as values.
 */
function createGetGetterRegistry () {
    let registry: any;

    return <S extends object, T>(): TGetterRegistry<S, T> => {
        if (!registry) {
            registry = new Map();
        }

        return registry as TGetterRegistry<S, T>;
    };
}

const getGetterRegistry = createGetGetterRegistry();

/**
 * Creates deeply immutable proxy object linked to store state.
 * Returns saved immutable store proxy instance for all further calls.
 *
 * @returns {S} Recursively immutable state that implements TImmutable type.
 */
function createGetImmutableState () {
    const registry: TStoreRegistry = {};

    return <S extends object>(state: S): S => {
        const storeKey = CONFIGURATION.storeKey ?? STORES_REGISTRY_DEFAULT_KEY;

        if (!registry[storeKey]) {
            registry[storeKey] = new Proxy<S>(state, IMMUTABLE_STATE_PROXY_HANDLER);
        }

        return registry[storeKey] as S;
    };
}

const getImmutableState = createGetImmutableState();

/**
 * This type guard only makes sence with selector result in `useSelector` / `useSelectorCreator`.
 * Any object returned by selectors in these composition functions is `Proxy` that implement `TImmutable`.
 *
 * @param {T} value Selector result.
 * @returns {boolean} Is value of any object type - and, due to this, retrieved as immutable.
 */
function checkImmutability<T> (value: T): value is TImmutable<T> {
    return typeof value === "object" && value !== null;
}

/**
 * Specifies store injection key for `useStore` calls. To clear stored key, call this composition function once again
 * with `undefined` as its argument.
 *
 * @param {symbol | string} storeKey Vuex store injection key.
 */
export function useStoreInjectionKey (storeKey: symbol | string) {
    CONFIGURATION.storeKey = storeKey;
}

/**
 * Creates a new selector function - an alternative approach to retrieving data from state of Vuex store.
 * Instead of using store and state directly, selectors are made to be composed with each other. You can specify any
 * amount of input selectors in `createSelector` arguments, receiving their output as arguments for combiner; therefore
 * data used in selectors is atomic, granular and incapsulated.
 * Any data returned by selector is immutable - thus you can not modify any data received from state through input
 * selectors. This guarantees lack of side effects and unregistered mutations.
 * Selectors independent from other selectors and receiving data directly from state / module fields, are
 * called "pure selectors" - you don't need to use this function to create such selectors. Just define plain function
 * that receives state as its argument and returns data from state.
 *
 * @param args Any amount (>= 1) of input selectors and combiner function as last argument - created selector's body.
 * @returns Data from Vuex store state.
 */
export function createSelector<S, I extends TSelector<S>[], C extends (...args: TSelectorResultList<S, I>) => any> (
    ...args: TCreateSelectorArgs<S, I, C>): TSelector<Parameters<I[number]>[number], ReturnType<C>> {
    const combiner = args.pop() as C; // last argument is always C

    return (state: Parameters<I[number]>[number]) => {
        const combinerArgs = [] as TSelectorResultList<S, I>; // while array is empty, casting is required

        // use plain loop instead of .map for applying selectors as it's simply faster
        for (let i = 0; i < args.length; i++) {
            combinerArgs[i] = (args[i] as I[number])(state); // args[i] is already I[number] since C is removed
        }

        // sometimes it's important to return the exact value kept in state and not its proxy
        return combiner.apply(null, combinerArgs) as ReturnType<C>;
    };
}

/**
 * Composition function for applying specified selector in Vue component.
 * Returns `ComputedRef` - exactly like `computed` composition function.
 *
 * @param selector Selector to apply.
 */
export function useSelector<S extends object, T> (selector: TSelector<S, T>): ComputedRef<T>;

/**
 * Composition function for applying specified selector in Vue component.
 * Returns `ComputedRef` - exactly like `computed` composition function.
 *
 * @param selector Selector to apply.
 * @param {string} mutation Name of store mutation that will be commited on setting ref value (computed setter).
 * @param {P} [additionalPayload] Additional data (except the value itself) for mutation.
 */
export function useSelector <S extends object, T, P extends unknown[]> (
    selector: TSelector<S, T>,
    mutation: string | Mutation<S>,
    ...additionalPayload: P
): WritableComputedRef<T>;

export function useSelector <S extends object, T, P extends unknown[]> (
    selector: TSelector<S, T>,
    mutation?: string | Mutation<S>,
    ...additionalPayload: P
): ComputedRef<T> | WritableComputedRef<T> {
    let previousValue: T;

    /**
     * Selectors can be used in the same application either readonly or with mutation setter.
     * Thus, to avoid side effects (e.g. receiving readonly computed getter on `useSelector` call with mutation),
     * cache registries for plain and writable computed refs are separated.
     */
    const getterRegistry = getGetterRegistry<S, T>();
    const store = useStore<S>(CONFIGURATION.storeKey);

    if (!getterRegistry.get(selector)) {
        getterRegistry.set(selector, () => {
            const state = getImmutableState(store.state);
            const selectorResult = selector(state);

            return checkImmutability(selectorResult)
                ? selectorResult?.[IMMUTABLE_STATE_PROXY_UNWRAP_KEY]
                : selectorResult;
        });
    }

    const get = getterRegistry.get(selector);

    if (mutation) {
        const set = (value: T) => {
            if (value === previousValue) return;
            let payload: T | Array<T | P[number]> = value;

            if (additionalPayload.length) {
                // slice + push instead of .unshift or spreading for performance
                // value is always last element in payload
                payload = additionalPayload.slice(0);
                payload.push(value);
            }

            previousValue = value;

            store.commit(typeof mutation === "function" ? mutation.name : mutation, payload);
        };

        return computed({get, set});

    }

    return computed(get);

}

/**
 * Composition function for applying specified selector factory in Vue component.
 * Behaves similar to `useSelector`, but does not support using mutations and accepts selector factory instead of
 * selector - function, that takes any arguments and returns the selector that uses them in some way.
 * It is not recommended to call this function with factories that take some object type arguments (including functions
 * and arrays) except Vue refs. This will prevent selector memoization.
 *
 * @param selectorFactory Function that returns selector.
 * @param {A} [args] Factory arguments to be applied.
 */
export function useSelectorCreator<S extends object, T, A extends unknown[]> (
    selectorFactory: (...args: A) => TSelector<S, T>,
    ...args: (A[number] | Ref<A[number]>)[]
): ComputedRef<T> {
    const factoryRegistry = getSelectorFactoryRegistry<S, T>();
    const store = useStore<S>(CONFIGURATION.storeKey);
    let shouldAlwaysRecompute = false;

    if (args.some(arg => OBJECT_TYPES_TYPEOF_VALUES.includes(typeof arg) && !isRef(arg))) {
        shouldAlwaysRecompute = true;
    }

    const key = shouldAlwaysRecompute ? undefined : args.map(arg => isRef(arg) ? arg.value : arg).toString();

    if (!factoryRegistry.get(selectorFactory)) {
        factoryRegistry.set(selectorFactory, new Map());
    }

    const getterRegistry = factoryRegistry.get(selectorFactory);

    if (shouldAlwaysRecompute || !getterRegistry.get(key)) {
        const get = () => {
            const state = getImmutableState(store.state);
            const argsValues = [] as A;

            // loop instead of .map for performance
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];

                argsValues[i] = isRef(arg) ? arg.value : arg;
            }

            const selector = selectorFactory.apply(null, argsValues);

            const selectorResult = selector(state);

            return checkImmutability(selectorResult)
                ? selectorResult?.[IMMUTABLE_STATE_PROXY_UNWRAP_KEY]
                : selectorResult;
        };

        // for non cacheable selectors we don't need to use registry - just return new ref and not overuse memory
        if (shouldAlwaysRecompute) return computed(get);

        getterRegistry.set(key, get);
    }

    return computed(getterRegistry.get(key));
}
