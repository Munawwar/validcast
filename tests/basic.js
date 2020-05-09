const moment = require('moment');
const {
  validcast,
  InvalidType,
  validators: {
    fallback,
    enums,
  },
  cast: {
    toFiniteNumber,
    toArray,
    toObject,
  },
} = require('../validcast');

// test
const testObj = {
  shipmentId: 'K0P458206',
  order_date: '2020-01-01',
  references: ['order-1243', 'shipment-44512'],
  items: [{
    name: 'Shirt',
    quantity: 1,
  }],
  parcels: [{ null: '' }], // won't throw error as per schema
  // parcels: [null], // will throw error as per schema
  additional_properties: {},
};
const momentDate = (val) => (moment(val).isValid() ? moment(val) : InvalidType);

const result = validcast(testObj, {
  shipmentId: 'string',
  order_date: momentDate,
  references: toArray('string'),
  items: toArray({
    name: 'string',
    'description?': 'string',
    quantity: toFiniteNumber(0),
    price: toObject({
      amount: toFiniteNumber(0),
      currency: fallback('string', 'USD'),
    }),
  }),
  parcels: toArray({
    weight: toObject({
      value: toFiniteNumber(undefined),
      unit: fallback(enums(['kg', 'g']), undefined),
    }),
    dimension: toObject({
      width: toFiniteNumber(undefined),
      height: toFiniteNumber(undefined),
      depth: toFiniteNumber(undefined),
      unit: fallback(enums(['cm', 'm']), undefined),
    }),
  }),
});

console.log(JSON.stringify(result, 0, 2));
// InvalidType { message: 'InvalidType', stack, path: [ 'orderDate' ] }

// result = validcast({
//   partner_parcel_reference: undefined,
//   dimension: null,
// }, {
//   partner_parcel_reference: fallback('string', ''),
//   dimension: toObject({
//     width: toFiniteNumber(0),
//     height: toFiniteNumber(0),
//     depth: toFiniteNumber(0),
//   }),
// }),
// console.log(result);
// result:
// {
//   partner_parcel_reference: '',
//   dimension: { width: 0, height: 0, depth: 0 }
// }

// toFiniteNumber(undefined).default(0)
