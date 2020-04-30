# Validate and type cast with single schema

Casting example:

```js
const {
  validcast,
  noAdditionalProps,
  validatorCreators: { fallback },
  cast: {
    toFiniteNumber,
    toObject,
  },
} = require('./validcast');

const product = {
  name: 'Shirt',
  quantity: 1,
};

const result = validcast(product, {
  name: 'string',
  'description?': 'string',
  quantity: toFiniteNumber(0),
  price: toObject({
    amount: toFiniteNumber(0),
    currency: fallback('string', 'USD'),
  }),
  ...noAdditionalProps
});

console.log(JSON.stringify(result, 0, 2));
// output:
// {
//   "name": "Shirt",
//   "quantity": 1,
//   "price": {
//     "amount": 0,
//     "currency": "USD"
//   }
// }
```

Casting and validating example:

```js
const product = {
  name: 'Shirt',
  quantity: 1,
  blah: 'blah',
};

const result = validcast(product, {
  name: 'string',
  'description?': 'string',
  quantity: toFiniteNumber(0),
  price: toObject({
    amount: 'number,
    currency: fallback('string', 'USD'),
  }),
  ...noAdditionalProps
});

// result = InvalidType error object, path ['price', 'amount']

// once you fix that, the next error will be, InvalidType error object, path ['blah'].
```