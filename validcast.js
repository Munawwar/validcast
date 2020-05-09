/* eslint-disable max-classes-per-file */
const objectPrototype = Object.getPrototypeOf({});
const isPlainObject = (val) => {
  if (!val || typeof val !== 'object') {
    return false;
  }
  return Object.getPrototypeOf(val) === objectPrototype;
};

class InvalidType extends Error {
  constructor(message = '', props = {}) {
    super(message);
    Object.assign(this, props);
  }

  toJSON() {
    return {
      message: this.message,
      stack: this.stack,
      ...Object.fromEntries(Object.entries(this)),
    };
  }
}
class InvalidSchema extends Error {
  constructor(message, props = {}) {
    super(message);
    Object.assign(this, props);
  }

  toJSON() {
    return {
      message: this.message,
      stack: this.stack,
      ...Object.fromEntries(Object.entries(this)),
    };
  }
}
const noAdditionalPropsSymbol = Symbol('noAdditionalProps');
const noAdditionalProps = { [noAdditionalPropsSymbol]: true };

const isString = () => (val, path) => (typeof val === 'string' ? val : new InvalidType('InvalidType', { path }));
const isNumber = () => (val, path) => ((typeof val === 'number' && !Number.isNaN(val)) ? val : new InvalidType('InvalidType', { path }));
const isBoolean = () => (val, path) => (typeof val === 'string' ? val : new InvalidType('InvalidType', { path }));
// primitive validators
const primitiveChecks = {
  string: isString(),
  number: isNumber(),
  boolean: isBoolean(),
};

// private
const isError = (val) => (
  val === InvalidType
  || val === Error
  || (val instanceof Error)
);

// Core type checker and caster function
function validcast(obj, schema, path = [], parents = []) {
  if (typeof schema === 'string' && primitiveChecks[schema]) {
    // eslint-disable-next-line valid-typeof
    return primitiveChecks[schema](obj, path, parents);
  }

  if (typeof schema === 'function') {
    const val = schema(obj, path, parents);
    if (val instanceof InvalidSchema) {
      return val;
    }
    return isError(val)
      ? new InvalidType('InvalidType', {
        path: val.path || path,
        ...(val.message ? { origError: val.message } : {}),
      })
      : val;
  }

  if (isPlainObject(schema)) {
    if (!isPlainObject(obj)) {
      return new InvalidType('InvalidType', { path });
    }

    const possibleKeyVals = [
      ...Object.keys(obj),
      ...Object.keys(schema).map((key) => key.replace(/\?$/, '')),
    ].reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});
    const results = Object
      .entries(possibleKeyVals)
      .map(([key, val]) => {
        // additional props check
        if (schema[key] === undefined && schema[`${key}?`] === undefined) {
          return [
            key,
            schema[noAdditionalPropsSymbol] ? new InvalidType('InvalidType', { path: [...path, key] }) : val,
          ];
        }
        // optional prop check
        if (schema[`${key}?`] && val === undefined) {
          return [key, val];
        }
        return [
          key,
          validcast(
            val,
            schema[`${key}?`] || schema[key],
            [...path, key],
            [...parents, obj],
          ),
        ];
      });

    const [, error] = results.find(([, val]) => val instanceof Error) || [];
    return error || Object.fromEntries(results);
  }

  if (Array.isArray(schema)) {
    if (!Array.isArray(obj)) {
      return new InvalidType('InvalidType', { path });
    }
    // if schema is empty array [], it means anything can go inside it.
    if (!schema[0]) {
      return obj;
    }
    const results = obj.map(
      (val, key) => validcast(val, schema[0], [...path, key], [...parents, obj]),
    );
    const errorIndex = results.findIndex((val) => val instanceof Error);
    return errorIndex > -1 ? results[errorIndex] : results;
  }
  return new InvalidSchema('InvalidSchema', {
    obj,
    path,
    schema,
  });
}

// ------ non-primitive validators and casters -------
/**
 * usage: const stringOrNumber = either(isString, 'number');
 * Note the functions used by itself (e.g isString(val)) returns InvalidType
 * when validation fails.
 */
const oneOf = (...schemas) => (val, path, parents) => {
  if (!schemas.length) {
    return new InvalidSchema('InvalidSchema', {
      val,
      path,
      schemas,
    });
  }

  for (let i = 0; i < schemas.length; i += 1) {
    const res = validcast(val, schemas[i], path, parents);
    if (!isError(res)) { // FIXME:: hides InvalidSchema error..
      return res;
    }
  }
  return new InvalidType('InvalidType', { path });
};
// alias
const either = oneOf;


/**
 * Check if value is undefined or confirms to schema
 */
const optional = (schema) => (val, ...args) => {
  if (val === undefined) {
    return val;
  }
  return validcast(val, schema, ...args);
};


const defaultCast = (defaultValue) => (val) => {
  if (val === undefined) {
    return defaultValue;
  }
  return val;
};

/**
 * Unlike optional, if type doesn't match schema, then forces to use defaultVal.
 * usage fallback('number', undefined)
 */
const fallback = (schema, defaultValue = undefined) => (val, path, parents) => {
  const res = validcast(val, schema, path, parents);
  if (res instanceof InvalidSchema) {
    return res;
  }
  return isError(res) ? defaultValue : res;
};

/**
 * If value is a number or can be parsed to float/number then returns the parsed number.
 * Else returns defaultVal (undefined by default)
 */
