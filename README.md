# vuex-selectors

Selectors library like [Reselect](https://github.com/reduxjs/reselect/), but for [Vuex](https://github.com/vuejs/vuex).

[![Coveralls][coveralls-badge]][coveralls]

## Installation

vuex-selectors is delivered as a standalone library. Use `npm` or `yarn` to install:

```bash
npm i vuex-selectors
```
or
```bash
yarn add vuex-selectors
```

## Creating selectors

Technically all selectors are functions that take state as an argument and return data from it (like native Vuex getters). If you need to take some data from state direct property, you need just define the respecitve function without using library API.

```typescript
export const selectCar = (state: TState): TCar => state.car;
```

Similarly to Reselect, `vuex-selectors` exports `createSelector` function for creating selectors. Selectors created with this function use other selectors as an input, thus operating not the whole state, but exact granular data retrieved by their input selectors.
`createSelectors` takes any amount of arguments. The last argument is always a *combiner function* that takes the exact amount of agruments as an amount of given input selectors. Arguments of combiner function are return values of input selectors, passed always in the same order as input selectors.

```typescript
export const selectCustomer = (state: TState) => state.customer;

export const selectCar = (state: TState) => state.car;

export const getCustomerName = createSelector(
    selectCustomer,
    // typing combiner function for better explanation
    // you don't particularly need to type it manually because createSelector will provide strong correct types 
    (customer: TCustomer): string => customer.name;
);

export const getCustomerJobTitle = createSelector(
    selectCustomer,
    (customer: TCustomer): string => customer.jobTitle;
);

export const getCarModel = createSelector(
    selectCar,
    (car: TCar): string => car.model;
);

export const getCarType = createSelector(
    selectCar,
    (car: TCar): string => car.type;
);

export const selectCustomerCar = createSelector(
    selectCustomerJobTitle,
    selectCustomerName,
    selectCarModel,
    selectCarType,
    (
        jobTitle: string,
        name: string,
        model: string,
        carType: string,
    ): string => `${jobTitle} ${name} drives ${model} ${type}`;
);
```

## Using selectors

There are two functions provided by `vuex-selectors` for applying selectors in Vue components: `useSelector` and `useSelectorCreator`.

First one is meant to work directly with selectors, either created with `createSelector` or defined as functions without this API ("pure selectors"):

```typescript
setup () {
    const customerCar = useSelector(selectCustomerCar);
    // ...
}
```

`useSelector` returns Vue's native `ComputedRef`, exactly as `computed` function. And, similarly to `computed`, `useSelector` can create `WritableComputedRef` — using existing mutation as setter (this will likely change in some next major version compatible with Vuex 5 because of further mutations removal).

```typescript
// mutations

export const mutations: MutationTree<IDocsState> = {
    [SET_CUSTOMER_NAME]: (state: TState, payload: string) => {
        state.customer.name = payload;
    },
};

// store module

import {mutations} from "./mutations";

export const customers: Module<ICustomersState, TState> = {
    namespaced: true,
    state: () => ({
        customer: null,
    }),
    mutations,
};

// component
setup () {
    const customerName = useSelector(
        selectCustomerName,
        `${CUSTOMERS_MODULE}/${SET_CUSTOMER_NAME}`, // mutation name is a constant
    );
    // ...
}
```

If your project defines mutations as export functions, the whole mutations file is imported as namespace to use as mutation tree, you can pass not the mutation name, but the mutation function itself:

```typescript
// mutations

export const setCustomerName = (state: TState, payload: string) => {
    state.customer.name = payload;
}

// store module

import * as mutations from "./mutations";

export const customers: Module<ICustomersState, TState> = {
    namespaced: true,
    state: () => ({
        customer: null,
    }),
    mutations,
    actions,
};

// component
setup () {
    const customerName = useSelector(
        selectCustomerName,
        setCustomerName, // mutation name is taken from mutation function itself
    );
    // ...
}
```

All arguments of `useSelector` after mutation / mutation name will be passed to mutation as payload. In this case mutation will receive an array as a payload — its last element will be a new value passed to computed setter function, all other elements are rest arguments of `useSelector`:

```typescript
// mutations

export const setCustomerName = (state: TState, [jobTitle, value]: string[]) => {
    state.customer.name = `${jobTitle} ${value}`;
}

// component
setup () {
    const customerName = useSelector(
        selectCustomerName,
        setCustomerName, // mutation name is taken from mutation function itself
        "Programmer", // will be passed as the first element in a mutation payload
    );
    // ...
}
```

For optimization purposes, mutation will not be commited if new value passed in setter is shallowly equal to previous:

```typescript
setup () {
    const customerName = useSelector(
        selectCustomerName,
        setCustomerName, // mutation name is taken from mutation function itself
    );

    customerName.value = "John"; // will commit mutation
    customerName.value = "John"; // will NOT commit mutation again
    // ...
}
```

Another option for using selectors in components is `useSelectorCreator`. It is meant to be used with selector factories — higher order functions that take any arguments and return selectors. On call, it applies given selector factory with passed arguments and then instantly applies returned selector.

```typescript
// file with selectors
export const selectCustomers = (state: TState) => state.customers;
export const createSelectCustomer = (customerId: string) => createSelector(
    selectCustomers,
    (customers) => customers.find(({id}) => customerId === id),
);

// component
setup () {
    const customer = useSelectorCreator(createSelectCustomer, "100032");
    // ...
}
```

All `useSelectorCreator` arguments after the first one (selector factory to be used) are factory arguments to be passed on factory call.

Like `useSelector`, `useSelectorCreator` provides memoization. Results of each factory for every list of arguments are being memoized — but only if all arguments in list are either primitives or Vue refs of primitives.

```typescript

setup () {
    const someRef = ref<boolean>(true);
    const handleSomething = (event: Event) => {
        doSomething();
    }
    const firstData = useSelectorCreator(selectorFactory, 1, true, "not"); // will be memoized
    const secondData = useSelectorCreator(selectorFactory, someRef); // will be memoized (with current ref value)
    const secondData = useSelectorCreator(selectorFactory, handleSomething); // will NOT be memoized
    const secondData = useSelectorCreator(selectorFactory, [1, 2, 3]); // will NOT be memoized
    const secondData = useSelectorCreator(selectorFactory, {a: 5}); // will NOT be memoized
    // ...
}
```

## Immutability

One more thing implemented by `vuex-selectors` API is a deeply immutable state.

Since memoization provided by `useSelector` and `useSelectorCreator` implies that selectors are pure functions, state instance provided by it is deeply immutable. Any attempt to perform state mutations in selector function will immediately throw an error.

This guarantees correct memoization for all selectors and selector factories. Thus, all mutations of data retrieved by selectors must be done only using mutations as computed setters — exactly as Vuex requires.

## Injection keys

For work with stores that use injection keys `vuex-selectors` provides `useStoreInjectionKey` API. Calling this composition function with store's inject key as an argument makes further API calls use that exact store that is used under this key.

Passing `undefined` as an argument clears key configuration, making API calls use store used without key if present.

```typescript
setup () {
    useStoreInjectionKey(CUSTOMERS_STORE_KEY);
    const customerCar = useSelector(selectCustomerCar);
    // ...
}
```

## Why?

When using Redux, we have one great thing among others — the `useSelector` hook. With Reselect added to back it, we getting a really useful toolkit for extracting data from store state.

That's cool and whatsoever, but in Vuex we've got getters straight out of the box and they work roughly the same way, so we don't actually need such things. Or, at least, we *didn't need* them before?

Vue 3 have arrived some time ago, having Vuex 4 alongside. A lot of stuff changed, many old good ways to do things are work slightly different now.

Having stuff like mapping geters in modern Vue components that are using composition API now seems really old fashioned.

But we really can go without it using new API and its `computed`:

```typescript
import {computed, defineComponent} from "vue";
import {useStore} from "vuex";

import {TState} from "../models";
import {USER_LIST} from "../store";

export default defineComponent({
    name: "UserList",
    setup () {
        const store = useStore<TState>();
        const userList = computed(() => store.getters[USER_LIST]);

        return {userList}
    }
})
```
And it's where `computed` starts to look exactly like `useSelector`.

But this approach still have some problems:

- Either you create a new getter function for computed every time you need to call some Vuex getter or data from state, or keep such getters — simple wrappers — in one place (but you already have getter declared in store or module, so by doing this, you keep two entities for one method; and I don't event ask about how exactly you going to pass store instance to this getter);
- You always have a full state in every your getter, so it's easy to lose granularity — especially when you work with complex objects kept in store — and write a "simple" getter that does a good million of things;
- Freedom is a cool thing, but definitely not when it comes to side effects like mutations without `commit` in function that is meant to read but not write.

You probably can add even more things to mention. But, that's a readme, and this section is called "Why?" So, taking all of the above into account, what this library does?

- Makes your components more declarative, removing even such small imperative logic piece as creating a computed getter like `computed(() => store.state.data);`
- Provides a really compositive API for selecting data from store state — selectors are not meant to take everything from state no matter how deep desired data lies — instead, it's about using a composition when selectors can use other selectors to take the data from;
- Wraps native `computed` composition function to more store-specific high level API and adds memoization that helps to avoid creating and using the very same things more than needed;
- Selectors operate deeply immutable store which strictly prohibits any mutations — selectors are meant to receive data, but not modify it;
- Similar to native `computed` function, allows to specify a computed setter for the data that selector receives — nothing else but mutation through `commit`;
- Makes your work with store really granular: selectors can either use state or other selectors as source of truth, but not both at the same time; thus, you can clearly see the dependencies of every selector;
- Allow you to pass arguments to your selectors by implementing factory pattern with higher order functions that return selectos — with memoization, too;
- Provides strong and transparent Typescript typings.

See anything you might need in your work? Well then, you welcome!