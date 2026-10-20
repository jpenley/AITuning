module.exports = {
  PORT: Number(process.env.PORT ?? 3000),
  DATA_FILE: process.env.DATA_FILE ?? 'data.json',
  SESSION_TTL_HOURS: Number(process.env.SESSION_TTL_HOURS ?? 8),
};
