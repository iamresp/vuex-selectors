import {ComputedGetter} from "vue";

import {IMMUTABLE_STATE_PROXY_UNWRAP_KEY} from "./constants";

export type TGetterRegistry<S extends object, T> = Map<TSelector<S, T> | string, ComputedGetter<T>>;

export type TSelectorFactoryRegistry<S extends object, T> = Map<() => TSelector<S, T>, TGetterRegistry<S, T>>;

export type TStoreRegistry = {
    [key: string | symbol]: object;
};

export type TConfiguration = {
    storeKey?: symbol | string;
};

export type TImmutable<T> = T & {
    [IMMUTABLE_STATE_PROXY_UNWRAP_KEY]: T;
};

export type TCreateSelectorArgs<S, I extends TSelector<S>[], C> = [...I, C];

export type TSelector<S, T = unknown> = (state: S) => T;

export type TSelectorResult<S, T extends TSelector<S>> = ReturnType<T>;

export type TSelectorResultList<S, T extends TSelector<S>[]> = {
    [key in keyof T]: T[key] extends TSelector<S> ? TSelectorResult<S, T[key]> : never;
};