const toFiniteNumber = (defaultValue) => (val) => {
  // Note: Do not use Number() or lodash toNumber..
  // as Number('') and _.toNumber('') is 0! parseFloat('') works correctly
  const num = parseFloat(val);
  return Number.isFinite(num) ? num : defaultValue;
};

/**
 * Value will be wrapped to array if not an array.
 * undefined and NaN are converted to empty array.
 */
const toArray = (schema) => (val, path, parents) => {
  let normalizedVal;
  if (val === undefined || val === null || Number.isNaN(val)) {
    normalizedVal = [];
  } else {
    normalizedVal = Array.isArray(val) ? val : [val];
  }

  if (schema !== undefined && normalizedVal.length) { // empty arrays are always valid
    return validcast(normalizedVal, [schema], path, parents);
  }
  return normalizedVal;
};

/**
 * If val is not a plain object, returns defaultValue (and empty plain object by default)
 * This handles null (as null is an object in JS but not considered a plain object).
 *
 * This is same as doing fallback(_.isPlainObject, defaultVal)..
 * but this one is implemented with lesser code.
 */
const toPlainObject = (defaultValue = {}) => (val) => (isPlainObject(val) ? val : defaultValue);

/**
 * If val is an object then tries to validate against the given schema and returns and error.
 *
 * If val is not a plain object, then tries to validate an empty object against the schema.
 * if that fails returns the error.
 */
const toObject = (schema) => (val, path, parents) => {
  if (!isPlainObject(schema)) {
    return new InvalidSchema('InvalidSchema', {
      val,
      path,
      schema,
    });
  }

  let normalizedVal = val;
  if (!isPlainObject(val)) {
    normalizedVal = {};
  }
  return validcast(normalizedVal, schema, path, parents);
};

// check if items in array is one of schemas
const arrayOneOf = (...schemas) => {
  const castFunction = oneOf(...schemas);
  return (array, path, parents) => {
    if (!schemas.length) {
      return new InvalidSchema('InvalidSchema', {
        array,
        path,
        schemas,
      });
    }

    const vals = array.map((val, index) => castFunction(val, [...path, index], [...parents, val]));
    const errorIndex = vals.findIndex((val) => val instanceof Error);
    return errorIndex > -1 ? vals[errorIndex] : vals;
  };
};

const arrayOrdered = (schemas) => (array, path, parents) => {
  if (!schemas.length) {
    return new InvalidSchema('InvalidSchema', {
      array,
      path,
      schemas,
    });
  }

  const vals = array.map((val, index) => {
    const schema = schemas[index % schemas.length];
    return validcast(val, schema, [...path, index], [...parents, val]);
  });
  const errorIndex = vals.findIndex((val) => val instanceof Error);
  return errorIndex > -1 ? vals[errorIndex] : vals;
};

/**
 * usage: enum(['a', 'b']);
 * Note the functions used by itself (e.g isString(val)) returns InvalidType
 * when validation fails.
 */
const enums = (enumerations) => (val, path) => {
  if (!Array.isArray(enumerations) || !enumerations.length) {
    return new InvalidSchema('InvalidSchema', {
      val,
      path,
      enums: enumerations,
    });
  }
  return (val || []).includes(enumerations) ? val : new InvalidType('InvalidType', { path });
};

// -------  end of validator and casting function ---------

// ------ next implement chaining ------
// TODO: move chaining implenetation out to another file

const allOperators = {
  // all are functions that returns a function.
  isString,
  isNumber,
  isBoolean,
  optional,
  default: defaultCast,
  fallback,
  enums,
  either,
  oneOf,
  arrayOneOf,
  arrayOrdered,
  // all are functions that returns a function.
  toFiniteNumber,
  toArray,
  toPlainObject,
  toObject,
};

const pipe = (...schemas) => (val, path, parents) => {
  if (!schemas.length) {
    return new InvalidSchema('InvalidSchema', {
      val,
      path,
      schemas,
    });
  }

  let lastResult = val;
  for (let i = 0; i < schemas.length; i += 1) {
    lastResult = validcast(lastResult, schemas[i], path, parents);
    if (isError(lastResult)) {
      return lastResult;
    }
  }
  return lastResult;
};

const identity = (val) => val;
const chainable = (funcCreator, prevFunc = identity) => (...args) => {
  const func = funcCreator(...args);
  const pipedFunc = pipe(prevFunc, func);
  return new Proxy(pipedFunc, {
    get(self, prop) {
      if (typeof allOperators[prop] !== 'function') {
        throw new Error(`${prop} is not a validacast registered chainable function`);
      }
      return chainable(allOperators[prop], pipedFunc);
    },
  });
};

Object
  .entries(allOperators)
  .forEach(([key, funcCreator]) => {
    validcast[key] = chainable(funcCreator);
  });

/**
 * Register your own validator/caster as a chainable validcast function.
 * @param {string} functionName
 * @param {function} functionCreator Validator or casting schema function
 */
const registerChainOperator = (functionName, functionCreator) => {
  allOperators[functionName] = functionCreator;
  validcast[functionName] = chainable(functionCreator);
};

// ------ chaining implementation ends here ------

module.exports = {
  validcast,
  InvalidType,
  InvalidSchema,
  noAdditionalProps,
  registerChainOperator,
  validators: {
    // all are functions that returns a function.
    isString,
    isNumber,
    isBoolean,
    fallback,
    enums,
    either,
    oneOf,
    arrayOneOf,
    arrayOrdered,
  },
  cast: {
    // all are functions that returns a function.
    toFiniteNumber,
    toArray,
    toPlainObject,
    toObject,
  },
};
