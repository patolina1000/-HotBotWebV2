const Joi = require('joi');
require('dotenv').config();

const schema = Joi.object({
  APP_ENV: Joi.string().valid('development', 'staging', 'production').required(),
  DATABASE_URL: Joi.string().uri().required(),
  DB_EXPECTED_ENV: Joi.string().optional(),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').required(),
  DB_POOL_MIN: Joi.number().integer().min(0).required(),
  DB_POOL_MAX: Joi.number().integer().min(Joi.ref('DB_POOL_MIN')).required(),
  DB_CONN_TIMEOUT_MS: Joi.number().integer().positive().required(),
  ALLOW_PROD_ON_NONPROD: Joi.string().valid('true').optional()
}).unknown(true);

const { value: env, error } = schema.validate(process.env, { abortEarly: false });

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const url = env.DATABASE_URL;
const lowerUrl = url.toLowerCase();

if (env.APP_ENV === 'production') {
  if (/(sandbox|staging|localhost|_dev|_stg)/.test(lowerUrl)) {
    throw new Error('APP_ENV is production but DATABASE_URL points to non-production database');
  }
} else {
  if (/(prod|production)/.test(lowerUrl) && env.ALLOW_PROD_ON_NONPROD !== 'true') {
    throw new Error('Non-production APP_ENV with production database URL');
  }
}

if (env.DB_EXPECTED_ENV && env.DB_EXPECTED_ENV.trim() !== '' && !env.DATABASE_URL.includes(env.DB_EXPECTED_ENV)) {
  throw new Error(`DATABASE_URL does not contain expected environment marker '${env.DB_EXPECTED_ENV}'`);
}

const parsedUrl = new URL(url);
const dbHost = parsedUrl.hostname;
const dbName = parsedUrl.pathname.replace(/^\//, '');

console.log(`[CONFIG] app_env=${env.APP_ENV} db_host=${dbHost} db_name=${dbName} ssl=${env.DB_SSL}`);

module.exports = {
  APP_ENV: env.APP_ENV,
  DATABASE_URL: env.DATABASE_URL,
  DB_EXPECTED_ENV: env.DB_EXPECTED_ENV,
  DB_SSL: env.DB_SSL,
  DB_POOL_MIN: env.DB_POOL_MIN,
  DB_POOL_MAX: env.DB_POOL_MAX,
  DB_CONN_TIMEOUT_MS: env.DB_CONN_TIMEOUT_MS,
  ALLOW_PROD_ON_NONPROD: env.ALLOW_PROD_ON_NONPROD === 'true'
};
