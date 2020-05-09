const { validcast } = require('../validcast');

// test chaining
const value = undefined;
console.log(validcast.optional('string').default('56')(value));
